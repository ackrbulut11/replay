import requests
import pandas as pd
from datetime import datetime
from .base import IDataProvider

class NasdaqProvider(IDataProvider):
    def fetch_ohlcv(self, symbol: str, timeframe: str, start_time: datetime, end_time: datetime) -> pd.DataFrame:
        # Yahoo Finance URL
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol.upper()}"
        
        # Map timeframe to Yahoo Finance interval
        tf_map = {
            "1m": "1m",
            "5m": "5m",
            "15m": "15m",
            "1h": "1h",
            "1d": "1d"
        }
        
        interval = tf_map.get(timeframe)
        if not interval:
            raise ValueError(f"Unsupported timeframe: {timeframe} for Yahoo Finance provider.")
            
        params = {
            "period1": int(start_time.timestamp()),
            "period2": int(end_time.timestamp()),
            "interval": interval,
            "includePrePost": "false"
        }
        
        # User-Agent is required, otherwise Yahoo Finance returns HTTP 403
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        
        try:
            response = requests.get(url, params=params, headers=headers, timeout=15)
            response.raise_for_status()
            res_data = response.json()
        except Exception as e:
            raise RuntimeError(f"Error fetching data from Yahoo Finance: {str(e)}")
            
        chart = res_data.get("chart", {})
        result_list = chart.get("result", [])
        
        if not result_list or result_list is None:
            # Handle potential error message from Yahoo Finance
            err = chart.get("error", {})
            err_msg = err.get("description", "Unknown error") if err else "No data returned"
            raise RuntimeError(f"Yahoo Finance API error for symbol {symbol}: {err_msg}")
            
        data = result_list[0]
        timestamps = data.get("timestamp", [])
        quote = data.get("indicators", {}).get("quote", [{}])[0]
        
        if not timestamps:
            return pd.DataFrame(columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
            
        opens = quote.get("open", [])
        highs = quote.get("high", [])
        lows = quote.get("low", [])
        closes = quote.get("close", [])
        volumes = quote.get("volume", [])
        
        # Create DataFrame
        df = pd.DataFrame({
            "timestamp": timestamps,
            "open": opens,
            "high": highs,
            "low": lows,
            "close": closes,
            "volume": volumes
        })
        
        # Convert timestamp
        df['timestamp'] = pd.to_datetime(df['timestamp'], unit='s')
        
        # Clean null values (Yahoo returns null for non-trading periods)
        df.dropna(subset=['open', 'high', 'low', 'close'], inplace=True)
        
        # Fill missing volumes and cast types
        df['volume'] = df['volume'].fillna(0.0).astype(float)
        for col in ['open', 'high', 'low', 'close']:
            df[col] = df[col].astype(float)
            
        return df.reset_index(drop=True)
