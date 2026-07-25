import os
import time
import pandas as pd
import threading
from collections import defaultdict
from datetime import datetime, timedelta
from .providers.binance import BinanceProvider
from .providers.nasdaq import NasdaqProvider
from .providers.bist import BistProvider
from .providers.forex import ForexProvider

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
        
        if provider_name in ["nasdaq", "bist"] and timeframe == "4h":
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
                
                try:
                    os.makedirs(os.path.dirname(cache_path), exist_ok=True)
                    df_combined.to_parquet(cache_path, index=False)
                    file_mtime = os.path.getmtime(cache_path)
                    self._mem_cache[(provider_name, symbol, timeframe)] = (file_mtime, df_combined)
                    df = df_combined
                except Exception as e:
                    print(f"Warning: Failed to save merged data to cache: {e}")

            return df[(df['timestamp'] >= needed_start) & (df['timestamp'] <= needed_end)].reset_index(drop=True)
