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


class BinanceProvider(IDataProvider):
    def _fetch_kucoin_fallback(self, symbol: str, timeframe: str) -> pd.DataFrame:
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
        
        url = f"https://api.kucoin.com/api/v1/market/candles?symbol={s}&type={k_tf}"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        
        try:
            res = requests.get(url, headers=headers, timeout=10)
            if res.status_code == 200:
                body = res.json()
                data = body.get("data")
                if data and isinstance(data, list):
                    rows = []
                    for item in data:
                        rows.append({
                            "timestamp": pd.to_datetime(int(item[0]), unit="s"),
                            "open": float(item[1]),
                            "close": float(item[2]),
                            "high": float(item[3]),
                            "low": float(item[4]),
                            "volume": float(item[5])
                        })
                    df = pd.DataFrame(rows).sort_values("timestamp").reset_index(drop=True)
                    return df
        except Exception as e:
            print("KuCoin fallback error:", e)
            
        return pd.DataFrame(columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])

    def fetch_ohlcv(self, symbol: str, timeframe: str, start_time: datetime, end_time: datetime) -> pd.DataFrame:
        endpoints = get_ordered_endpoints()
        headers = REQUEST_HEADERS

        # Zaman dilimlerini Binance aralıklarına eşle
        tf_map = {
            "1m": "1m",
            "5m": "5m",
            "15m": "15m",
            "1h": "1h",
            "4h": "4h",
            "1d": "1d",
            "1w": "1w",
            "1mo": "1M"
        }
        
        interval = tf_map.get(timeframe)
        if not interval:
            raise ValueError(f"Unsupported timeframe: {timeframe} for Binance provider.")
            
        symbol = symbol.upper()
        
        # Zamanları milisaniyeye dönüştür
        start_ms = int(start_time.timestamp() * 1000)
        end_ms = int(end_time.timestamp() * 1000)
        
        all_candles = []
        current_start = start_ms

        # Session: sayfalar arasında TCP/TLS bağlantısını yeniden kullanır. Uzun
        # bir geçmiş indirmesi yüzlerce sayfa sürebiliyor ve her birinde yeniden
        # el sıkışmak ölçümde ~%15 ek maliyet çıkardı. Yerel değişken olduğu için
        # iş parçacıkları arasında paylaşılmaz.
        session = requests.Session()

        while current_start < end_ms:
            params = {
                "symbol": symbol,
                "interval": interval,
                "startTime": current_start,
                "endTime": end_ms,
                "limit": 1000
            }

            data = None
            for url in endpoints:
                try:
                    response = session.get(url, params=params, headers=headers, timeout=10)
                    if response.status_code == 200:
                        data = response.json()
                        break
                except Exception:
                    continue

            if data is None:
                if all_candles:
                    break
                # Binance bulut IP engeline takıldıysa KuCoin yedek API servisinden çek
                return self._fetch_kucoin_fallback(symbol, timeframe)
                
            if not data:
                break
                
            all_candles.extend(data)
            
            # Yanıtta 1000'den az veri varsa, mevcut verilerin sonuna ulaşmışızdır
            if len(data) < 1000:
                break
                
            # Pencereyi ileri taşı: son mumun açılış zamanı + 1ms
            last_open_time = int(data[-1][0])
            current_start = last_open_time + 1
            
        if not all_candles:
            return self._fetch_kucoin_fallback(symbol, timeframe)
            
        # Sonucu standart DataFrame olarak ayrıştır
        df = pd.DataFrame(all_candles)
        
        # Sütun tanımları:
        # 0: Open time, 1: Open, 2: High, 3: Low, 4: Close, 5: Volume
        df = df[[0, 1, 2, 3, 4, 5]].copy()
        df.columns = ['timestamp', 'open', 'high', 'low', 'close', 'volume']
        
        # Zaman damgasını datetime'a dönüştür (milisaniye cinsinden)
        df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
        
        # Değerleri float tipine dönüştür
        for col in ['open', 'high', 'low', 'close', 'volume']:
            df[col] = df[col].astype(float)
            
        return df.reset_index(drop=True)
