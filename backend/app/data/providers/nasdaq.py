import requests
import pandas as pd
from datetime import datetime
from .base import IDataProvider
from . import twelvedata
from app.utils.time import utc_now

SYMBOL_ALIASES = {
    "NVIDIA": "NVDA",
    "GOOGLE": "GOOGL",
    "ALPHABET": "GOOGL",
    "APPLE": "AAPL",
    "AMAZON": "AMZN",
    "MICROSOFT": "MSFT",
    "FACEBOOK": "META",
    "TESLA": "TSLA",
    "NETFLIX": "NFLX",
    "INTEL": "INTC",

    # Endeksler (Yahoo Finance önekli/son ekli endeks sembolleri kısa kodlarla eşlenir)
    "XU100": "XU100.IS",
    "BIST100": "XU100.IS",
    "XU030": "XU030.IS",
    "XU30": "XU030.IS",
    "BIST30": "XU030.IS",
    "SPX": "^GSPC",
    "SP500": "^GSPC",
    "DJI": "^DJI",
    "DOW30": "^DJI",
    "NDX": "^NDX",
    "NASDAQ100": "^NDX",
    "DAX40": "^GDAXI",
    "DAX": "^GDAXI",
    "FTSE100": "^FTSE",
    "FTSE350": "^FTLC",

    # Emtialar (Yahoo Finance vadeli işlem (futures) sembolleri)
    "XAUUSD": "GC=F",
    "GOLD": "GC=F",
    "XAGUSD": "SI=F",
    "SILVER": "SI=F",
    "XPTUSD": "PL=F",
    "PLATINUM": "PL=F",
    "XPDUSD": "PA=F",
    "PALLADIUM": "PA=F",
    "BRENT": "BZ=F",
    "WTI": "CL=F",
    "NATGAS": "NG=F",
    "COPPER": "HG=F",
}

class NasdaqProvider(IDataProvider):
    def fetch_ohlcv(
        self,
        symbol: str,
        timeframe: str,
        start_time: datetime,
        end_time: datetime,
        allow_gap_fill: bool = True,
    ) -> pd.DataFrame:
        sym = symbol.upper().strip()
        ticker = SYMBOL_ALIASES.get(sym, sym)

        # Yahoo Finance adresi
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
        
        # Zaman dilimini Yahoo Finance aralığına eşle
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
            raise ValueError(f"Unsupported timeframe: {timeframe} for Yahoo Finance provider.")
            
        # Yahoo Finance zaman dilimi sınırlarını otomatik ayarla (HTTP 422 engellemek için)
        from datetime import timedelta
        now = utc_now()
        requested_start = start_time
        max_start = None
        if interval == "1m":
            max_start = now - timedelta(days=6)
        elif interval in ["5m", "15m", "30m"]:
            max_start = now - timedelta(days=58)
        elif interval == "1h":
            max_start = now - timedelta(days=700)

        # İstenen aralığın TAMAMI Yahoo'nun penceresinin gerisindeyse (ör. replay
        # konumu 2021'de ve zaman dilimi 1h) Yahoo'ya hiç gitme: period1 > period2
        # olur ve 400 döner. Twelve Data'ya bütünüyle bırak.
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

            # User-Agent gereklidir, aksi takdirde Yahoo Finance HTTP 403 döndürür
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }

            try:
                response = requests.get(url, params=params, headers=headers, timeout=15)
                response.raise_for_status()
                res_data = response.json()
            except requests.exceptions.HTTPError as e:
                if response.status_code == 404:
                    raise RuntimeError(
                        f"Yahoo Finance sembolü bulamadı ({symbol}). "
                        f"NASDAQ hisseleri için şirket adı yerine borsa kodunu kullandığınızdan emin olun (Örn: NVIDIA yerine NVDA, APPLE yerine AAPL, TESLA yerine TSLA)."
                    )
                raise RuntimeError(f"Yahoo Finance HTTP hatası ({response.status_code}): {e}")
            except Exception as e:
                raise RuntimeError(f"Yahoo Finance veri çekme hatası: {str(e)}")

            chart = res_data.get("chart", {})
            result_list = chart.get("result", [])

            if not result_list or result_list is None:
                # Yahoo Finance'tan gelebilecek olası hata mesajını işle
                err = chart.get("error", {})
                err_msg = err.get("description", "Unknown error") if err else "No data returned"
                raise RuntimeError(f"Yahoo Finance API error for symbol {symbol}: {err_msg}")

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

            # DataFrame oluştur
            df = pd.DataFrame({
                "timestamp": timestamps,
                "open": opens,
                "high": highs,
                "low": lows,
                "close": closes,
                "volume": volumes
            })

            # Zaman damgasını dönüştür
            df['timestamp'] = pd.to_datetime(df['timestamp'], unit='s')

            # Günlük ve üzeri zaman dilimlerinde zaman damgalarını gün başına sıfırla (normalize et)
            if timeframe in ["1d", "1w", "1mo"]:
                df['timestamp'] = df['timestamp'].dt.normalize()
                df.drop_duplicates(subset=['timestamp'], keep='last', inplace=True)

            # Null değerleri temizle (Yahoo işlem yapılmayan dönemler için null döndürür)
            df.dropna(subset=['open', 'high', 'low', 'close'], inplace=True)

            # Eksik hacimleri doldur ve veri tiplerini dönüştür
            df['volume'] = df['volume'].fillna(0.0).astype(float)
            for col in ['open', 'high', 'low', 'close']:
                df[col] = df[col].astype(float)
            df = df.reset_index(drop=True)
        else:
            df = pd.DataFrame(columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])

        # Yahoo'nun intraday penceresi istenen başlangıcın gerisinde kaldıysa
        # (bkz. max_start yukarıda) boşluğu Twelve Data'dan doldur. Yalnızca
        # gerçekten Yahoo'nun ulaşamadığı kısım istenir — kotayı korumak için.
        #
        # `allow_gap_fill=False` iken bu adım tamamen atlanır (bkz. IDataProvider
        # docstring'i): replay pencere yolu bunu bilerek kapatır, çünkü ikincil
        # kaynağa düşmek saniyeler süren bir gecikme demekti.
        gap_end = min(max_start, end_time) if max_start is not None else None
        if allow_gap_fill and gap_end is not None and requested_start < gap_end and twelvedata.is_configured():
            older = twelvedata.fetch_ohlcv(
                ticker, timeframe, requested_start, gap_end, symbol_style="stock"
            )
            if not older.empty:
                df = older if df.empty else (
                    pd.concat([older, df], ignore_index=True)
                    .drop_duplicates(subset='timestamp', keep='last')
                    .sort_values('timestamp')
                    .reset_index(drop=True)
                )

        return df

