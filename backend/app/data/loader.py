from __future__ import annotations

import json
import os
import time
import pandas as pd
import threading
from collections import OrderedDict, defaultdict
from datetime import datetime, timedelta
from ..core.config import settings
from app.utils.time import utc_now
from .providers.binance import BinanceProvider
from .providers.nasdaq import NasdaqProvider
from .providers.bist import BistProvider
from .providers.forex import ForexProvider

# Replay penceresinin varsayılan ölçüleri — ilk boyamada gösterilen "hızlı"
# pencere. Toplam ~2500 mum, sağlayıcıdan üç sayfa (sayfa başına 1000 mum) demek.
#
# Arkadaki pay yalnızca gösterge ısınması değil, kullanıcının konumun gerisini
# GÖREBİLMESİ içindir: 500 mumla manuel backtest yapılamıyordu. Bu pencere de
# nihai derinlik değil — istemci ilk pencereyi çizdikten sonra arkaplanda daha
# geriye doğru genişletiyor (bkz. frontend REPLAY_HISTORY_BARS), böylece ilk
# görüntü hızlı gelirken geçmiş derinliği de kısıtlı kalmıyor.
#
# Öndeki pay replay'in ilerleyebileceği mesafedir; 1000 mum, 1 sn/mum hızda
# ~16 dakikalık kesintisiz oynatma demek.
WINDOW_BARS_BEFORE = 1500
WINDOW_BARS_AFTER = 1000

# Pencere başlangıcının inebileceği en eski tarih. `bars_before` büyük ve zaman
# dilimi kabaysa (5000 haftalık = ~96 yıl) hesap 1970 öncesine düşebiliyor;
# `datetime.timestamp()` orada Windows'ta OSError fırlatıyor. Piyasa verisi bu
# tarihin gerisine zaten uzanmadığı için taban veri kaybına yol açmaz.
WINDOW_MIN_START = datetime(1971, 1, 1)

# Bellekte tutulacak azami pencere sayısı (RULES.md #24: sınırsız ham veri
# biriktirmek yasak). Bir pencere ~1500 satır, yani birkaç yüz KB.
WINDOW_CACHE_MAX = 40

# ─── Kalıcı pencere deposu ───────────────────────────────────────────────────
#
# Replay pencereleri ana parquet'e YAZILAMAZ (gerekçe `_window_at` docstring'inde:
# ana önbellek bitişik bir aralık olmak zorunda, pencereler ise geçmişin dağınık
# noktalarında duruyor ve retention budaması onları anında silerdi). Ama hiç
# saklamamak da israftı: süreç yeniden başladığında ya da RAM'deki LRU taştığında
# aynı pencere sağlayıcıdan (Yahoo/Binance) baştan indiriliyordu — bir ağ isteği
# daha az demek her replay dilim geçişinde birikiyor.
#
# Bu yüzden ana önbellekten AYRI, ARALIK FARKINDALIĞI olan bir yan depo var:
# parquet'in yanındaki manifest hangi aralıkların gerçekten indirildiğini tutar.
# Bitişiklik varsayımı yoktur — çapayı KAPSAYAN aralık aranır, bulunamazsa
# sağlayıcıya gidilir. Böylece 2019 ve 2024 pencereleri aynı dosyada yaşayabilir
# ve aradaki boşluk yanlışlıkla "veri var" sanılmaz.
WINDOW_STORE_DIRNAME = "windows"

# Depo, kullanılmayan aralıkları atarak bu tavanın altında tutulur (RULES.md #24).
# Budama en eskiyi değil EN AZ KULLANILANI atar: replay'de 2019'da çalışan bir
# kullanıcı için "en eski" tam da elde tutulması gereken aralıktır.
WINDOW_STORE_ROW_LIMIT = {
    "1m": 60000,
    "5m": 60000,
    "15m": 60000,
    "1h": 30000,
    "4h": 30000,
    "1d": 10000,
    "1w": 5000,
    "1mo": 5000,
}

# Aralığın "son kullanım" damgası bu kadar eskiyse manifest yeniden yazılır.
# Her okumada diske yazmamak için: damganın saniye hassasiyetinde olması gerekmiyor,
# amacı yalnızca budamada hangi aralığın gözden çıkarılabileceğini bilmek.
WINDOW_STORE_TOUCH_INTERVAL = 300.0

# Çapa, sağlayıcının o zaman dilimindeki geçmişinden de eskiyse pencere boş
# dönüyordu (kullanıcı tarafında "Veri Yüklenemedi" ekranı): 1g'de 2019'a kesip
# 15dk'ya geçmek tipik durum — Yahoo 15dk'da yalnızca son ~58 günü veriyor.
# Bu durumda pencere, o zaman diliminin EN ESKİ mumuna çapalanarak döner;
# istemci konumu oraya taşıyıp uyarı gösterir (bkz. `_earliest_window`).
#
# Yoklama "şimdi"den geriye bu kadar MUM ister. Sağlayıcıların kendi tavanı
# (Yahoo: 1dk 6 gün, 15dk 58 gün, 1s 700 gün) bu aralığın içinde kaldığı için
# tek istekte gerçekten en eski muma ulaşılır; tavanı olmayan sağlayıcılarda
# (Binance) da indirme bu sayıyla sınırlı kalır, tüm geçmiş inmez.
EARLIEST_PROBE_BARS = 5000

# Bir mumun süresi. Pencerenin sınırlarını mum SAYISINDAN tarihe çevirmek için
# gerekli; tarih aralığıyla çalışmak zaman dilimi değiştikçe mum sayısını
# öngörülemez kılıyordu (aynı 30 gün 1g'de 30, 5dk'da 8640 mum).
TIMEFRAME_DELTAS = {
    "1m": timedelta(minutes=1),
    "5m": timedelta(minutes=5),
    "15m": timedelta(minutes=15),
    "1h": timedelta(hours=1),
    "4h": timedelta(hours=4),
    "1d": timedelta(days=1),
    "1w": timedelta(weeks=1),
    "1mo": timedelta(days=30),
}


