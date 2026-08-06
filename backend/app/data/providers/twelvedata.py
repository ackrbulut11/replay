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
# Güvenlik tavanı: tek bir fetch_ohlcv çağrısı en fazla bu kadar sayfa geriye gider.
MAX_PAGES = 20

# Ücretsiz plan: 8 kredi/dakika, 800 istek/gün. Süreç genelinde paylaşılan bu
# throttle dakika tavanına güvenli mesafe bırakır; günlük tavan burada
# izlenmiyor çünkü aşılırsa API zaten 429 ile açıkça bildiriyor (sessiz veri
# kaybı yok, çağıran taraf `_read_cache_window`/retry akışıyla zaten tolere ediyor).
MIN_REQUEST_INTERVAL_SECONDS = 8.0

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


def _throttle() -> None:
    global _last_request_at
    with _throttle_lock:
        elapsed = time.monotonic() - _last_request_at
        if elapsed < MIN_REQUEST_INTERVAL_SECONDS:
            time.sleep(MIN_REQUEST_INTERVAL_SECONDS - elapsed)
        _last_request_at = time.monotonic()


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

    for _ in range(MAX_PAGES):
        _throttle()
        try:
            resp = requests.get(
                BASE_URL,
                params={
                    "symbol": sym,
                    "interval": interval,
                    "outputsize": MAX_OUTPUTSIZE,
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
