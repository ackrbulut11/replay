"""
Twelve Data — Yahoo Finance'in intraday geçmiş sınırlarının (1h için 730 gün,
15dk/5dk için 58 gün, 1dk için 6 gün) ötesine geçmek için kullanılan ikincil
kaynak. `NasdaqProvider`/`BistProvider` ve `ForexProvider`, kendi Yahoo
çağrılarının max_start kırpması istenen başlangıcın gerisinde kaldığında
buraya düşer.

Neden ayrı bir üst düzey `IDataProvider` DEĞİL: `DataLoader.providers`,
frontend'in gönderdiği `provider` parametresiyle (binance/nasdaq/bist/forex)
sabit eşleşiyor; "twelvedata" hiçbir zaman doğrudan seçilecek bir uç değil.
Bu yüzden mevcut sağlayıcıların İÇİNDEN, yalnızca Yahoo'nun karşılayamadığı
gerçek boşluk için çağrılan bir yardımcı olarak yaşıyor — ücretsiz planın
800 istek/gün kotası her sembol/zaman dilimi geçişinde harcanmasın diye.

Canlı doğrulandı (2026-08): forex, NASDAQ hissesi ve BIST hissesi (ör. THYAO,
exchange=BIST/XIST) aynı ücretsiz anahtarla çalışıyor; 1h geçmiş her üçünde de
en az 2020'ye kadar kesintisiz sayfalanabiliyor.
"""

from __future__ import annotations

import threading
import time
from datetime import datetime

import pandas as pd
import requests

from ...core.config import settings

BASE_URL = "https://api.twelvedata.com/time_series"
MAX_OUTPUTSIZE = 5000
# Sayfa boyutunun inebileceği taban. Bunun altına inmek sayfa SAYISINI artırır
# ve her ek sayfa bir throttle slotu (aşağıda 8 sn) demek — küçük sayfa hızlı
# görünüp toplamda daha pahalıya patlar.
MIN_OUTPUTSIZE = 500
# Güvenlik tavanı: tek bir fetch_ohlcv çağrısı en fazla bu kadar sayfa geriye gider.
MAX_PAGES = 20

# Ücretsiz plan: 8 kredi/dakika, 800 istek/gün. Süreç genelinde paylaşılan bu
# throttle dakika tavanına güvenli mesafe bırakır; günlük tavan burada
# izlenmiyor çünkü aşılırsa API zaten 429 ile açıkça bildiriyor (sessiz veri
# kaybı yok, çağıran taraf `_read_cache_window`/retry akışıyla zaten tolere ediyor).
MIN_REQUEST_INTERVAL_SECONDS = 8.0

# Tek bir `fetch_ohlcv` çağrısının throttle kuyruğunda toplam bekleyebileceği
# süre. Bu tavan olmadan derin bir geçmiş isteği 20 sayfaya kadar çıkıp her
# sayfada 8 sn bekleyebiliyordu; ölçümde replay'de 1g -> 15dk geçişinin
# arkaplan derinleştirmesi 16 sn sürüyor ve o süre boyunca süreç genelindeki
# throttle'ı işgal ettiği için kullanıcının BİR SONRAKİ zaman dilimi geçişi de
# arkasında kuyruğa giriyordu ("10 saniyeden uzun bekletiyor" şikâyeti).
#
# Bütçe dolunca elde ne varsa onunla dönülür: eksik geçmiş hata değildir —
# çağıran taraf (`get_window` -> `_stitched_window`) bunu zaten tolere ediyor ve
# kalıcı pencere deposu (bkz. loader `_write_window_store`) her çağrıda biraz
# daha derine indiği için geçmiş turlar içinde kendiliğinden tamamlanır.
MAX_THROTTLE_WAIT_SECONDS = 10.0

# Mum süreleri — istenen aralık için kaç mum gerektiğini kestirmekte kullanılır.
_INTERVAL_MINUTES = {
    "1min": 1,
    "5min": 5,
    "15min": 15,
    "1h": 60,
    "4h": 240,
    "1day": 1440,
    "1week": 10080,
    "1month": 43200,
}

