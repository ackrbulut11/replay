import requests
import pandas as pd
from datetime import datetime, timedelta
from .base import IDataProvider
from . import twelvedata
from app.utils.time import utc_now


class ForexProvider(IDataProvider):
    """
    Yahoo Finance API kullanarak Forex (FX) pariteleri için OHLCV veri sağlayıcı.
    Örn: EUR/USD -> EURUSD=X, USD/TRY -> USDTRY=X
    """

    def fetch_ohlcv(
        self,
        symbol: str,
        timeframe: str,
        start_time: datetime,
        end_time: datetime,
        allow_gap_fill: bool = True,
    ) -> pd.DataFrame:
        sym_clean = symbol.upper().replace("/", "").replace("-", "").strip()
        
        # Ticker hazırlama (Yahoo Finance Forex ticker formatı: EURUSD=X)
        if not sym_clean.endswith("=X"):
            ticker = f"{sym_clean}=X"
        else:
            ticker = sym_clean

        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
        
        tf_map = {
            "1m": "1m",
            "5m": "5m",
            "15m": "15m",
            "1h": "1h",
            "1d": "1d",
            "1w": "1wk",
            "1mo": "1mo"
        }
        
        interval = tf_map.get(timeframe)
        if not interval:
            raise ValueError(f"Unsupported timeframe: {timeframe} for Forex provider.")
            
        # Yahoo Finance zaman dilimi sınırlarını otomatik ayarla (HTTP 422 engellemek için)
        now = utc_now()
        requested_start = start_time
        max_start = None
        if interval == "1m":
            max_start = now - timedelta(days=6)
        elif interval in ["5m", "15m", "30m"]:
            max_start = now - timedelta(days=58)
        elif interval == "1h":
            max_start = now - timedelta(days=700)

        # İstenen aralığın TAMAMI Yahoo'nun penceresinin gerisindeyse Yahoo'ya
        # hiç gitme: period1 > period2 olur ve 400 döner. Twelve Data'ya bırak.
        needs_yahoo = max_start is None or end_time > max_start
        if needs_yahoo and max_start is not None and requested_start < max_start:
            start_time = max_start

        if needs_yahoo:
            params = {
                "period1": int(start_time.timestamp()),
                "period2": int(end_time.timestamp()),
                "interval": interval,
                "includePrePost": "false"
            }

            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }

            try:
                response = requests.get(url, params=params, headers=headers, timeout=15)
                response.raise_for_status()
                res_data = response.json()
            except requests.exceptions.HTTPError as e:
                if response.status_code == 404:
                    raise RuntimeError(f"Forex paritesi bulunamadı ({symbol} / {ticker}).")
                raise RuntimeError(f"Forex HTTP hatası ({response.status_code}): {e}")
            except Exception as e:
                raise RuntimeError(f"Forex veri çekme hatası: {str(e)}")

            chart = res_data.get("chart", {})
            result_list = chart.get("result", [])

            if not result_list or result_list is None:
                err = chart.get("error", {})
                err_msg = err.get("description", "No data returned") if err else "No data returned"
                raise RuntimeError(f"Forex API hatası ({symbol}): {err_msg}")

            data = result_list[0]
            timestamps = data.get("timestamp", [])
            quote = data.get("indicators", {}).get("quote", [{}])[0]
        else:
            timestamps = []
            quote = {}

        if timestamps:
            opens = quote.get("open", [])
            highs = quote.get("high", [])
            lows = quote.get("low", [])
            closes = quote.get("close", [])
            volumes = quote.get("volume", [])

            df = pd.DataFrame({
                "timestamp": timestamps,
                "open": opens,
                "high": highs,
                "low": lows,
                "close": closes,
                "volume": volumes
            })

            df['timestamp'] = pd.to_datetime(df['timestamp'], unit='s')

            if timeframe in ["1d", "1w", "1mo"]:
                df['timestamp'] = df['timestamp'].dt.normalize()
                df.drop_duplicates(subset=['timestamp'], keep='last', inplace=True)

            df.dropna(subset=['open', 'high', 'low', 'close'], inplace=True)
            df['volume'] = df['volume'].fillna(0.0).astype(float)
            for col in ['open', 'high', 'low', 'close']:
                df[col] = df[col].astype(float)
            df = df.reset_index(drop=True)
        else:
            df = pd.DataFrame(columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])

        # Yahoo'nun intraday penceresi istenen başlangıcın gerisinde kaldıysa
        # (bkz. max_start yukarıda) boşluğu Twelve Data'dan doldur. `allow_gap_fill`
        # kapalıysa (replay pencere yolu — bkz. IDataProvider docstring'i) bu
        # adım tamamen atlanır.
        gap_end = min(max_start, end_time) if max_start is not None else None
        if allow_gap_fill and gap_end is not None and requested_start < gap_end and twelvedata.is_configured():
            older = twelvedata.fetch_ohlcv(
                sym_clean, timeframe, requested_start, gap_end, symbol_style="forex"
            )
            if not older.empty:
                df = older if df.empty else (
                    pd.concat([older, df], ignore_index=True)
                    .drop_duplicates(subset='timestamp', keep='last')
                    .sort_values('timestamp')
                    .reset_index(drop=True)
                )

        if df.empty:
            return df

        # Yahoo Finance'ın Forex günlük barlarında ürettiği Open == Close anomalisini düzelt (Kırmızı/Yeşil mum dengesi için)
        if len(df) > 5 and (df['open'] == df['close']).mean() > 0.3:
            shifted_open = df['close'].shift(1)
            df.loc[df['open'] == df['close'], 'open'] = shifted_open
            df['open'] = df['open'].fillna(df['close'])

        # Forex paritelerinde sıfır gelen hacim verisi yerine TradingView/MetaTrader standartlarında
        # mum oynaklığına (High - Low) dayalı gerçekçi Tick Hacmi (Tick Volume Proxy) üret
        if df['volume'].sum() == 0 or (df['volume'] == 0).all():
            avg_price = df['close'].mean()
            pip = 0.01 if avg_price > 20 else 0.0001
            range_diff = (df['high'] - df['low']).abs()
            df['volume'] = (range_diff / pip * 15.0).round().clip(lower=50.0)

        return df.reset_index(drop=True)
