from fastapi import APIRouter, HTTPException, Query
from datetime import datetime
from typing import Optional, List, Dict
from app.data.loader import DataLoader
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
    """Returns latest price and daily change percentage for a list of symbols."""
    results = []
    from datetime import timedelta
    end_dt = datetime.now()
    start_dt = end_dt - timedelta(days=14)

    item_pairs = [i.strip() for i in items.split(",") if i.strip()]
    for item in item_pairs:
        parts = item.split(":")
        if len(parts) != 2:
            continue
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
                results.append({
                    "provider": provider,
                    "symbol": symbol,
                    "lastPrice": None,
                    "change": None,
                    "changePercent": None
                })
                continue

            if len(df) >= 2:
                last_close = float(df.iloc[-1]["close"])
                prev_close = float(df.iloc[-2]["close"])
            else:
                last_close = float(df.iloc[-1]["close"])
                prev_close = float(df.iloc[-1]["open"])

            change = last_close - prev_close
            change_percent = (change / prev_close * 100.0) if prev_close != 0 else 0.0

            results.append({
                "provider": provider,
                "symbol": symbol,
                "lastPrice": round(last_close, 4 if provider == "binance" else 2),
                "change": round(change, 4 if provider == "binance" else 2),
                "changePercent": round(change_percent, 2)
            })
        except Exception as e:
            results.append({
                "provider": provider,
                "symbol": symbol,
                "lastPrice": None,
                "change": None,
                "changePercent": None,
                "error": str(e)
            })
    return results



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
            start_dt = end_dt - timedelta(days=5*365)
        elif timeframe in ["4h", "1h"]:
            start_dt = end_dt - timedelta(days=180)
        else: # 15m, 5m, 1m
            start_dt = end_dt - timedelta(days=14)

    try:
        df = loader.load_data(
            provider_name=provider,
            symbol=symbol,
            timeframe=timeframe,
            start_time=start_dt,
            end_time=end_dt
        )
        if df.empty:
            return []
            
        # lightweight-charts için format:
        # zaman saniye cinsinden unix zaman damgası olmalıdır
        result = []
        for _, row in df.iterrows():
            result.append({
                "time": int(row["timestamp"].timestamp()),
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"]),
                "volume": float(row["volume"])
            })
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
