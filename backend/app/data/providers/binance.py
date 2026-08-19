from __future__ import annotations

import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
import pandas as pd
from datetime import datetime
from .base import IDataProvider

# Binance'in aynı veriyi veren yansıları. Sıra ÖNEMSİZ değildir: eskiden liste
# baştan sona denendiği için daima ilk sıradaki kullanılıyordu ve o, ölçümde en
# yavaş çıkan yansıydı (1,74 s/sayfa; en hızlısı 0,34 s/sayfa). 157 sayfalık bir
# geçmiş indirmesinde bu 273 s ile 55 s arasındaki fark demekti.
#
# Sırayı sabit yazmak çözüm DEĞİL: `api.binance.com` yerelde en hızlısı ama bulut
# IP'lerinden sık sık engelleniyor (KuCoin yedeğinin varlık sebebi de bu), dolayısıyla
# Render'da ilk sıraya konursa üretim tamamen kırılırdı. Onun yerine süreç başına bir
# kez ölçülüp çalışanların en hızlısı seçilir; ortam neyse ona uyum sağlar.
KLINE_ENDPOINTS = [
    "https://data-api.binance.vision/api/v3/klines",
    "https://api1.binance.com/api/v3/klines",
    "https://api2.binance.com/api/v3/klines",
    "https://api3.binance.com/api/v3/klines",
    "https://api.binance.com/api/v3/klines",
]

REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
}

# Seçilen yansı ve onu koruyan kilit. DataLoader istekleri iş parçacıklarından
# çağırıyor; ölçüm yalnızca bir kez yapılsın diye kilit altında tutulur.
_preferred_endpoint: str | None = None
_endpoint_lock = threading.Lock()

# Yoklama isteği tek mum ister: amaç veriyi almak değil, gidiş-dönüş süresini ölçmek.
_PROBE_PARAMS = {"symbol": "BTCUSDT", "interval": "1m", "limit": 1}
_PROBE_TIMEOUT = 5


def _probe_one(url: str) -> tuple[str, float] | None:
    """Tek yansıyı yoklar; çalışıyorsa (url, süre) döndürür."""
    started = time.time()
    try:
        response = requests.get(
            url, params=_PROBE_PARAMS, headers=REQUEST_HEADERS, timeout=_PROBE_TIMEOUT
        )
    except Exception:
        return None
    if response.status_code != 200:
        return None
    return url, time.time() - started


def _probe_fastest_endpoint() -> str:
    """
    Çalışan yansıların en hızlısını seçer.

    Yansılar SIRAYLA değil PARALEL yoklanır ve ilk başarılı yanıt kazanır: sıralı
    yoklama beşinin süresini topluyordu (ölçümde 4,9 s) ve bu bedeli ilk kullanıcı
    isteği ödüyordu. Paralel yarışta maliyet en hızlı yansının süresi kadardır
    (~0,35 s) ve "ilk dönen = en hızlısı" olduğu için ayrıca sıralama gerekmez.

    Hiçbiri yanıt vermezse listenin ilki döndürülür — çağıran taraf zaten
    başarısızlıkta tüm listeyi tek tek deniyor, burada hata fırlatmak gereksiz
    bir kırılganlık olurdu.
    """
    with ThreadPoolExecutor(max_workers=len(KLINE_ENDPOINTS)) as pool:
        futures = [pool.submit(_probe_one, url) for url in KLINE_ENDPOINTS]
        for future in as_completed(futures):
            result = future.result()
            if result is None:
                continue
            url, elapsed = result
            print(f"Binance yansısı seçildi: {url} ({elapsed:.2f}s)")
            return url

    return KLINE_ENDPOINTS[0]


def get_ordered_endpoints() -> list[str]:
    """Önce ölçümle seçilen yansı, ardından yedek olarak diğerleri."""
    global _preferred_endpoint

    if _preferred_endpoint is None:
        with _endpoint_lock:
            # Kilidi beklerken başka bir iş parçacığı seçmiş olabilir.
            if _preferred_endpoint is None:
                _preferred_endpoint = _probe_fastest_endpoint()

    preferred = _preferred_endpoint
    return [preferred] + [url for url in KLINE_ENDPOINTS if url != preferred]


# Zaman dilimi -> Binance `interval` kodu.
TF_TO_INTERVAL = {
    "1m": "1m",
    "5m": "5m",
    "15m": "15m",
    "1h": "1h",
    "4h": "4h",
    "1d": "1d",
    "1w": "1w",
    "1mo": "1M",
}

