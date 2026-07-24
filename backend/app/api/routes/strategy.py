"""
Strateji API Routes.

CRUD endpointleri ve strateji değerlendirme.
İş mantığı strategy_engine ve rule engine'de (RULES.md #9).
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.data.loader import DataLoader
from app.engines.strategy_engine import StrategyEngine
from app.indicators.registry import IndicatorRegistry
from app.rules.strategy_models import (
    EvaluateRequest,
    EvaluateResponse,
    IndicatorInfo,
    SignalResult,
    StrategyCreateRequest,
    StrategyModel,
    StrategyUpdateRequest,
)

router = APIRouter(prefix="/strategy", tags=["strategy"])

# Singleton instance'lar
_engine = StrategyEngine()
_loader = DataLoader()


@router.get("/list")
def list_strategies():
    """Tüm kayıtlı stratejileri listeler."""
    strategies = _engine.list_strategies()
    return {"strategies": strategies, "count": len(strategies)}


@router.get("/indicators")
def get_available_indicators():
    """Kullanılabilir indikatör listesini döndürür."""
    indicators = IndicatorRegistry.list_indicators()
    return {"indicators": indicators}


@router.get("/{strategy_id}")
def get_strategy(strategy_id: str):
    """Belirtilen ID'ye sahip strateji detayını döndürür."""
    strategy = _engine.get_strategy(strategy_id)
    if strategy is None:
        raise HTTPException(status_code=404, detail=f"Strateji bulunamadı: {strategy_id}")
    return strategy


@router.post("")
def create_strategy(request: StrategyCreateRequest):
    """Yeni strateji oluşturur."""
    try:
        strategy = _engine.create_strategy(request)
        return {"message": "Strateji oluşturuldu", "strategy": strategy}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{strategy_id}")
def update_strategy(strategy_id: str, request: StrategyUpdateRequest):
    """Mevcut stratejiyi günceller."""
    result = _engine.update_strategy(strategy_id, request)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Strateji bulunamadı: {strategy_id}")
    return {"message": "Strateji güncellendi", "strategy": result}


@router.delete("/{strategy_id}")
def delete_strategy(strategy_id: str):
    """Stratejiyi siler."""
    success = _engine.delete_strategy(strategy_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Strateji bulunamadı: {strategy_id}")
    return {"message": "Strateji silindi", "strategy_id": strategy_id}


@router.post("/{strategy_id}/evaluate")
def evaluate_strategy(strategy_id: str, request: EvaluateRequest):
    """
    Stratejiyi verilen sembol/timeframe üzerinde çalıştırır.

    Sinyalleri döndürür (BUY/SELL noktaları).
    """
    # Strateji var mı kontrol et
    strategy = _engine.get_strategy(strategy_id)
    if strategy is None:
        raise HTTPException(status_code=404, detail=f"Strateji bulunamadı: {strategy_id}")

    # Tarih aralığını hazırla
    from datetime import timedelta

    if request.end:
        try:
            end_dt = datetime.strptime(request.end, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="Geçersiz bitiş tarihi formatı (YYYY-MM-DD)")
    else:
        end_dt = datetime.now()

    if request.start:
        try:
            start_dt = datetime.strptime(request.start, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="Geçersiz başlangıç tarihi formatı (YYYY-MM-DD)")
    else:
        # Akıllı varsayılan
        if request.limit_bars == 0:
            if request.timeframe in ("1m", "5m", "15m"):
                start_dt = end_dt - timedelta(days=90)
            elif request.timeframe in ("1h", "4h"):
                start_dt = end_dt - timedelta(days=365 * 3)
            else:
                start_dt = datetime(2010, 1, 1)
        elif request.timeframe in ("1m", "5m", "15m"):
            start_dt = end_dt - timedelta(days=14)
        elif request.timeframe in ("1h", "4h"):
            start_dt = end_dt - timedelta(days=180)
        else:
            start_dt = end_dt - timedelta(days=5 * 365)

    # Ana zaman dilimi verisini yükle
    try:
        df = _loader.load_data(
            provider_name=request.provider,
            symbol=request.symbol,
            timeframe=request.timeframe,
            start_time=start_dt,
            end_time=end_dt,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Veri yükleme hatası: {e}")

    if df.empty:
        raise HTTPException(status_code=404, detail="Belirtilen aralıkta veri bulunamadı")

    # Çoklu timeframe verilerini yükle (varsa)
    multi_tf_data: dict = {}
    tf_filters = strategy.get("timeframe_filters", [])
    for tf_filter in tf_filters:
        tf = tf_filter.get("timeframe")
        if tf and tf not in multi_tf_data:
            try:
                tf_df = _loader.load_data(
                    provider_name=request.provider,
                    symbol=request.symbol,
                    timeframe=tf,
                    start_time=start_dt,
                    end_time=end_dt,
                )
                if not tf_df.empty:
                    multi_tf_data[tf] = tf_df
            except Exception as e:
                print(f"Uyarı: {tf} timeframe verisi yüklenemedi: {e}")

    # Stratejiye ait koşullardan da farklı timeframe referansları çıkar
    for rule_key in ("entry_rules", "exit_rules"):
        rules = strategy.get(rule_key, {})
        for condition in rules.get("conditions", []):
            for side in ("left", "right", "right2"):
                operand = condition.get(side)
                if operand and operand.get("timeframe"):
                    tf = operand["timeframe"]
                    if tf not in multi_tf_data:
                        try:
                            tf_df = _loader.load_data(
                                provider_name=request.provider,
                                symbol=request.symbol,
                                timeframe=tf,
                                start_time=start_dt,
                                end_time=end_dt,
                            )
                            if not tf_df.empty:
                                multi_tf_data[tf] = tf_df
                        except Exception:
                            pass

    # Limit bars logic
    limit_bars = 1000
    if request.limit_bars is not None:
        limit_bars = request.limit_bars

    if limit_bars > 0 and len(df) > limit_bars:
        df = df.tail(limit_bars).reset_index(drop=True)

    # Değerlendir
    try:
        result = _engine.evaluate(
            strategy_id=strategy_id,
            df=df,
            param_overrides=request.param_overrides,
            multi_tf_data=multi_tf_data if multi_tf_data else None,
            allow_short=request.allow_short,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Değerlendirme hatası: {e}")

    return EvaluateResponse(
        strategy_id=result["strategy_id"],
        strategy_name=result["strategy_name"],
        symbol=request.symbol,
        provider=request.provider,
        timeframe=request.timeframe,
        total_bars=result["total_bars"],
        signals=[
            SignalResult(
                timestamp=s["timestamp"],
                signal=s["signal"],
                price=s.get("price", 0.0),
                conditions_met=s["conditions_met"],
                entry_price=s.get("entry_price"),
                pnl_percent=s.get("pnl_percent"),
            )
            for s in result["signals"]
        ],
        buy_count=result["buy_count"],
        sell_count=result["sell_count"],
        total_trades=result.get("total_trades", 0),
        winning_trades=result.get("winning_trades", 0),
        losing_trades=result.get("losing_trades", 0),
        win_rate=result.get("win_rate", 0.0),
        total_pnl_percent=result.get("total_pnl_percent", 0.0),
    )
