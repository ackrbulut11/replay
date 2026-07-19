import requests
import pandas as pd
from datetime import datetime
from .base import IDataProvider

class BinanceProvider(IDataProvider):
    def fetch_ohlcv(self, symbol: str, timeframe: str, start_time: datetime, end_time: datetime) -> pd.DataFrame:
        url = "https://api.binance.com/api/v3/klines"
        
        # Map timeframes to Binance intervals
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
        
        # Convert times to milliseconds
        start_ms = int(start_time.timestamp() * 1000)
        end_ms = int(end_time.timestamp() * 1000)
        
        all_candles = []
        current_start = start_ms
        
        while current_start < end_ms:
            params = {
                "symbol": symbol,
                "interval": interval,
                "startTime": current_start,
                "endTime": end_ms,
                "limit": 1000
            }
            
            try:
                response = requests.get(url, params=params, timeout=15)
                response.raise_for_status()
                data = response.json()
            except Exception as e:
                # If we have some candles, we can return them, or raise if we got nothing
                if all_candles:
                    break
                raise RuntimeError(f"Error fetching data from Binance: {str(e)}")
                
            if not data:
                break
                
            all_candles.extend(data)
            
            # If the response has fewer than 1000 entries, we have reached the end of available data
            if len(data) < 1000:
                break
                
            # Move the window forward: last candle's open time + 1ms
            last_open_time = int(data[-1][0])
            current_start = last_open_time + 1
            
        if not all_candles:
            return pd.DataFrame(columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
            
        # Parse result into standard DataFrame
        df = pd.DataFrame(all_candles)
        
        # Columns definition:
        # 0: Open time, 1: Open, 2: High, 3: Low, 4: Close, 5: Volume
        df = df[[0, 1, 2, 3, 4, 5]].copy()
        df.columns = ['timestamp', 'open', 'high', 'low', 'close', 'volume']
        
        # Convert timestamp to datetime (it's in ms)
        df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
        
        # Convert values to float
        for col in ['open', 'high', 'low', 'close', 'volume']:
            df[col] = df[col].astype(float)
            
        return df.reset_index(drop=True)
