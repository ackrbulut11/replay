from abc import ABC, abstractmethod
from datetime import datetime
import pandas as pd

class IDataProvider(ABC):
    @abstractmethod
    def fetch_ohlcv(self, symbol: str, timeframe: str, start_time: datetime, end_time: datetime) -> pd.DataFrame:
        """
        Fetch historical OHLCV data from the provider.
        
        Args:
            symbol (str): The market symbol (e.g., 'BTCUSDT', 'AAPL', 'THYAO').
            timeframe (str): The bar duration (e.g., '1m', '5m', '15m', '1h', '1d').
            start_time (datetime): The start date/time of the request.
            end_time (datetime): The end date/time of the request.
            
        Returns:
            pd.DataFrame: A DataFrame with the following columns:
                          - 'timestamp' (datetime64[ns])
                          - 'open' (float64)
                          - 'high' (float64)
                          - 'low' (float64)
                          - 'close' (float64)
                          - 'volume' (float64)
                          The index should be a clean numeric range (0..N).
        """
        pass