_TF_MAP = {
    "1m": "1min",
    "5m": "5min",
    "15m": "15min",
    "1h": "1h",
    "4h": "4h",
    "1d": "1day",
    "1w": "1week",
    "1mo": "1month",
}

_throttle_lock = threading.Lock()
_last_request_at = 0.0


def is_configured() -> bool:
    return bool(settings.TWELVE_API_KEY)


def _throttle(max_wait: float) -> float | None:
    """Bir istek slotu ayırır; beklenen süreyi döndürür, vazgeçilirse `None`.

    Beklemesi `max_wait`'i aşacaksa slot AYRILMAZ ve `None` döner — çağıran
    taraf o sayfadan vazgeçip elindekiyle devam eder.

    Uyku bilinçli olarak kilidin DIŞINDA yapılır. Eskiden `time.sleep` kilit
    tutulurken çağrılıyordu: bekleyen her iş parçacığı bir öncekinin uykusu
    bitene kadar kendi hesabını bile yapamıyordu, dolayısıyla ön plandaki bir
    kullanıcı isteği arkaplandaki bir derinleştirmenin arkasına takılıyor ve
    iptal edilse bile slotu boşaltamıyordu. Slot kilit altında ileri tarihe
    rezerve edilip uyku dışarıda yapılınca sıra aynı kalır, kilit ise
    mikrosaniyeler boyunca tutulur.
    """
    global _last_request_at
    with _throttle_lock:
        now = time.monotonic()
        wait = max(0.0, MIN_REQUEST_INTERVAL_SECONDS - (now - _last_request_at))
        if wait > max_wait:
            return None
        _last_request_at = now + wait

    if wait > 0:
        time.sleep(wait)
    return wait


# Takvim süresinden GERÇEK mum sayısına geçerken bölünecek katsayı — loader'daki
# `calendar_stretch` ile aynı mantık, ters yönde. Ham takvim hesabı kapalı
# piyasalarda mum sayısını fena hâlde abartıyor: NASDAQ'ta gün içi seans
# 6,5/24 saat ve haftada 5/7 gün, yani 31 takvim günü 8928 değil ~2400 adet
# 5dk mumu demek. Katsayı uygulanmazsa `outputsize` daima tavana (5000)
# yapışıyor — ölçümde tek bir 5dk sayfası 10,6 sn.
_DENSITY = {
    ("stock", True): 6.0,
    ("stock", False): 1.7,
    ("forex", True): 1.6,
    ("forex", False): 1.4,
}

_INTRADAY_INTERVALS = ("1min", "5min", "15min", "1h", "4h")


def _page_size(
    interval: str, start_time: datetime, end_time: datetime, symbol_style: str
) -> int:
    """İstenen aralık için makul sayfa boyutu.

    `outputsize` eskiden koşulsuz 5000'di: pencere zaten `bars_before +
    bars_after` (varsayılan 2500) mumla kırpıldığı için fazlası indirilip
    atılıyordu. Ölçümde 5dk'da 5000 mumluk sayfa 10,6 sn, 2500 mumluk sayfa
    2,7 sn — yani boşa inen veri doğrudan kullanıcının beklediği süreye
    yazılıyordu.

    Kestirim bilerek CÖMERTTİR (yoğunluk düzeltmesinin üstüne ayrıca pay
    eklenir): fazla tahmin etmek biraz fazla veri indirmek, eksik tahmin etmek
    ise fazladan bir SAYFA — yani bir throttle slotu (8 sn) — demektir.
    """
    minutes = _INTERVAL_MINUTES.get(interval)
    if not minutes:
        return MAX_OUTPUTSIZE

    span_minutes = max((end_time - start_time).total_seconds() / 60.0, 0.0)
    density = _DENSITY.get((symbol_style, interval in _INTRADAY_INTERVALS), 1.0)
    needed = int(span_minutes / minutes / density * 1.5) + 1
    return max(MIN_OUTPUTSIZE, min(needed, MAX_OUTPUTSIZE))


