"""
Strateji API Routes.

CRUD endpointleri ve strateji değerlendirme.
İş mantığı strategy_engine ve rule engine'de (RULES.md #9).
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Depends
from sqlalchemy.orm import Session

from app.database.postgres import get_db
from app.database.models import User, Strategy
from app.auth.dependencies import get_current_user_optional
from app.data.loader import DataLoader
from app.engines.scanner_engine import ScannerEngine
from app.engines.strategy_engine import StrategyEngine
from app.indicators.registry import IndicatorRegistry
from app.rules.strategy_models import (
    BatchEvaluateRequest,
    BatchEvaluateResponse,
    BatchEvaluateResultItem,
    EvaluateRequest,
    EvaluateResponse,
    IndicatorInfo,
    SaveScanRequest,
    ScanHistoryItem,
    SignalResult,
    StrategyCreateRequest,
    StrategyModel,
    StrategyUpdateRequest,
)

router = APIRouter(prefix="/strategy", tags=["strategy"])

# Singleton instance'lar
_engine = StrategyEngine()
_scanner = ScannerEngine()
_loader = DataLoader()



@router.get("/list")
def list_strategies(current_user: Optional[User] = Depends(get_current_user_optional)):
    """Tüm kayıtlı stratejileri listeler (kullanıcıya özel filtreli)."""
    user_id = current_user.id if current_user else None
    strategies = _engine.list_strategies(user_id=user_id)
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
def create_strategy(
    request: StrategyCreateRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """Yeni strateji oluşturur."""
    try:
        user_id = current_user.id if current_user else request.user_id
        strategy = _engine.create_strategy(request, user_id=user_id)

        # Ayrıca SQL veritabanındaki Strategy tablosuna da kaydet
        if user_id:
            try:
                sql_strat = Strategy(
                    id=strategy["id"],
                    user_id=user_id,
                    name=strategy["name"],
                    description=strategy.get("description", ""),
                    content=json.dumps(strategy, ensure_ascii=False)
                )
                db.add(sql_strat)
                db.commit()
            except Exception as sql_err:
                db.rollback()
                print(f"SQL strategy save note: {sql_err}")

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


@router.post("/{strategy_id}/batch-evaluate")
def batch_evaluate_strategy(strategy_id: str, request: BatchEvaluateRequest):
    """
    Stratejiyi birden fazla sembol üzerinde paralel olarak değerlendirir.
    """
    strategy = _engine.get_strategy(strategy_id)
    if strategy is None:
        raise HTTPException(status_code=404, detail=f"Strateji bulunamadı: {strategy_id}")

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
        if request.timeframe in ("1m", "5m", "15m"):
            start_dt = end_dt - timedelta(days=30)
        elif request.timeframe in ("1h", "4h"):
            start_dt = end_dt - timedelta(days=180)
        else:
            start_dt = end_dt - timedelta(days=365 * 2)

    limit_bars = request.limit_bars if request.limit_bars is not None else 1000

    results_raw = _engine.evaluate_batch(
        strategy_id=strategy_id,
        symbols=request.symbols,
        provider=request.provider,
        timeframe=request.timeframe,
        loader=_loader,
        start_dt=start_dt,
        end_dt=end_dt,
        limit_bars=limit_bars,
        param_overrides=request.param_overrides,
        allow_short=request.allow_short,
    )

    results_items = [
        BatchEvaluateResultItem(
            symbol=r["symbol"],
            total_bars=r.get("total_bars", 0),
            buy_count=r.get("buy_count", 0),
            sell_count=r.get("sell_count", 0),
            total_trades=r.get("total_trades", 0),
            winning_trades=r.get("winning_trades", 0),
            losing_trades=r.get("losing_trades", 0),
            win_rate=r.get("win_rate", 0.0),
            total_pnl_percent=r.get("total_pnl_percent", 0.0),
            last_signal=r.get("last_signal"),
            last_signal_time=r.get("last_signal_time"),
            error=r.get("error"),
        )
        for r in results_raw
    ]

    # Otomatik olarak tarama geçmişine de kaydet
    _scanner.save_scan(
        strategy_id=strategy_id,
        strategy_name=strategy.get("name", "Strateji"),
        provider=request.provider,
        timeframe=request.timeframe,
        results=results_items,
    )

    return BatchEvaluateResponse(
        strategy_id=strategy_id,
        strategy_name=strategy.get("name", ""),
        provider=request.provider,
        timeframe=request.timeframe,
        scanned_count=len(results_items),
        results=results_items,
    )


@router.get("/{strategy_id}/scans")
def get_strategy_scans(strategy_id: str):
    """Bir stratejiye ait geçmiş tarama kayıtlarını döndürür."""
    strategy = _engine.get_strategy(strategy_id)
    if strategy is None:
        raise HTTPException(status_code=404, detail=f"Strateji bulunamadı: {strategy_id}")

    scans = _scanner.get_scans(strategy_id)
    latest = _scanner.get_latest_scan(strategy_id)
    return {"strategy_id": strategy_id, "scans": scans, "latest": latest}


@router.post("/{strategy_id}/scans")
def save_strategy_scan(strategy_id: str, request: SaveScanRequest):
    """Strateji tarama sonucunu manuel olarak kaydeder."""
    strategy = _engine.get_strategy(strategy_id)
    if strategy is None:
        raise HTTPException(status_code=404, detail=f"Strateji bulunamadı: {strategy_id}")

    scan_item = _scanner.save_scan(
        strategy_id=strategy_id,
        strategy_name=strategy.get("name", "Strateji"),
        provider=request.provider,
        timeframe=request.timeframe,
        results=request.results,
    )
    return {"message": "Tarama kaydedildi", "scan": scan_item}