# Her `interval` kodunun milisaniye cinsinden mum süresi. Sayfa sınırlarını
# ÖNCEDEN hesaplayabilmek için gerekli (bkz. `_fetch_pages`). `1M` bilerek
# yoktur: ayın uzunluğu sabit değildir, o dilim sıralı yoldan çekilir.
INTERVAL_MS = {
    "1m": 60_000,
    "5m": 300_000,
    "15m": 900_000,
    "1h": 3_600_000,
    "4h": 14_400_000,
    "1d": 86_400_000,
    "1w": 604_800_000,
}

# Binance'in tek istekte verdiği azami mum sayısı.
PAGE_LIMIT = 1000

# Eşzamanlı sayfa isteği sayısı. `limit=1000` klines isteğinin ağırlığı 2,
# dakikalık bütçe 6000 — yani sınır bu değerin kat kat üstünde. Düşük tutmanın
# sebebi kotayı korumak değil, sağlayıcıya inen eşzamanlı yükü sınırlamak.
MAX_PAGE_WORKERS = 12

# Tek çağrıda indirilecek azami sayfa. 400 x 1000 = 400.000 mum; retention
# tavanlarının (en yükseği 100.000) belirgin şekilde üstünde.
MAX_PAGES = 400

# Eksik kalan sayfalar için toplam deneme turu (ilk tur dahil).
PAGE_RETRIES = 3

# Sayfa indiricilerin KALICI havuzu.
#
# Her `fetch_ohlcv` çağrısında yeni bir `ThreadPoolExecutor` kurmak, her seferinde
# yepyeni iş parçacıkları demekti; thread-local oturumlar da onlarla birlikte
# sıfırlandığı için her sayfa dalgası TLS el sıkışmasını baştan ödüyordu
# (ölçümde 18 sayfalık 15dk indirmesi 3,7 s — paralelliğin kazandırdığının bir
# kısmını geri veriyordu). Havuz süreç ömrü boyunca yaşayınca iş parçacıkları ve
# onların bağlantıları istekler arasında sıcak kalır.
#
# Havuzun ikinci işlevi sağlayıcıya inen eşzamanlı istek sayısını süreç genelinde
# sınırlamak: aynı anda üç grafik yüklense de Binance'e MAX_PAGE_WORKERS'tan
# fazla istek gitmez.
_page_pool = ThreadPoolExecutor(
    max_workers=MAX_PAGE_WORKERS, thread_name_prefix="binance-page"
)

# İş parçacığı başına bir `requests.Session`: sayfalar arasında TCP/TLS
# bağlantısını yeniden kullanır. `Session` iş parçacığı güvenli olmadığı için
# paylaşılmaz, thread-local tutulur.
_sessions = threading.local()


def _thread_session() -> requests.Session:
    session = getattr(_sessions, "session", None)
    if session is None:
        session = requests.Session()
        _sessions.session = session
    return session