def _normalize_symbol(symbol: str, symbol_style: str) -> str:
    sym = symbol.upper().strip()
    if sym.endswith(".IS"):
        sym = sym[:-3]
    # Forex: dahili "EURUSD" -> Twelve Data "EUR/USD".
    if symbol_style == "forex" and len(sym) == 6 and sym.isalpha():
        return f"{sym[:3]}/{sym[3:]}"
    return sym


def _parse_datetime(value: str) -> datetime:
    fmt = "%Y-%m-%d %H:%M:%S" if len(value) > 10 else "%Y-%m-%d"
    return datetime.strptime(value, fmt)


def fetch_ohlcv(
    symbol: str,
    timeframe: str,
    start_time: datetime,
    end_time: datetime,
    symbol_style: str,
) -> pd.DataFrame:
    """
    `[start_time, end_time]` aralığını Twelve Data'dan çeker.

    Tek istek en fazla `MAX_OUTPUTSIZE` mum verdiğinden aralık `end_date`
    geriye kaydırılarak sayfalanır; sağlayıcının kendi geçmişi bittiğinde
    (aynı en eski tarih tekrar dönerse) sessizce durur — bu "hata" değildir,
    ücretsiz planın veri ufku orada bitiyor demektir.

    `TWELVE_API_KEY` boşsa veya zaman dilimi desteklenmiyorsa boş DataFrame
    döner; çağıran taraf bunu "bu kaynaktan alınamadı" olarak yorumlamalı,
    hataya düşürmemeli (Yahoo'nun kırpılmış sonucuyla devam edebilmeli).
    """
    empty = pd.DataFrame(columns=["timestamp", "open", "high", "low", "close", "volume"])
    if not is_configured():
        return empty

    interval = _TF_MAP.get(timeframe)
    if not interval:
        return empty

    sym = _normalize_symbol(symbol, symbol_style)
    rows: list[dict] = []
    cursor_end = end_time
    wait_budget = MAX_THROTTLE_WAIT_SECONDS

    for _ in range(MAX_PAGES):
        waited = _throttle(wait_budget)
        if waited is None:
            # Throttle bütçesi doldu: kalan sayfaları beklemek yerine elde
            # olanla dön (bkz. MAX_THROTTLE_WAIT_SECONDS).
            print(
                f"Twelve Data throttle bütçesi doldu ({sym} {interval}); "
                f"{len(rows)} mumla yetinildi"
            )
            break
        wait_budget -= waited

        try:
            resp = requests.get(
                BASE_URL,
                params={
                    "symbol": sym,
                    "interval": interval,
                    "outputsize": _page_size(
                        interval, start_time, cursor_end, symbol_style
                    ),
                    "order": "DESC",
                    "apikey": settings.TWELVE_API_KEY,
                    "end_date": cursor_end.strftime("%Y-%m-%d %H:%M:%S"),
                },
                timeout=20,
            )
            data = resp.json()
        except Exception:
            break

        values = data.get("values")
        if not values:
            break

        for v in values:
            try:
                ts = _parse_datetime(v["datetime"])
            except (KeyError, ValueError):
                continue
            if ts < start_time:
                continue
            try:
                rows.append(
                    {
                        "timestamp": ts,
                        "open": float(v["open"]),
                        "high": float(v["high"]),
                        "low": float(v["low"]),
                        "close": float(v["close"]),
                        "volume": float(v.get("volume") or 0.0),
                    }
                )
            except (KeyError, TypeError, ValueError):
                continue

        oldest = _parse_datetime(values[-1]["datetime"])
        # `oldest >= cursor_end` sayfa ilerlemiyor demektir (sağlayıcının
        # geçmişi bitti) — devam edersek sonsuz döngüye girerdik.
        if oldest <= start_time or oldest >= cursor_end:
            break
        cursor_end = oldest

    if not rows:
        return empty

    return (
        pd.DataFrame(rows)
        .drop_duplicates(subset="timestamp")
        .sort_values("timestamp")
        .reset_index(drop=True)
    )
