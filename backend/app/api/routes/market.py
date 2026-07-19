from fastapi import APIRouter, HTTPException, Query
from datetime import datetime
from typing import Optional
from app.data.loader import DataLoader

router = APIRouter(prefix="/market", tags=["market"])
loader = DataLoader()

@router.get("/data")
def get_market_data(
    provider: str = Query(..., description="Data provider (binance, nasdaq, bist)"),
    symbol: str = Query(..., description="Market symbol (e.g. BTCUSDT, AAPL, THYAO)"),
    timeframe: str = Query(..., description="Timeframe (1m, 5m, 15m, 1h, 4h, 1d)"),
    start: Optional[str] = Query(None, description="Start date (YYYY-MM-DD or YYYY-MM-DD HH:MM:SS)"),
    end: Optional[str] = Query(None, description="End date (YYYY-MM-DD or YYYY-MM-DD HH:MM:SS). Defaults to now.")
):
    # Handle empty strings from client
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
        # Smart default based on timeframe
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
            
        # Format for lightweight-charts:
        # time should be unix timestamp in seconds
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
