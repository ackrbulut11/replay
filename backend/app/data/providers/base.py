from abc import ABC, abstractmethod
from datetime import datetime
import pandas as pd

class IDataProvider(ABC):
    @abstractmethod
    def fetch_ohlcv(
        self,
        symbol: str,
        timeframe: str,
        start_time: datetime,
        end_time: datetime,
        allow_gap_fill: bool = True,
    ) -> pd.DataFrame:
        """
        Fetch historical OHLCV data from the provider.

        Args:
            symbol (str): The market symbol (e.g., 'BTCUSDT', 'AAPL', 'THYAO').
            timeframe (str): The bar duration (e.g., '1m', '5m', '15m', '1h', '1d').
            start_time (datetime): The start date/time of the request.
            end_time (datetime): The end date/time of the request.
            allow_gap_fill (bool): Sağlayıcının kendi tavanının (ör. Yahoo intraday
                sınırı) gerisinde kalan kısmı ikincil bir kaynaktan (Twelve Data)
                doldurup doldurmayacağı. `DataLoader`nin replay pencere yolu
                (`_window_at`/`_earliest_window`) bunu bilerek False geçer: replay
                bir zaman dilimi ARASI geçişte yalnızca o dilimin KENDİ ulaşabildiği
                geçmişi göstermeli — ikincil kaynağa düşmek saniyeler süren bir
                gecikme demekti (bkz. RULES.md'deki performans notu yerine burada:
                ölçümde tek bir dolgu sayfası 10+ sn). `load_data` (normal /data
                yolu) varsayılanı (True) kullanmaya devam eder.

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
