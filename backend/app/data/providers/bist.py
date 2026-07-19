import pandas as pd
from datetime import datetime
from .nasdaq import NasdaqProvider

class BistProvider(NasdaqProvider):
    def fetch_ohlcv(self, symbol: str, timeframe: str, start_time: datetime, end_time: datetime) -> pd.DataFrame:
        symbol = symbol.upper()
        # Automatically append BIST suffix if not already present
        if not symbol.endswith(".IS") and not symbol.startswith("^"):
            bist_symbol = f"{symbol}.IS"
        else:
            bist_symbol = symbol
            
        # Leverage the Yahoo Finance implementation from NasdaqProvider
        return super().fetch_ohlcv(bist_symbol, timeframe, start_time, end_time)
