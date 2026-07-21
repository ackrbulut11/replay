import os
import pandas as pd
import threading
from datetime import datetime
from .providers.binance import BinanceProvider
from .providers.nasdaq import NasdaqProvider
from .providers.bist import BistProvider

class DataLoader:
    def __init__(self):
        self._lock = threading.Lock()
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
            "bist": BistProvider()
        }

    def get_provider(self, provider_name: str):
        provider = self.providers.get(provider_name.lower())
        if not provider:
            raise ValueError(f"Unknown data provider: {provider_name}. Choose from: binance, nasdaq, bist.")
        return provider

    def _get_cache_path(self, provider_name: str, symbol: str, timeframe: str) -> str:
        return os.path.join(
            self.project_root, 
            "storage", 
            "market_data", 
            provider_name.lower(), 
            f"{symbol.upper()}_{timeframe}.parquet"
        )

    def resample_ohlcv(self, df: pd.DataFrame, target_rule: str) -> pd.DataFrame:
        """
        Resamples a standard OHLCV DataFrame to a higher timeframe.
        Args:
            df (pd.DataFrame): Input DataFrame (must contain timestamp column)
            target_rule (str): Pandas resample rule (e.g. '4H', '1D')
        """
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
        # İşlem hacmi veya fiyat verisi olmayan dönemleri kaldır
        resampled.dropna(subset=["open"], inplace=True)
        return resampled.reset_index()

    def load_data(self, provider_name: str, symbol: str, timeframe: str, start_time: datetime, end_time: datetime) -> pd.DataFrame:
        provider_name = provider_name.lower()
        symbol = symbol.upper()
        
        # Doğrudan desteklenmeyen hisse senedi zaman dilimleri için yeniden örnekleme mantığı (örneğin hisse senetleri için 4h)
        if provider_name in ["nasdaq", "bist"] and timeframe == "4h":
            # 1h veriyi yükle ve 4h olarak yeniden örnekle
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
            
        # Eşzamanlı önbellek okuma/yazma işlemleri sırasında yarış durumlarını (race condition) önlemek için thread lock kullan
        with self._lock:
            cache_path = self._get_cache_path(provider_name, symbol, timeframe)
            provider = self.get_provider(provider_name)
            
            df = None
            if os.path.exists(cache_path):
                try:
                    df = pd.read_parquet(cache_path)
                    # Doğru tipleri ve sıralamayı garanti et
                    df['timestamp'] = pd.to_datetime(df['timestamp'])
                    df.sort_values('timestamp', inplace=True)
                    df.reset_index(drop=True, inplace=True)
                except Exception as e:
                    print(f"Warning: Failed to load parquet cache at {cache_path}: {e}. Fetching from API.")
                    df = None
                    
            if df is None or df.empty:
                # Önbellek yok veya boş: hepsini getir ve kaydet
                print(f"Cache miss for {provider_name}:{symbol} ({timeframe}). Fetching from API...")
                df = provider.fetch_ohlcv(symbol, timeframe, start_time, end_time)
                
                if not df.empty:
                    os.makedirs(os.path.dirname(cache_path), exist_ok=True)
                    df.to_parquet(cache_path, index=False)
                return df
                
            # Önbellek var: talep edilen aralığı kapsayıp kapsamadığını kontrol et
            cached_start = df['timestamp'].min()
            cached_end = df['timestamp'].max()
            
            needed_start = start_time
            needed_end = end_time
            
            # Talep edilen aralık tamamen önbelleğe alınmış aralıktaysa, sadece filtrele ve döndür
            if needed_start >= cached_start and needed_end <= cached_end:
                return df[(df['timestamp'] >= needed_start) & (df['timestamp'] <= needed_end)].reset_index(drop=True)
                
            # Eksik verileri getirmemiz gerekiyor
            df_before = pd.DataFrame()
            df_after = pd.DataFrame()
            
            # Gerekirse ön eki (prefix) getir
            if needed_start < cached_start:
                print(f"Fetching prefix data from API for {provider_name}:{symbol} ({timeframe}) from {needed_start} to {cached_start}...")
                try:
                    df_before = provider.fetch_ohlcv(symbol, timeframe, needed_start, cached_start)
                except Exception as e:
                    print(f"Warning: Failed to fetch prefix data: {e}")
                    
            # Gerekirse son eki (suffix) getir
            if needed_end > cached_end:
                print(f"Fetching suffix data from API for {provider_name}:{symbol} ({timeframe}) from {cached_end} to {needed_end}...")
                try:
                    df_after = provider.fetch_ohlcv(symbol, timeframe, cached_end, needed_end)
                except Exception as e:
                    print(f"Warning: Failed to fetch suffix data: {e}")
                    
            # Tüm parçaları birleştir
            dfs_to_concat = []
            if not df_before.empty:
                dfs_to_concat.append(df_before)
            dfs_to_concat.append(df)
            if not df_after.empty:
                dfs_to_concat.append(df_after)
                
            df_combined = pd.concat(dfs_to_concat, ignore_index=True)
            df_combined.drop_duplicates(subset=['timestamp'], inplace=True)
            df_combined.sort_values('timestamp', inplace=True)
            df_combined.reset_index(drop=True, inplace=True)
            
            # Önbelleğe geri yaz
            try:
                os.makedirs(os.path.dirname(cache_path), exist_ok=True)
                df_combined.to_parquet(cache_path, index=False)
            except Exception as e:
                print(f"Warning: Failed to save merged data to cache: {e}")
                
            # Yalnızca talep edilen aralığı döndür
            return df_combined[(df_combined['timestamp'] >= needed_start) & (df_combined['timestamp'] <= needed_end)].reset_index(drop=True)
