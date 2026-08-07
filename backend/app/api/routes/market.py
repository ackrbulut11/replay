from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Optional, List, Dict

from fastapi import APIRouter, HTTPException, Query

from app.data.loader import (
    DataLoader,
    SOURCE_TIMEFRAME_COLUMN,
    WINDOW_BARS_AFTER,
    WINDOW_BARS_BEFORE,
)
from app.data.symbols import get_symbols, search_symbols

router = APIRouter(prefix="/market", tags=["market"])
loader = DataLoader()

@router.get("/symbols")
def list_symbols(
    provider: Optional[str] = Query(None, description="Optional provider filter (binance, nasdaq, bist)")
) -> List[Dict[str, str]]:
    """Returns catalog of stocks/symbols with names and sectors."""
    return get_symbols(provider)

@router.get("/search")
def search_market_symbols(
    q: str = Query("", description="Search query string"),
    provider: Optional[str] = Query(None, description="Optional provider filter (binance, nasdaq, bist)")
) -> List[Dict[str, str]]:
    """Search for symbols across BIST, NASDAQ, and Binance."""
    return search_symbols(q, provider)


@router.get("/quotes")
def get_market_quotes(
    items: str = Query(..., description="Comma-separated provider:symbol pairs, e.g. bist:THYAO,nasdaq:AAPL,binance:BTCUSDT")
) -> List[Dict]:
    """Returns latest price and daily change percentage for a list of symbols concurrently."""
    from datetime import timedelta
    end_dt = datetime.now()
    start_dt = end_dt - timedelta(days=14)

    item_pairs = [i.strip() for i in items.split(",") if i.strip()]

    def fetch_single_quote(item: str) -> Dict:
        parts = item.split(":")
        if len(parts) != 2:
            return {"provider": "", "symbol": item, "lastPrice": None, "change": None, "changePercent": None}
        provider, symbol = parts[0].lower(), parts[1].upper()
        try:
            df = loader.load_data(
                provider_name=provider,
                symbol=symbol,
                timeframe="1d",
                start_time=start_dt,
                end_time=end_dt
            )
            if df.empty or len(df) == 0:
                return {
                    "provider": provider,
                    "symbol": symbol,
                    "lastPrice": None,
                    "change": None,
                    "changePercent": None
                }

            if len(df) >= 2:
                last_close = float(df.iloc[-1]["close"])
                prev_close = float(df.iloc[-2]["close"])
            else:
                last_close = float(df.iloc[-1]["close"])
                prev_close = float(df.iloc[-1]["open"])

            change = last_close - prev_close
            change_percent = (change / prev_close * 100.0) if prev_close != 0 else 0.0

            return {
                "provider": provider,
                "symbol": symbol,
                "lastPrice": round(last_close, 4 if provider in ("binance", "forex", "fx") else 2),
                "change": round(change, 4 if provider in ("binance", "forex", "fx") else 2),
                "changePercent": round(change_percent, 2)
            }
        except Exception:
            return {
                "provider": provider,
                "symbol": symbol,
                "lastPrice": None,
                "change": None,
                "changePercent": None
            }

    with ThreadPoolExecutor(max_workers=16) as executor:
        results = list(executor.map(fetch_single_quote, item_pairs))

    return results



@router.get("/coverage")
def get_market_coverage(
    provider: str = Query(..., description="Data provider (binance, nasdaq, bist)"),
    symbol: str = Query(..., description="Market symbol (e.g. BTCUSDT, AAPL, THYAO)"),
    timeframe: str = Query(..., description="Timeframe (1m, 5m, 15m, 1h, 4h, 1d)"),
):
    """
    Bir zaman dilimi için önbellekteki tarih aralığını döndürür.

    Replay sırasında zaman dilimi değiştirilirken, hedef tarihin o
    çözünürlükte var olup olmadığını veri indirmeden kontrol etmek için
    kullanılır. Önbellek yoksa `available: false` döner — bu "veri yok"
    değil "bilinmiyor" demektir, istemci buna dayanarak engelleme yapmaz.
    """
    coverage = loader.get_coverage(provider, symbol, timeframe)
    if coverage is None:
        return {"available": False, "provider": provider, "symbol": symbol.upper(), "timeframe": timeframe}
    return {"available": True, "provider": provider, "symbol": symbol.upper(), "timeframe": timeframe, **coverage}


def _to_chart_candles(df) -> list[dict]:
    """
    DataFrame'i lightweight-charts'ın beklediği biçime çevirir (zaman = saniye).

    Karma pencerede (bkz. loader `_stitched_window`) her mum, geldiği zaman
    dilimini `tf` alanıyla taşır; istemci dikişin nerede olduğunu buradan
    anlar. Tek dilimli pencerelerde alan hiç eklenmez.
    """
    if df is None or df.empty:
        return []
    tagged = SOURCE_TIMEFRAME_COLUMN in df.columns
    candles = []
    for _, row in df.iterrows():
        candle = {
            "time": int(row["timestamp"].timestamp()),
            "open": float(row["open"]),
            "high": float(row["high"]),
            "low": float(row["low"]),
            "close": float(row["close"]),
            "volume": float(row["volume"]),
        }
        if tagged:
            candle["tf"] = str(row[SOURCE_TIMEFRAME_COLUMN])
        candles.append(candle)
    return candles