def timeframe_delta(timeframe: str) -> timedelta:
    delta = TIMEFRAME_DELTAS.get(timeframe)
    if delta is None:
        raise ValueError(f"Bilinmeyen zaman dilimi: {timeframe}")
    return delta


def lookback_start_for_bars(end_dt: datetime, timeframe: str, bars: int) -> datetime:
    """`bars` kadar mumu güvenle kapsayacak başlangıç tarihini hesaplar.

    Sabit bir tabloya (ör. "1h için her zaman 3 yıl") göre değil, istenen mum
    sayısına göre ölçeklenir. Aksi halde 200 mumluk küçük bir istek bile
    yıllarca veri çekip sayfa başına 1000 mum dönen API'lerde onlarca sayfalık
    isteğe (ve dakikalarca süren taramalara) neden olabiliyordu.

    Piyasa kapalı saatleri/hafta sonları için pay bırakılır: gün-içi zaman
    dilimlerinde x3, günlük ve üzerinde x1.6, artı sabit bir tampon.
    """
    delta = TIMEFRAME_DELTAS.get(timeframe, timedelta(days=1))
    raw_days = (delta.total_seconds() / 60.0 * max(bars, 1)) / 1440.0
    if timeframe in _INTRADAY_TIMEFRAMES:
        padded_days = raw_days * 3 + 5
    else:
        padded_days = raw_days * 1.6 + 10
    return end_dt - timedelta(days=padded_days)


# Mum sayısını tarihe çevirirken piyasanın KAPALI olduğu zamanı telafi eden pay.
#
# `anchor - delta * bars` yalnızca 7/24 çalışan bir piyasada doğru: Binance'te
# 500 saat geriye gitmek 500 mumdur. BIST/NASDAQ'ta ise günde ~7-8 saat ve
# haftada 5 gün işlem olduğu için aynı hesap 500 mum yerine ~145 mum getiriyordu;
# günlükte 500 takvim günü ~345 işlem gününe denk geliyor (kullanıcının gördüğü
# "345 mum" tam olarak buydu). İstenen ölçü takvim değil MUM sayısı olduğundan
# aralık bu katsayıyla genişletilir, sonuç `_trim_window` ile tam sayıya indirilir.
_INTRADAY_TIMEFRAMES = ("1m", "5m", "15m", "1h", "4h")


def calendar_stretch(provider_name: str, timeframe: str) -> float:
    provider_name = provider_name.lower()
    intraday = timeframe in _INTRADAY_TIMEFRAMES

    # Kripto 7/24: takvim ile mum birebir örtüşür.
    if provider_name == "binance":
        return 1.0

    # Forex hafta sonu kapalı, gün içinde kesintisiz (7/5 ≈ 1.4; tatil payıyla).
    if provider_name in ("forex", "fx"):
        return 1.6

    # Hisse senedi: hafta sonu + resmi tatil + seans saatleri.
    # NASDAQ gün içi en dar durum: 168 takvim saati / (6.5 sa × 5 gün) ≈ 5.2.
    if intraday:
        return 6.0
    # Günlük ve üzeri: 365 / ~250 işlem günü ≈ 1.46; tatil payıyla.
    return 1.7


