from __future__ import annotations

import os
import time
import pandas as pd
import threading
from collections import OrderedDict, defaultdict
from datetime import datetime, timedelta
from ..core.config import settings
from .providers.binance import BinanceProvider
from .providers.nasdaq import NasdaqProvider
from .providers.bist import BistProvider
from .providers.forex import ForexProvider

# Replay penceresinin varsayılan ölçüleri. Toplam ~1500 mum, sağlayıcıdan iki
# sayfa (sayfa başına 1000 mum) demek — ölçümde ~1 saniye.
#
# Arkadaki pay göstergelerin ısınması içindir: en uzun periyot 200 (EMA200)
# olduğundan 500 rahat yeter. Öndeki pay replay'in ilerleyebileceği mesafedir;
# 1000 mum, 1 sn/mum hızda ~16 dakikalık kesintisiz oynatma demek, bu sürede
# bir sonraki pencere arkaplanda çoktan yüklenir.
WINDOW_BARS_BEFORE = 500
WINDOW_BARS_AFTER = 1000

# Bellekte tutulacak azami pencere sayısı (RULES.md #24: sınırsız ham veri
# biriktirmek yasak). Bir pencere ~1500 satır, yani birkaç yüz KB.
WINDOW_CACHE_MAX = 40

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
        """
        delta = timeframe_delta(timeframe)
        start_time = anchor - delta * bars_before
        end_time = anchor + delta * bars_after

        # 1. Ana önbellek bu aralığı zaten kapsıyorsa oradan kes: ağa hiç çıkma.
        #    Kaba zaman dilimleri (1g/1h) tüm geçmişi taşıdığı için çoğu geçiş
        #    bu daldan döner ve anlık gelir.
        cached = self._read_cache_if_covers(provider_name, symbol, timeframe, start_time, end_time)
        if cached is not None:
            return cached

        cache_key = self._window_cache_key(
            provider_name, symbol, timeframe, start_time, end_time
        )
        with self._window_lock:
            hit = self._window_cache.get(cache_key)
            if hit is not None:
                self._window_cache.move_to_end(cache_key)
                return hit.copy()

        provider = self.get_provider(provider_name)
        df = provider.fetch_ohlcv(symbol, timeframe, start_time, end_time)

        if df is None or df.empty:
            return pd.DataFrame(columns=["timestamp", "open", "high", "low", "close", "volume"])

        df = df.sort_values("timestamp").reset_index(drop=True)

        with self._window_lock:
            self._window_cache[cache_key] = df
            self._window_cache.move_to_end(cache_key)
            # En eski pencereleri at: bellekte sınırsız birikmesin.
            while len(self._window_cache) > WINDOW_CACHE_MAX:
                self._window_cache.popitem(last=False)

        return df.copy()

    def _window_cache_key(
        self,
        provider_name: str,
        symbol: str,
        timeframe: str,
        start_time: datetime,
        end_time: datetime,
    ) -> tuple:
        return (provider_name.lower(), symbol.upper(), timeframe, start_time, end_time)

    def _read_cache_if_covers(
        self,
        provider_name: str,
        symbol: str,
        timeframe: str,
        start_time: datetime,
        end_time: datetime,
    ) -> pd.DataFrame | None:
        """
        Ana parquet istenen aralığı tümüyle kapsıyorsa ilgili dilimi döndürür.

        Kapsamıyorsa `None` döner — "veri yok" değil, "buradan karşılanamaz"
        demektir; çağıran taraf sağlayıcıya gider.
        """
        cache_path = self._get_cache_path(provider_name, symbol, timeframe)
        if not os.path.exists(cache_path):
            return None

        # Önce YALNIZCA timestamp sütununu okuyup kapsama bak. Tüm dosyayı okuyup
        # sonra "kapsamıyor" demek pahalıya patlıyordu: 5m önbelleği 100.000 satır
        # ve o gereksiz okuma tek başına ölçümde ~1,6 s ekliyordu.
        try:
            stamps = pd.read_parquet(cache_path, columns=["timestamp"])
        except Exception:
            return None

        if stamps.empty:
            return None

        if pd.to_datetime(stamps["timestamp"]).min() > start_time:
            return None

        try:
            df = pd.read_parquet(cache_path)
        except Exception:
            return None

        if df.empty:
            return None

        df["timestamp"] = pd.to_datetime(df["timestamp"])

        # Sağ uç, önbelleğin sonunu aşabilir: "şimdi"nin ötesi zaten yok. Yalnızca
        # sol uç (geçmiş) kapsanıyorsa bu dilim işimizi görür.
        sliced = df[(df["timestamp"] >= start_time) & (df["timestamp"] <= end_time)]
        if sliced.empty:
            return None
        return sliced.reset_index(drop=True)

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
                        df = pd.read_parquet(cache_path)
                        df['timestamp'] = pd.to_datetime(df['timestamp'])
                        if timeframe in ["1d", "1w", "1mo"]:
                            df['timestamp'] = df['timestamp'].dt.normalize()
                            df.drop_duplicates(subset=['timestamp'], keep='last', inplace=True)
                        df.sort_values('timestamp', inplace=True)
                        df.reset_index(drop=True, inplace=True)

                        # Forex eski önbellek verilerindeki Open==Close ve 0-Volume sorunlarını otomatik düzelt
                        if provider_name in ["forex", "fx"] and not df.empty:
                            if (df['open'] == df['close']).mean() > 0.1:
                                shifted_open = df['close'].shift(1)
                                df.loc[df['open'] == df['close'], 'open'] = shifted_open
                                df['open'] = df['open'].fillna(df['close'])
                            if df['volume'].sum() == 0 or (df['volume'] == 0).all():
                                avg_price = df['close'].mean()
                                pip = 0.01 if avg_price > 20 else 0.0001
                                range_diff = (df['high'] - df['low']).abs()
                                df['volume'] = (range_diff / pip * 15.0).round().clip(lower=50.0)
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
                return df

            # 3. Önbellek Var: Tazelik & Kapsama Kontrolü
            cached_start = df['timestamp'].min()
            cached_end = df['timestamp'].max()
            
            needed_start = start_time
            needed_end = end_time
            
            # Başlangıç tarihi kapsanıyor mu? (Geriye dönük geçmiş verimiz yeterli mi?)
            has_start_covered = (needed_start >= cached_start)
            
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
            
            if needed_start < cached_start:
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