@router.get("/window")
def get_market_window(
    provider: str = Query(..., description="Data provider (binance, nasdaq, bist)"),
    symbol: str = Query(..., description="Market symbol (e.g. BTCUSDT, AAPL, THYAO)"),
    timeframe: str = Query(..., description="Timeframe (1m, 5m, 15m, 1h, 4h, 1d)"),
    anchor: int = Query(..., description="Pencerenin merkezi — saniye cinsinden unix zaman damgası"),
    bars_before: int = Query(WINDOW_BARS_BEFORE, gt=0, le=5000, description="Çapanın gerisindeki mum sayısı"),
    bars_after: int = Query(WINDOW_BARS_AFTER, gt=0, le=5000, description="Çapanın ilerisindeki mum sayısı"),
):
    """
    `anchor` etrafındaki sabit sayıda mumu döndürür — replay'de zaman dilimi
    değiştirmek için.

    `/data`'dan farkı: maliyeti çapanın ne kadar geride olduğuna bağlı DEĞİLDİR.
    `/data` bitişik bir parquet önbelleği tuttuğu için uzak bir tarih istendiğinde
    aradaki tüm boşluğu indiriyor (15dk'da 2019 için ~210 sayfa, dakikalar).
    Burada her zaman `bars_before + bars_after` mum çekilir — ölçümde 2019 da
    2022 de 0,65 s.

    Çapa, sağlayıcının bu zaman dilimindeki geçmişinden eskiyse pencere KARMA
    döner: geçmiş bölüm bir üst zaman diliminden, ince mumların başladığı
    tarihten sonrası istenen dilimden. O durumda her mum geldiği dilimi `tf`
    alanıyla taşır (bkz. `_to_chart_candles`).
    """
    try:
        df = loader.get_window(
            provider_name=provider,
            symbol=symbol,
            timeframe=timeframe,
            anchor=datetime.utcfromtimestamp(anchor),
            bars_before=bars_before,
            bars_after=bars_after,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    return _to_chart_candles(df)


@router.get("/data")
def get_market_data(
    provider: str = Query(..., description="Data provider (binance, nasdaq, bist)"),
    symbol: str = Query(..., description="Market symbol (e.g. BTCUSDT, AAPL, THYAO)"),
    timeframe: str = Query(..., description="Timeframe (1m, 5m, 15m, 1h, 4h, 1d)"),
    start: Optional[str] = Query(None, description="Start date (YYYY-MM-DD or YYYY-MM-DD HH:MM:SS)"),
    end: Optional[str] = Query(None, description="End date (YYYY-MM-DD or YYYY-MM-DD HH:MM:SS). Defaults to now.")
):
    # İstemciden gelen boş dizgileri işle
    start = start if (start and start.strip()) else None
    end = end if (end and end.strip()) else None

    if end:
        try:
            end_dt = datetime.strptime(end, "%Y-%m-%d")
        except ValueError:
            try:
                end_dt = datetime.strptime(end, "%Y-%m-%d %H:%M:%S")
            except ValueError:
                raise HTTPException(
                    status_code=400, 
                    detail="Invalid end date format. Use YYYY-MM-DD or YYYY-MM-DD HH:MM:SS."
                )
    else:
        end_dt = datetime.now()

    if start:
        try:
            start_dt = datetime.strptime(start, "%Y-%m-%d")
        except ValueError:
            try:
                start_dt = datetime.strptime(start, "%Y-%m-%d %H:%M:%S")
            except ValueError:
                raise HTTPException(
                    status_code=400, 
                    detail="Invalid start date format. Use YYYY-MM-DD or YYYY-MM-DD HH:MM:SS."
                )
    else:
        # Zaman dilimine (timeframe) göre akıllı varsayılan
        from datetime import timedelta
        if timeframe == "1mo":
            start_dt = end_dt - timedelta(days=20*365)
        elif timeframe == "1w":
            start_dt = end_dt - timedelta(days=10*365)
        elif timeframe == "1d":
            start_dt = end_dt - timedelta(days=10*365)
        elif timeframe == "4h":
            start_dt = end_dt - timedelta(days=3*365)
        elif timeframe == "1h":
            start_dt = end_dt - timedelta(days=3*365)
        else: # 15m, 5m, 1m
            start_dt = end_dt - timedelta(days=182)  # ~6 ay

    try:
        df = loader.load_data(
            provider_name=provider,
            symbol=symbol,
            timeframe=timeframe,
            start_time=start_dt,
            end_time=end_dt
        )
        return _to_chart_candles(df)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