class DataLoader:
    def __init__(self):
        self._locks = defaultdict(threading.Lock)
        self._global_lock = threading.Lock()
        
        # Proje kök dizin yolunu çözümlüyor
        current_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = current_dir
        while project_root and not os.path.exists(os.path.join(project_root, "storage")):
            parent = os.path.dirname(project_root)
            if parent == project_root:
                break
            project_root = parent
        self.project_root = project_root
        
        self.providers = {
            "binance": BinanceProvider(),
            "nasdaq": NasdaqProvider(),
            "bist": BistProvider(),
            "forex": ForexProvider(),
            "fx": ForexProvider(),
        }
        
        # In-memory L1 cache: key -> (mtime, df)
        self._mem_cache = {}

        # Replay pencereleri: ana parquet'ten ayrı, sınırlı bir LRU.
        # Ana önbelleğe karışmaz — bkz. get_window.
        self._window_cache: OrderedDict[tuple, pd.DataFrame] = OrderedDict()
        self._window_lock = threading.Lock()

    def get_provider(self, provider_name: str):
        provider = self.providers.get(provider_name.lower())
        if not provider:
            raise ValueError(f"Unknown data provider: {provider_name}. Choose from: binance, nasdaq, bist, forex.")
        return provider

    def _get_cache_path(self, provider_name: str, symbol: str, timeframe: str) -> str:
        return os.path.join(
            self.project_root, 
            "storage", 
            "market_data", 
            provider_name.lower(), 
            f"{symbol.upper()}_{timeframe}.parquet"
        )

    def _get_file_lock(self, key_path: str) -> threading.Lock:
        with self._global_lock:
            return self._locks[key_path]

    def _retention_limit(self, timeframe: str) -> int | None:
        if timeframe in ("1m", "5m", "15m"):
            return settings.RETENTION_1M
        if timeframe in ("1h", "4h"):
            return settings.RETENTION_1H
        if timeframe in ("1d", "1w", "1mo"):
            return settings.RETENTION_1D
        return None

    def get_coverage(self, provider_name: str, symbol: str, timeframe: str) -> dict | None:
        """
        Bir zaman dilimi için önbellekte hangi tarih aralığının bulunduğunu döndürür.

        Yalnızca parquet'in `timestamp` sütununu okur; tüm mumları belleğe
        almadan ilk/son tarihi verir. Amaç, replay sırasında zaman dilimi
        değiştirilirken hedef tarihin o çözünürlükte mevcut olup olmadığını
        veri indirmeden anlayabilmektir (RULES.md #24-27 gereği düşük zaman
        dilimleri çok daha kısa bir geçmişi saklar).

        Önbellek yoksa `None` döner — "veri yok" değil, "bilinmiyor" demektir;
        çağıran taraf bu durumda engelleme yapmamalıdır.
        """
        cache_path = self._get_cache_path(provider_name, symbol, timeframe)
        if not os.path.exists(cache_path):
            return None

        try:
            df = pd.read_parquet(cache_path, columns=["timestamp"])
        except Exception:
            return None

        if df.empty:
            return None

        first = pd.to_datetime(df["timestamp"].iloc[0])
        last = pd.to_datetime(df["timestamp"].iloc[-1])
        return {
            "first": first.isoformat(),
            "last": last.isoformat(),
            "bars": int(len(df)),
        }

    def get_window(
        self,
        provider_name: str,
        symbol: str,
        timeframe: str,
        anchor: datetime,
        bars_before: int = WINDOW_BARS_BEFORE,
        bars_after: int = WINDOW_BARS_AFTER,
    ) -> pd.DataFrame:
        """
        `anchor` etrafındaki pencere.

        Yalnızca istenen zaman diliminin KENDİ ulaşabildiği geçmiş kullanılır —
        ikincil bir kaynaktan (Twelve Data) dolgu yapılmaz, başka bir zaman
        diliminden dikiş kurulmaz (bkz. TradingView'in Bar Replay'i de aynı
        şekilde davranıyor: derin geçmiş yalnızca sağlayıcının kendi veri
        derinliği kadar). Gerekçe performans: dolgu/dikiş saniyeler süren ekstra
        istekler demekti — ölçümde 1g'den 15dk'ya geçiş 16 sn'ye çıkıyordu.

        Çapa, sağlayıcının bu zaman dilimindeki geçmişinden eskiyse pencerenin
        TAMAMI çapanın ilerisinde döner (istenen dilimin EN ESKİ ulaşılabilir
        muma çapalanmış hâli, bkz. `_earliest_window`); istemci bunu görüp
        konumu oraya taşır ve uyarı gösterir (bkz. App.tsx replay dalı).
        """
        return self._plain_window(
            provider_name, symbol, timeframe, anchor, bars_before, bars_after
        )

    def _plain_window(
        self,
        provider_name: str,
        symbol: str,
        timeframe: str,
        anchor: datetime,
        bars_before: int,
        bars_after: int,
    ) -> pd.DataFrame:
        """
        Tek zaman diliminden pencere: normal pencere, o boşsa bu dilimde
        ulaşılabilen en eski muma çapalanmış pencere. Karma kurguya girmez.

        Asıl istek HATA verirse de en eskiye çekilme denenir: Yahoo, verisinin
        başlangıcından çok önceki aralıklarda boş değil 400 dönüyor (GARAN'da
        1995) ve bu, gün içi dilimler sorunsuz geri çekilirken 1g'nin 500'le
        düşmesi gibi bir tutarsızlık üretiyordu. Geri çekilme de boş dönerse
        özgün hata yükseltilir — gerçek bir sağlayıcı arızası maskelenmesin.
        """
        try:
            df = self._window_at(
                provider_name, symbol, timeframe, anchor, bars_before, bars_after
            )
        except Exception as exc:
            fallback = self._earliest_window(
                provider_name, symbol, timeframe, anchor, bars_before, bars_after
            )
            if fallback.empty:
                raise
            print(f"Pencere isteği başarısız, en eskiye çekildi ({symbol} {timeframe}): {exc}")
            return fallback

        if not df.empty:
            return df
        return self._earliest_window(
            provider_name, symbol, timeframe, anchor, bars_before, bars_after
        )

    def _window_at(
        self,
        provider_name: str,
        symbol: str,
        timeframe: str,
        anchor: datetime,
        bars_before: int = WINDOW_BARS_BEFORE,
        bars_after: int = WINDOW_BARS_AFTER,
    ) -> pd.DataFrame:
        """
        `anchor` etrafındaki sabit sayıda mumu döndürür — replay için.

        Neden `load_data` yetmiyor: parquet önbelleği BİTİŞİK bir aralık olmak
        zorunda, bu yüzden `load_data` istenen başlangıç önbelleğin başlangıcından
        eskiyse aradaki TÜM boşluğu indiriyor (bkz. aynı dosyada prefix çekimi).
        2019'daki 1500 mumu istemek araya giren altı yılı da indirmek demekti:
        ölçümde 15dk için ~210 sayfa / dakikalar.

        Burada maliyet mesafeden bağımsızdır: hangi tarihe bakılırsa bakılsın
        yalnızca `bars_before + bars_after` mum çekilir (~2 sayfa, ~1 s). Replay
        zaten pencereyle çalışıyor — konumun ilerisi görünmüyor (lookahead),
        gerisi de gösterge ısınması kadar gerekli.

        Sonuç ana parquet'e YAZILMAZ: yazmak bitişikliği bozardı ve retention
        budaması pencereyi anında silerdi. Bunun yerine süreç içi sınırlı bir
        LRU'da tutulur (RULES.md #24: sınırsız ham veri biriktirmek yasak).

        `bars_before`/`bars_after` MUM sayısıdır, takvim süresi değil: kapalı
        piyasalarda aralık `calendar_stretch` ile genişletilir ve sonuç istenen
        sayıya indirilir.
        """
        # Hisse/forex sağlayıcıları 4h'i doğrudan vermez; `load_data` gibi burada
        # da 1h'ten yeniden örneklenir. Aksi halde replay sürerken 4h'e geçmek
        # "Unsupported timeframe" ile 400 dönüyordu.
        if provider_name.lower() in ("nasdaq", "bist", "forex", "fx") and timeframe == "4h":
            df_1h = self._plain_window(
                provider_name, symbol, "1h", anchor, bars_before * 4, bars_after * 4
            )
            if df_1h.empty:
                return df_1h
            return self._trim_window(
                self.resample_ohlcv(df_1h, "4h"), anchor, bars_before, bars_after
            )

        delta = timeframe_delta(timeframe)
        stretch = calendar_stretch(provider_name, timeframe)
        start_time = max(anchor - delta * int(bars_before * stretch + 1), WINDOW_MIN_START)
        end_time = anchor + delta * int(bars_after * stretch + 1)

        # 1. Ana önbellek bu kadar mumu zaten taşıyorsa oradan kes: ağa hiç çıkma.
        #    Kaba zaman dilimleri (1g/1h) tüm geçmişi taşıdığı için çoğu geçiş
        #    bu daldan döner ve anlık gelir.
        cached = self._read_cache_window(
            provider_name, symbol, timeframe, anchor, bars_before, bars_after, start_time
        )
        if cached is not None:
            return cached

        # Önbellek anahtarı İSTENEN ölçülerden üretilir (tarihlerden değil):
        # aşağıdaki genişletme denemesi start_time'ı değiştirebiliyor, anahtar
        # tarihe bağlı olsaydı aynı istek her seferinde ıskalardı.
        cache_key = self._window_cache_key(
            provider_name, symbol, timeframe, anchor, bars_before, bars_after
        )
        with self._window_lock:
            hit = self._window_cache.get(cache_key)
            if hit is not None:
                self._window_cache.move_to_end(cache_key)
                return hit.copy()

        # 3. Kalıcı yan depo. RAM'deki LRU yalnızca TAM ölçü eşleşmesinde
        #    (aynı çapa + aynı mum sayısı) tutuyor ve süreç yeniden başlayınca
        #    boşalıyor; bu depo aralık farkındalıklı olduğu için replay ilerleyip
        #    çapa kaydığında da isabet eder ve yeniden başlatmaya dayanır.
        stored = self._read_window_store(
            provider_name, symbol, timeframe, anchor, bars_before, bars_after, start_time
        )
        if stored is not None:
            return stored

        provider = self.get_provider(provider_name)
        # `allow_gap_fill=False`: replay penceresi yalnızca bu dilimin KENDİ
        # ulaşabildiği geçmişi göstermeli (bkz. `get_window` docstring'i).
        # İkincil kaynağa (Twelve Data) düşmek burada saniyeler sürüyordu.
        df = provider.fetch_ohlcv(symbol, timeframe, start_time, end_time, allow_gap_fill=False)

        if df is None or df.empty:
            return pd.DataFrame(columns=["timestamp", "open", "high", "low", "close", "volume"])

        df = df.sort_values("timestamp").reset_index(drop=True)

        # Tatil yoğunluğu tahmini aşmışsa istenen mum sayısı dolmamış olabilir:
        # eksik oranında genişletilmiş bir aralıkla BİR kez daha dene.
        #
        # Yalnızca veri SOL SINIRDA kesilmişse denenir. Dönen ilk mum istenen
        # başlangıcın belirgin şekilde ilerisindeyse sebep katsayı değil,
        # sağlayıcının geçmişinin bitmiş olmasıdır (BTCUSDT 2017'de başlar);
        # o durumda genişletmek yalnızca boşa bir istek daha demektir.
        got_before = int((df["timestamp"] <= anchor).sum())
        cut_at_left_edge = df["timestamp"].min() <= start_time + delta * int(20 * stretch)
        if 0 < got_before < bars_before and cut_at_left_edge:
            factor = min(bars_before / got_before, 4.0)
            # datetime.timestamp() 1970 öncesi tarihlerde Windows'ta OSError
            # fırlatıyor; taban olmadan uzun geçmişli semboller sağlayıcıyı
            # geçersiz bir tarihle çağırıyordu.
            wider_start = max(anchor - (anchor - start_time) * factor, WINDOW_MIN_START)
            if wider_start < start_time:
                retry = provider.fetch_ohlcv(
                    symbol, timeframe, wider_start, end_time, allow_gap_fill=False
                )
                if retry is not None and len(retry) > len(df):
                    df = retry.sort_values("timestamp").reset_index(drop=True)

        # Depoya KIRPILMADAN önceki hali yazılır: indirme bedeli zaten ödendi,
        # kırpılmış hali saklamak bir sonraki (biraz kaymış çapalı) isteği
        # yeniden sağlayıcıya göndermek olurdu.
        self._write_window_store(provider_name, symbol, timeframe, df)

        df = self._trim_window(df, anchor, bars_before, bars_after)

        with self._window_lock:
            self._window_cache[cache_key] = df
            self._window_cache.move_to_end(cache_key)
            # En eski pencereleri at: bellekte sınırsız birikmesin.
            while len(self._window_cache) > WINDOW_CACHE_MAX:
                self._window_cache.popitem(last=False)

        return df.copy()

    def _earliest_window(
        self,
        provider_name: str,
        symbol: str,
        timeframe: str,
        anchor: datetime,
        bars_before: int,
        bars_after: int,
    ) -> pd.DataFrame:
        """
        Sağlayıcının bu zaman diliminde verdiği EN ESKİ muma çapalanmış pencere.

        Yalnızca `_window_at` boş döndüğünde çağrılır. "Şimdi"den geriye tek bir
        geniş istek atılır (bkz. EARLIEST_PROBE_BARS): kendi tavanı olan
        sağlayıcılar isteği zaten kırptığı için dönen ilk mum gerçekten
        ulaşılabilen en eski mumdur.

        Dönen mumların hepsi çapadan YENİ değilse boş döner: o zaman boşluğun
        sebebi geçmişin bitmesi değil başka bir sorundur (sembol hatası, geçici
        sağlayıcı arızası) ve kullanıcıyı sessizce alakasız bir tarihe taşımak
        yerine hatanın görünmesi doğru olur.
        """
        empty = pd.DataFrame(columns=["timestamp", "open", "high", "low", "close", "volume"])

        try:
            delta = timeframe_delta(timeframe)
        except ValueError:
            return empty

        stretch = calendar_stretch(provider_name, timeframe)
        now = utc_now()
        probe_start = max(
            now - delta * int(EARLIEST_PROBE_BARS * stretch), WINDOW_MIN_START
        )

        try:
            provider = self.get_provider(provider_name)
            # Bu yoklama da ikincil kaynağa düşmemeli: amaç sağlayıcının
            # KENDİ tavanını bulmak, dolgulanmış bir tavanı değil.
            df = provider.fetch_ohlcv(symbol, timeframe, probe_start, now, allow_gap_fill=False)
        except Exception as exc:
            # Geri çekilme yolu "olsa iyi olur" niteliğinde: burada patlamak,
            # asıl istekteki boş sonucu bir 500'e çevirmek olurdu.
            print(f"En eski mum yoklaması başarısız ({symbol} {timeframe}): {exc}")
            return empty

        if df is None or df.empty:
            return empty

        df = df.sort_values("timestamp").reset_index(drop=True)
        earliest = df["timestamp"].min()
        if earliest <= anchor:
            return empty

        return self._trim_window(df, earliest, bars_before, bars_after).reset_index(drop=True)

    # ─── Kalıcı pencere deposu ───────────────────────────────────────────────
    # Gerekçe ve tasarım için dosya başındaki WINDOW_STORE_DIRNAME bloğuna bak.

    def _window_store_path(self, provider_name: str, symbol: str, timeframe: str) -> str:
        """Yan depo, ana önbellek dosyasının yanındaki `windows/` alt dizinindedir.

        Yol bilerek `_get_cache_path` ÜZERİNDEN türetilir: iki önbellek tek bir
        kök kavramına bağlı kalsın ve o kökü değiştiren (ya da testlerde devre
        dışı bırakan) taraf ikisini birden ele alsın.
        """
        base = self._get_cache_path(provider_name, symbol, timeframe)
        head, tail = os.path.split(base)
        return os.path.join(head, WINDOW_STORE_DIRNAME, tail)

    @staticmethod
    def _window_store_meta_path(store_path: str) -> str:
        return store_path[: -len(".parquet")] + ".json"

    def _read_window_store_meta(self, store_path: str) -> list[dict]:
        """Manifestteki aralıkları döndürür. Bozuk/eksik manifest = aralık yok."""
        try:
            with open(self._window_store_meta_path(store_path), "r", encoding="utf-8") as fh:
                ranges = json.load(fh).get("ranges", [])
        except Exception:
            return []

        parsed = []
        for item in ranges:
            try:
                parsed.append(
                    {
                        "start": pd.Timestamp(item["start"]).to_pydatetime(),
                        "end": pd.Timestamp(item["end"]).to_pydatetime(),
                        "used": float(item.get("used", 0.0)),
                    }
                )
            except Exception:
                continue
        return parsed

    def _write_window_store_meta(self, store_path: str, ranges: list[dict]) -> None:
        payload = {
            "ranges": [
                {
                    "start": r["start"].isoformat(),
                    "end": r["end"].isoformat(),
                    "used": r["used"],
                }
                for r in ranges
            ]
        }
        try:
            os.makedirs(os.path.dirname(store_path), exist_ok=True)
            with open(self._window_store_meta_path(store_path), "w", encoding="utf-8") as fh:
                json.dump(payload, fh)
        except Exception as exc:
            print(f"Pencere deposu manifesti yazılamadı ({store_path}): {exc}")

    @staticmethod
    def _merge_ranges(ranges: list[dict], timeframe: str) -> list[dict]:
        """Örtüşen/bitişik aralıkları birleştirir.

        "Bitişik" ölçüsü bir mum süresidir: art arda indirilmiş iki pencerenin
        arasında tam olarak sıfır boşluk olması beklenemez (mum ızgarası,
        kapalı piyasa). Bir mumluk pay bırakılmazsa aynı sürekli geçmiş
        onlarca parçaya bölünür ve hiçbiri tek başına çapayı kapsamaz.
        """
        if not ranges:
            return []
        try:
            tolerance = timeframe_delta(timeframe)
        except ValueError:
            tolerance = timedelta(days=1)

        ordered = sorted(ranges, key=lambda r: r["start"])
        merged = [dict(ordered[0])]
        for current in ordered[1:]:
            last = merged[-1]
            if current["start"] <= last["end"] + tolerance:
                last["end"] = max(last["end"], current["end"])
                last["used"] = max(last["used"], current["used"])
            else:
                merged.append(dict(current))
        return merged

    def _read_window_store(
        self,
        provider_name: str,
        symbol: str,
        timeframe: str,
        anchor: datetime,
        bars_before: int,
        bars_after: int,
        start_time: datetime,
    ) -> pd.DataFrame | None:
        """Yan depo çapayı kapsayan bir aralık taşıyorsa pencereyi oradan keser.

        Yeterlilik ölçütü `_read_cache_window` ile aynıdır: çapanın gerisinde
        `bars_before` mum varsa, ya da aralık zaten istenen başlangıcın
        gerisine uzanıyorsa (yani sağlayıcıda da daha fazlası yok) bu depo
        işimizi görür. Karşılanamıyorsa `None` — "veri yok" değil, "buradan
        karşılanamaz" demektir.
        """
        store_path = self._window_store_path(provider_name, symbol, timeframe)
        if not os.path.exists(store_path):
            return None

        ranges = self._read_window_store_meta(store_path)
        covering = next(
            (r for r in ranges if r["start"] <= anchor <= r["end"]),
            None,
        )
        if covering is None:
            return None

        try:
            df = pd.read_parquet(store_path)
        except Exception:
            return None
        if df.empty:
            return None

        df["timestamp"] = pd.to_datetime(df["timestamp"])
        # YALNIZCA çapayı kapsayan aralığın satırları: manifestteki diğer
        # aralıklar geçmişin başka noktalarında ve aradaki boşluk gerçek bir
        # veri boşluğu — hepsini birlikte kesmek olmayan mumları varmış gibi
        # gösterirdi.
        block = df[(df["timestamp"] >= covering["start"]) & (df["timestamp"] <= covering["end"])]
        if block.empty:
            return None

        enough_history = int((block["timestamp"] <= anchor).sum()) >= bars_before
        if not enough_history and covering["start"] > start_time:
            return None

        sliced = self._trim_window(block, anchor, bars_before, bars_after)
        if sliced.empty:
            return None

        # Budama sırasında hangi aralığın gözden çıkarılabileceğini bilmek için
        # son kullanım damgasını tazele (çok sık yazmamak için aralıklı).
        now = time.time()
        if now - covering["used"] > WINDOW_STORE_TOUCH_INTERVAL:
            covering["used"] = now
            self._write_window_store_meta(store_path, ranges)

        return sliced.reset_index(drop=True)

    def _write_window_store(
        self, provider_name: str, symbol: str, timeframe: str, df: pd.DataFrame
    ) -> None:
        """Sağlayıcıdan yeni gelen pencereyi yan depoya ekler.

        Depodaki satır sayısı tavanı aşarsa (RULES.md #24) EN AZ KULLANILAN
        aralıklar bütün olarak atılır. Yarım aralık bırakmak, manifestin
        "bu aralık elimde" sözünü yalan çıkarırdı.
        """
        if df.empty:
            return

        store_path = self._window_store_path(provider_name, symbol, timeframe)
        lock = self._get_file_lock(store_path)

        with lock:
            existing = None
            if os.path.exists(store_path):
                try:
                    existing = pd.read_parquet(store_path)
                    existing["timestamp"] = pd.to_datetime(existing["timestamp"])
                except Exception:
                    existing = None

            fresh = df.copy()
            fresh["timestamp"] = pd.to_datetime(fresh["timestamp"])
            # Yeni aralık, GERÇEKTEN elde edilen mumların sınırlarıdır; istenen
            # pencere değil. İstek sağlayıcı tavanı ya da throttle bütçesi
            # yüzünden kırpılmış olabilir ve manifest indirilmemiş bir aralığı
            # "elimde" diye işaretlememeli.
            new_range = {
                "start": fresh["timestamp"].min().to_pydatetime(),
                "end": fresh["timestamp"].max().to_pydatetime(),
                "used": time.time(),
            }

            merged_df = (
                fresh
                if existing is None or existing.empty
                else pd.concat([existing, fresh], ignore_index=True)
            )
            merged_df = (
                merged_df.drop_duplicates(subset=["timestamp"], keep="last")
                .sort_values("timestamp")
                .reset_index(drop=True)
            )

            ranges = self._merge_ranges(
                self._read_window_store_meta(store_path) + [new_range], timeframe
            )

            limit = WINDOW_STORE_ROW_LIMIT.get(timeframe)
            if limit is not None and len(merged_df) > limit:
                # En az kullanılandan başlayarak aralık at; yeni yazılan aralık
                # en taze `used` damgasına sahip olduğu için son atılan olur.
                for victim in sorted(ranges, key=lambda r: r["used"]):
                    if len(merged_df) <= limit or len(ranges) <= 1:
                        break
                    ranges = [r for r in ranges if r is not victim]
                    merged_df = merged_df[
                        (merged_df["timestamp"] < victim["start"])
                        | (merged_df["timestamp"] > victim["end"])
                    ].reset_index(drop=True)

            try:
                os.makedirs(os.path.dirname(store_path), exist_ok=True)
                merged_df.to_parquet(store_path, index=False)
            except Exception as exc:
                print(f"Pencere deposu yazılamadı ({store_path}): {exc}")
                return

            self._write_window_store_meta(store_path, ranges)

    def _window_cache_key(
        self,
        provider_name: str,
        symbol: str,
        timeframe: str,
        anchor: datetime,
        bars_before: int,
        bars_after: int,
    ) -> tuple:
        return (
            provider_name.lower(),
            symbol.upper(),
            timeframe,
            anchor,
            bars_before,
            bars_after,
        )

    @staticmethod
    def _trim_window(
        df: pd.DataFrame, anchor: datetime, bars_before: int, bars_after: int
    ) -> pd.DataFrame:
        """
        Pencereyi çapanın iki yanında İSTENEN MUM SAYISINA indirir.

        Aralık `calendar_stretch` yüzünden bilerek geniş isteniyor; dönen pencere
        boyutu buna göre dalgalanmasın diye burada kesiliyor. Çapa mumunun kendisi
        "geride" sayılır: replay'in o an durduğu mumdur, pencerede bulunmalıdır.
        """
        before = df[df["timestamp"] <= anchor].tail(bars_before)
        after = df[df["timestamp"] > anchor].head(bars_after)
        return pd.concat([before, after], ignore_index=True)

    def _read_cache_window(
        self,
        provider_name: str,
        symbol: str,
        timeframe: str,
        anchor: datetime,
        bars_before: int,
        bars_after: int,
        start_time: datetime,
    ) -> pd.DataFrame | None:
        """
        Ana parquet istenen mumları taşıyorsa pencereyi oradan keser.

        Yeterlilik ölçütü mum SAYISIDIR: önbellek çapanın gerisinde `bars_before`
        mum verebiliyorsa, dosyanın başlangıcı `start_time`'ın gerisine uzanmasa
        bile bu dilim işimizi görür (genişletilmiş takvim aralığını birebir aramak
        elde yeterli veri varken boş yere sağlayıcıya çıkmak olurdu).

        Karşılanamıyorsa `None` döner — "veri yok" değil, "buradan karşılanamaz"
        demektir; çağıran taraf sağlayıcıya gider.
        """
        cache_path = self._get_cache_path(provider_name, symbol, timeframe)
        if not os.path.exists(cache_path):
            return None

        # Önce YALNIZCA timestamp sütununu okuyup yeterliliğe bak. Tüm dosyayı okuyup
        # sonra "yetmiyor" demek pahalıya patlıyordu: 5m önbelleği 100.000 satır
        # ve o gereksiz okuma tek başına ölçümde ~1,6 s ekliyordu.
        try:
            stamps = pd.to_datetime(pd.read_parquet(cache_path, columns=["timestamp"])["timestamp"])
        except Exception:
            return None

        if stamps.empty:
            return None

        # Önbellek yeterli sayıda geçmiş mum taşımıyor VE dosyanın başı istenen
        # aralığın gerisine de uzanmıyorsa, geride daha fazlası olabilir: sağlayıcıya git.
        if int((stamps <= anchor).sum()) < bars_before and stamps.min() > start_time:
            return None

        try:
            df = pd.read_parquet(cache_path)
        except Exception:
            return None

        if df.empty:
            return None

        # `load_data` ile AYNI normalizasyon: aksi halde aynı sembol /data ve
        # /window üzerinden farklı mumlar döndürüyordu.
        df = self._normalize_cached_frame(df, provider_name, timeframe)

        # Sağ uç, önbelleğin sonunu aşabilir: "şimdi"nin ötesi zaten yok.
        sliced = self._trim_window(df, anchor, bars_before, bars_after)
        if sliced.empty:
            return None
        return sliced.reset_index(drop=True)

    @staticmethod
    def _normalize_cached_frame(
        df: pd.DataFrame, provider_name: str, timeframe: str
    ) -> pd.DataFrame:
        """Parquet'ten okunan mumları kullanıma hazır hale getirir.

        Hem `load_data` hem `_read_cache_window` bunu kullanır. Eskiden yalnızca
        `load_data` yapıyordu; `/window` dosyayı ham okuduğu için aynı sembol
        `/data` ile `/window` üzerinden FARKLI mumlar döndürebiliyordu (forex'te
        düzeltilmemiş open/hacim, günlük dilimlerde normalize edilmemiş ve
        tekrarlı zaman damgaları). Replay'de zaman dilimi değiştirince mumların
        "değişmesi" bundan geliyordu.
        """
        df = df.copy()
        df["timestamp"] = pd.to_datetime(df["timestamp"])

        if timeframe in ["1d", "1w", "1mo"]:
            df["timestamp"] = df["timestamp"].dt.normalize()
            df.drop_duplicates(subset=["timestamp"], keep="last", inplace=True)

        df.sort_values("timestamp", inplace=True)
        df.reset_index(drop=True, inplace=True)

        # Forex eski önbellek verilerindeki Open==Close ve 0-Volume sorunları.
        if provider_name.lower() in ["forex", "fx"] and not df.empty:
            if (df["open"] == df["close"]).mean() > 0.1:
                shifted_open = df["close"].shift(1)
                df.loc[df["open"] == df["close"], "open"] = shifted_open
                df["open"] = df["open"].fillna(df["close"])
            if df["volume"].sum() == 0 or (df["volume"] == 0).all():
                avg_price = df["close"].mean()
                pip = 0.01 if avg_price > 20 else 0.0001
                range_diff = (df["high"] - df["low"]).abs()
                df["volume"] = (range_diff / pip * 15.0).round().clip(lower=50.0)

        return df

    def _retention_clamped_start(
        self, provider_name: str, timeframe: str, start_time: datetime, end_time: datetime
    ) -> datetime:
        """
        İstenen başlangıcı, retention tavanının SAKLAYABİLECEĞİ en eskiye çeker.

        RULES.md #24: her sembol+dilim için tutulan mum sayısı sabittir. İstenen
        aralık bu tavandan genişse fazlalık zaten indirildikten hemen sonra
        `_prune_to_retention` tarafından siliniyordu — yani sağlayıcıdan çekilen
        sayfaların bir kısmı baştan çöpe gidiyordu. En ağır örnek Binance 1dk:
        `/data`'nın varsayılan aralığı 182 gün = 262.080 mum, RETENTION_1M ise
        100.000 — her soğuk yükleme 262 sayfa indirip 162.000 mumu anında
        atıyordu. 1s'te de 3 yıl = 26.280 mum istenip 20.000'i saklanıyordu.

        Kapalı piyasalarda takvim süresi mum sayısına eşit olmadığı için aralık
        `calendar_stretch` ile genişletilir: kırpma asla tavanın ALTINA inmemeli,
        yalnızca boşa indirmeyi engellemelidir.
        """
        limit = self._retention_limit(timeframe)
        delta = TIMEFRAME_DELTAS.get(timeframe)
        if limit is None or delta is None:
            return start_time

        max_span = delta * int(limit * calendar_stretch(provider_name, timeframe))
        if end_time - start_time <= max_span:
            return start_time
        return max(end_time - max_span, WINDOW_MIN_START)

    def _prune_to_retention(self, df: pd.DataFrame, timeframe: str) -> pd.DataFrame:
        """RULES.md #24-27: her zaman dilimi için ham veriyi sınırsız biriktirmez."""
        limit = self._retention_limit(timeframe)
        if limit is None or len(df) <= limit:
            return df
        return df.tail(limit).reset_index(drop=True)

    def resample_ohlcv(self, df: pd.DataFrame, target_rule: str) -> pd.DataFrame:
        if df.empty:
            return df
            
        df_temp = df.set_index("timestamp")
        resampled = df_temp.resample(target_rule).agg({
            "open": "first",
            "high": "max",
            "low": "min",
            "close": "last",
            "volume": "sum"
        })
        resampled.dropna(subset=["open"], inplace=True)
        return resampled.reset_index()

    def load_data(self, provider_name: str, symbol: str, timeframe: str, start_time: datetime, end_time: datetime) -> pd.DataFrame:
        provider_name = provider_name.lower()
        symbol = symbol.upper()
        
        # Doğrudan desteklenmeyen hisse senedi/forex zaman dilimleri için yeniden örnekleme (örneğin 4h)
        if provider_name in ["nasdaq", "bist", "forex", "fx"] and timeframe == "4h":
            df_1h = self.load_data(provider_name, symbol, "1h", start_time, end_time)
            df_4h = self.resample_ohlcv(df_1h, "4h")
            if not df_4h.empty:
                cache_path = self._get_cache_path(provider_name, symbol, timeframe)
                try:
                    os.makedirs(os.path.dirname(cache_path), exist_ok=True)
                    df_4h.to_parquet(cache_path, index=False)
                except Exception as e:
                    print(f"Warning: Failed to save resampled 4h cache: {e}")
            return df_4h

        # Retention tavanının ötesindeki geçmişi İSTEMEDEN önce kırp: aşağıdaki
        # bütün yollar (soğuk indirme, önek tamamlama, kapsama kontrolü) bu
        # kırpılmış başlangıcı kullanır, böylece indirilip anında silinecek
        # sayfalar hiç istenmez.
        start_time = self._retention_clamped_start(
            provider_name, timeframe, start_time, end_time
        )

        cache_path = self._get_cache_path(provider_name, symbol, timeframe)
        file_lock = self._get_file_lock(cache_path)

        # Sembol özelinde kilit kullanarak diğer sembollerin engellenmesini önlüyoruz
        with file_lock:
            df = None
            file_mtime = 0

            # 1. Bellek İçi (RAM L1) Önbellek Kontrolü (0.1 ms)
            if os.path.exists(cache_path):
                file_mtime = os.path.getmtime(cache_path)
                cache_key = (provider_name, symbol, timeframe)
                if cache_key in self._mem_cache:
                    cached_mtime, cached_df = self._mem_cache[cache_key]
                    if cached_mtime == file_mtime:
                        df = cached_df

                # RAM'de yoksa parquet dosyasından oku
                if df is None:
                    try:
                        df = self._normalize_cached_frame(
                            pd.read_parquet(cache_path), provider_name, timeframe
                        )
                        self._mem_cache[cache_key] = (file_mtime, df)
                    except Exception as e:
                        print(f"Warning: Failed to load parquet cache at {cache_path}: {e}")
                        df = None

            # 2. Önbellek yoksa API'den çek
            if df is None or df.empty:
                print(f"Cache miss for {provider_name}:{symbol} ({timeframe}). Fetching from API...")
                provider = self.get_provider(provider_name)
                df = provider.fetch_ohlcv(symbol, timeframe, start_time, end_time)
                
                if not df.empty:
                    if timeframe in ["1d", "1w", "1mo"]:
                        df['timestamp'] = pd.to_datetime(df['timestamp']).dt.normalize()
                        df.drop_duplicates(subset=['timestamp'], keep='last', inplace=True)
                    df = self._prune_to_retention(df, timeframe)
                    os.makedirs(os.path.dirname(cache_path), exist_ok=True)
                    df.to_parquet(cache_path, index=False)
                    file_mtime = os.path.getmtime(cache_path)
                    self._mem_cache[(provider_name, symbol, timeframe)] = (file_mtime, df)
                # Diğer dönüş yolları gibi istenen aralığa kırpılır: sağlayıcı
                # istenenden geniş bir aralık döndürebiliyor.
                return df[(df['timestamp'] >= start_time) & (df['timestamp'] <= end_time)].reset_index(drop=True)

            # 3. Önbellek Var: Tazelik & Kapsama Kontrolü
            cached_start = df['timestamp'].min()
            cached_end = df['timestamp'].max()

            needed_start = start_time
            needed_end = end_time

            # Başlangıç tarihi kapsanıyor mu? (Geriye dönük geçmiş verimiz yeterli mi?)
            #
            # Önbellek retention tavanına dayanmışsa "kapsanıyor" sayılır:
            # elimizdeki en eski mum, SAKLAYABİLECEĞİMİZ en eski mumdur, daha
            # fazlasını istemenin anlamı yoktur.
            #
            # Bu kontrol olmadan retention'ı aşan her istek sonsuz bir döngüye
            # giriyordu: eksik önek indiriliyor, birleştiriliyor, _prune_to_retention
            # tarafından hemen tekrar kırpılıyor, bir sonraki istekte yine eksik
            # görünüyordu. Binance 1h'te /data'nın varsayılan aralığı 3 yıl =
            # 26.280 mum, RETENTION_1H ise 20.000: her grafik yüklemesi ~6.300
            # mumu (7 sayfa) yeniden indiriyordu. 1m'de tablo daha kötü:
            # 182 gün = 262.080 mum, RETENTION_1M 100.000 -> istek başına 163 sayfa.
            retention_limit = self._retention_limit(timeframe)
            at_retention_cap = retention_limit is not None and len(df) >= retention_limit
            has_start_covered = (needed_start >= cached_start) or at_retention_cap
            
            # Bitiş tarihi kapsanıyor mu veya dosya son 5 dakika içinde güncellendi mi?
            cache_age_seconds = time.time() - file_mtime
            has_end_covered = (needed_end <= cached_end) or (cache_age_seconds < 300)
            
            # Eğer HEM geçmiş (başlangıç) HEM DE güncel (bitiş) verisi kapsanıyorsa, doğrudan önbellekten dön
            if has_start_covered and has_end_covered:
                return df[(df['timestamp'] >= needed_start) & (df['timestamp'] <= needed_end)].reset_index(drop=True)

            # 4. Gerekirse sadece eksik parçayı dış API'den tamamla
            provider = self.get_provider(provider_name)
            df_before = pd.DataFrame()
            df_after = pd.DataFrame()
            
            # Retention tavanındaysak önek indirmek boşunadır: gelen mumlar
            # birleştirmeden hemen sonra tekrar kırpılırdı.
            if needed_start < cached_start and not at_retention_cap:
                try:
                    df_before = provider.fetch_ohlcv(symbol, timeframe, needed_start, cached_start)
                except Exception as e:
                    print(f"Warning: Failed to fetch prefix data: {e}")
                    
            if needed_end > cached_end and (needed_end - cached_end) > timedelta(minutes=15):
                try:
                    df_after = provider.fetch_ohlcv(symbol, timeframe, cached_end, needed_end)
                except Exception as e:
                    print(f"Warning: Failed to fetch suffix data: {e}")
                    
            if not df_before.empty or not df_after.empty:
                dfs_to_concat = []
                if not df_before.empty:
                    dfs_to_concat.append(df_before)
                dfs_to_concat.append(df)
                if not df_after.empty:
                    dfs_to_concat.append(df_after)
                    
                df_combined = pd.concat(dfs_to_concat, ignore_index=True)
                if timeframe in ["1d", "1w", "1mo"]:
                    df_combined['timestamp'] = pd.to_datetime(df_combined['timestamp']).dt.normalize()
                df_combined.drop_duplicates(subset=['timestamp'], keep='last', inplace=True)
                df_combined.sort_values('timestamp', inplace=True)
                df_combined.reset_index(drop=True, inplace=True)
                df_combined = self._prune_to_retention(df_combined, timeframe)

                try:
                    os.makedirs(os.path.dirname(cache_path), exist_ok=True)
                    df_combined.to_parquet(cache_path, index=False)
                    file_mtime = os.path.getmtime(cache_path)
                    self._mem_cache[(provider_name, symbol, timeframe)] = (file_mtime, df_combined)
                    df = df_combined
                except Exception as e:
                    print(f"Warning: Failed to save merged data to cache: {e}")

            return df[(df['timestamp'] >= needed_start) & (df['timestamp'] <= needed_end)].reset_index(drop=True)