class BinanceProvider(IDataProvider):
    def _fetch_kucoin_fallback(
        self, symbol: str, timeframe: str, start_time: datetime, end_time: datetime
    ) -> pd.DataFrame:
        """
        Binance'e HİÇ ulaşılamadığında devreye giren yedek borsa.

        İstenen ARALIK gönderilir. Eskiden hiçbir zaman parametresi yoktu ve
        KuCoin sayfa boyutu varsayılanı 100'dür: hangi tarih aralığı istenirse
        istensin yalnızca son 100 mum dönüyordu. Bu 100 mum, `load_data`
        tarafından "istenen aralığın verisi" sanılıp Binance parquet'ine
        yazıldığı için grafik hem boş görünüyor hem de önbellek bozuluyordu —
        "gelen veri çok az" şikâyetinin bir kaynağı buydu.

        KuCoin yanıt başına en çok 1500 mum döndürür ve YENİDEN ESKİYE sıralar,
        bu yüzden pencere sondan başa doğru kaydırılarak sayfalanır.
        """
        tf_map = {
            "1m": "1min",
            "5m": "5min",
            "15m": "15min",
            "1h": "1hour",
            "4h": "4hour",
            "1d": "1day",
            "1w": "1week",
        }
        k_tf = tf_map.get(timeframe, "1day")
        s = symbol.upper()
        if s.endswith("USDT") and "-" not in s:
            s = s[:-4] + "-USDT"

        start_at = max(int(start_time.timestamp()), 0)
        end_at = int(end_time.timestamp())

        rows = []
        seen: set[int] = set()
        cursor = end_at
        # Üst sınır: sonsuz döngüye karşı emniyet. 40 x 1500 = 60.000 mum,
        # retention tavanlarının üstünde.
        for _ in range(40):
            if cursor <= start_at:
                break
            try:
                res = requests.get(
                    "https://api.kucoin.com/api/v1/market/candles",
                    params={
                        "symbol": s,
                        "type": k_tf,
                        "startAt": start_at,
                        "endAt": cursor,
                    },
                    headers=REQUEST_HEADERS,
                    timeout=15,
                )
            except Exception as e:
                print("KuCoin fallback error:", e)
                break

            if res.status_code != 200:
                break

            data = res.json().get("data")
            if not data or not isinstance(data, list):
                break

            oldest = cursor
            for item in data:
                ts = int(item[0])
                if ts in seen:
                    continue
                seen.add(ts)
                oldest = min(oldest, ts)
                rows.append({
                    "timestamp": pd.to_datetime(ts, unit="s"),
                    "open": float(item[1]),
                    "close": float(item[2]),
                    "high": float(item[3]),
                    "low": float(item[4]),
                    "volume": float(item[5]),
                })

            # Sayfa dolmadıysa aralığın başına ulaşılmıştır.
            if len(data) < 1500 or oldest >= cursor:
                break
            cursor = oldest - 1

        if not rows:
            return pd.DataFrame(columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])

        return pd.DataFrame(rows).sort_values("timestamp").reset_index(drop=True)

    def _fetch_page(self, params: dict) -> list | None:
        """
        Tek sayfayı çeker. Yansılar sırayla denenir; hiçbiri veremezse `None`.

        `None` ile `[]` ayrımı önemlidir: `[]` "bu aralıkta mum yok" (sembolün
        listelenmesinden önceki tarihler), `None` ise "ulaşılamadı" demektir ve
        yalnızca ikincisi KuCoin yedeğini tetiklemelidir.
        """
        session = _thread_session()
        for url in get_ordered_endpoints():
            try:
                response = session.get(
                    url, params=params, headers=REQUEST_HEADERS, timeout=15
                )
            except Exception:
                continue
            if response.status_code == 200:
                return response.json()
        return None

    def fetch_ohlcv(
        self,
        symbol: str,
        timeframe: str,
        start_time: datetime,
        end_time: datetime,
        allow_gap_fill: bool = True,
    ) -> pd.DataFrame:
        # `allow_gap_fill` burada kullanılmıyor: Binance'in ikincil bir dolgu
        # kaynağı yok (KuCoin yedeği ERİŞİLEMEZLİK için, geçmiş DERİNLİĞİ için
        # değil). Parametre yalnızca `IDataProvider` arayüzüyle tutarlılık için var.
        # Zaman dilimlerini Binance aralıklarına eşle
        interval = TF_TO_INTERVAL.get(timeframe)
        if not interval:
            raise ValueError(f"Unsupported timeframe: {timeframe} for Binance provider.")

        symbol = symbol.upper()

        # Zamanları milisaniyeye dönüştür
        start_ms = int(start_time.timestamp() * 1000)
        end_ms = int(end_time.timestamp() * 1000)

        rows, reachable = self._fetch_pages(symbol, interval, timeframe, start_ms, end_ms)

        if not rows:
            if reachable:
                # Binance'e ulaşıldı ve "bu aralıkta mum yok" dedi. Bu geçerli bir
                # cevaptır (sembolün listelenmesinden önceki tarihler) — KuCoin'e
                # gitmek, istenen aralıkla ilgisi olmayan mumları o aralığın
                # verisi sanıp önbelleğe yazmak olurdu.
                return pd.DataFrame(columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
            # Binance bulut IP engeline takıldıysa KuCoin yedek API servisinden çek
            return self._fetch_kucoin_fallback(symbol, timeframe, start_time, end_time)

        # Sonucu standart DataFrame olarak ayrıştır
        # Sütun tanımları:
        # 0: Open time, 1: Open, 2: High, 3: Low, 4: Close, 5: Volume
        df = pd.DataFrame(rows, columns=range(len(rows[0])))
        df = df[[0, 1, 2, 3, 4, 5]].copy()
        df.columns = ['timestamp', 'open', 'high', 'low', 'close', 'volume']

        # Zaman damgasını datetime'a dönüştür (milisaniye cinsinden)
        df['timestamp'] = pd.to_datetime(df['timestamp'].astype('int64'), unit='ms')

        # Değerleri float tipine dönüştür
        for col in ['open', 'high', 'low', 'close', 'volume']:
            df[col] = df[col].astype(float)

        # Sayfalar paralel geldiği için sıra garanti değil; sınırlarda üst üste
        # binen mumlar da olabilir (sayfa uçları kapalı aralıktır).
        df = df.drop_duplicates(subset=['timestamp'], keep='last')
        return df.sort_values('timestamp').reset_index(drop=True)

    def _fetch_pages(
        self, symbol: str, interval: str, timeframe: str, start_ms: int, end_ms: int
    ) -> tuple[list, bool]:
        """
        İstenen aralığın tüm sayfalarını çeker. `(satırlar, ulaşılabildi_mi)` döner.

        Sayfalar PARALEL indirilir. Eskiden döngü sıralıydı ve her sayfanın
        başlangıcı bir öncekinin son mumundan hesaplandığı için paralelleşemiyordu;
        ölçümde 182 günlük 15dk (18 sayfa) 6,9 s, 3 yıllık 1s (27 sayfa) 9,0 s
        sürüyordu — sayfa başına ~0,35 s'nin tamamı toplanıyordu. Oysa mum süresi
        SABİT olduğu için k'ıncı sayfanın başlangıcı baştan bellidir
        (`start + k * 1000 * mum_süresi`); tüm sayfalar aynı anda istenebilir ve
        maliyet tek sayfaya iner.

        `1mo` bunun dışındadır: ay uzunluğu sabit olmadığından sayfa sınırları
        hesaplanamaz. Zaten tek sayfada ~83 yıl sığdığı için sıralı döngü yeterli.
        """
        bar_ms = INTERVAL_MS.get(interval)
        if bar_ms is None:
            return self._fetch_pages_sequential(symbol, interval, start_ms, end_ms)

        page_span = bar_ms * PAGE_LIMIT
        page_count = (end_ms - start_ms + page_span - 1) // page_span
        if page_count <= 0:
            return [], True
        if page_count == 1:
            return self._fetch_pages_sequential(symbol, interval, start_ms, end_ms)

        # Emniyet tavanı: aşırı geniş bir aralık sağlayıcıyı yüzlerce istekle
        # dövmesin. En yeni uçtan geriye doğru kırpılır — kullanıcı grafiği en
        # sağdan okur, eksik olacaksa en eski mumlar eksik olsun.
        if page_count > MAX_PAGES:
            start_ms = end_ms - MAX_PAGES * page_span
            page_count = MAX_PAGES

        starts = [start_ms + i * page_span for i in range(int(page_count))]

        results: list[list | None] = [None] * len(starts)
        pending = list(range(len(starts)))

        # Eksik sayfalar yeniden denenir. Sıralı yolda bir sayfa alınamayınca
        # döngü kırılıyordu ve sonuç KISALIYORDU — yani hep bitişik kalıyordu.
        # Paralel yolda ise başarısız bir sayfa aralığın ORTASINDA delik bırakır
        # ve `load_data` bunu bitişik bir önbellek olarak parquet'e yazdığı için
        # delik kalıcı olurdu: `cached_start`/`cached_end` aralığı kapsıyor
        # göründüğünden eksik mumlar bir daha hiç istenmezdi.
        for _ in range(PAGE_RETRIES):
            futures = {
                _page_pool.submit(
                    self._fetch_page,
                    {
                        "symbol": symbol,
                        "interval": interval,
                        "startTime": starts[idx],
                        "endTime": min(starts[idx] + page_span - 1, end_ms),
                        "limit": PAGE_LIMIT,
                    },
                ): idx
                for idx in pending
            }
            for future in as_completed(futures):
                results[futures[future]] = future.result()

            pending = [idx for idx, page in enumerate(results) if page is None]
            if not pending:
                break

        reachable = any(page is not None for page in results)

        if pending:
            # Hâlâ eksik sayfa var. Delikli bir sonuç döndürmektense hiç
            # döndürmemek doğru: çağıran taraf önbelleği bozmadan bir sonraki
            # istekte yeniden dener. `reachable` bilgisi korunur — hiçbir sayfa
            # gelmediyse KuCoin yedeği devreye girmelidir.
            print(
                f"Binance sayfaları eksik ({symbol} {timeframe}): "
                f"{len(pending)}/{len(starts)} sayfa alınamadı"
            )
            return [], reachable

        rows: list = []
        for page in results:
            if page:
                rows.extend(page)
        return rows, reachable

    def _fetch_pages_sequential(
        self, symbol: str, interval: str, start_ms: int, end_ms: int
    ) -> tuple[list, bool]:
        """Sayfa sınırları hesaplanamayan aralıklar (`1M`) için sıralı yol."""
        rows: list = []
        reachable = False
        current_start = start_ms

        while current_start < end_ms:
            data = self._fetch_page({
                "symbol": symbol,
                "interval": interval,
                "startTime": current_start,
                "endTime": end_ms,
                "limit": PAGE_LIMIT,
            })
            if data is None:
                break
            reachable = True
            if not data:
                break

            rows.extend(data)
            if len(data) < PAGE_LIMIT:
                break

            # Pencereyi ileri taşı: son mumun açılış zamanı + 1ms
            current_start = int(data[-1][0]) + 1

        return rows, reachable
