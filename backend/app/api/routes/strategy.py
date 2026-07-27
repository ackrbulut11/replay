"""
Strateji API Routes.

CRUD endpointleri ve strateji değerlendirme.
İş mantığı strategy_engine ve rule engine'de (RULES.md #9).
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database.postgres import get_db
from app.database.models import User
from app.auth.dependencies import get_current_user
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
    SaveScanRequest,
    SignalResult,
    StrategyCreateRequest,
    StrategyUpdateRequest,
)

class ImportEvaluationsRequest(BaseModel):
    """Tarayıcıda kalmış eski test geçmişinin tek seferlik aktarımı."""

    items: List[Dict[str, Any]] = Field(default_factory=list)


router = APIRouter(prefix="/strategy", tags=["strategy"])

# Singleton instance'lar (durum tutmazlar; veritabanı oturumu her istekte verilir)
_engine = StrategyEngine()
_scanner = ScannerEngine()
_loader = DataLoader()


def get_owned_strategy(
    strategy_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """
    Yol parametresindeki stratejiyi yalnızca sahibi için döndürür.

    Sahibi olmayan bir istek 403 değil 404 alır: 403, başkasına ait bir
    stratejinin var olduğunu sızdırırdı.
    """
    strategy = _engine.get_strategy(db, strategy_id, current_user.id)
    if strategy is None:
        raise HTTPException(status_code=404, detail=f"Strateji bulunamadı: {strategy_id}")
    return strategy



@router.get("/list")
def list_strategies(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Yalnızca giriş yapan kullanıcının stratejilerini listeler."""
    strategies = _engine.list_strategies(db, current_user.id)
    return {"strategies": strategies, "count": len(strategies)}


@router.get("/indicators")
def get_available_indicators():
    """Kullanılabilir indikatör listesini döndürür."""
    indicators = IndicatorRegistry.list_indicators()
    return {"indicators": indicators}


# ─── Tekli Test Geçmişi ──────────────────────────────────────────────────────
#
# DİKKAT: Bu uçlar "/{strategy_id}" yolundan ÖNCE tanımlanmalıdır; aksi halde
# yol parametresi "evaluations" kelimesini strateji ID'si sanıp bunları yutar.


@router.get("/evaluations")
def list_evaluations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Kullanıcının tekli test geçmişini döndürür (tüm stratejiler)."""
    items = _engine.list_evaluations(db, current_user.id)
    return {"evaluations": items, "count": len(items)}


@router.post("/evaluations/import")
def import_evaluations(
    request: ImportEvaluationsRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Tarayıcıda kalmış eski geçmişi bir kez veritabanına aktarır.

    Yalnızca sunucuda hiç kayıt yokken çağrılması beklenir; var olan kayıtların
    üzerine yazmamak için sunucu doluysa hiçbir şey yapılmaz.
    """
    if _engine.list_evaluations(db, current_user.id):
        return {"message": "Geçmiş zaten mevcut, aktarım yapılmadı", "imported": 0}

    imported = 0
    for item in request.items:
        req = item.get("request") or {}
        result = item.get("result")
        if not result or not req.get("symbol"):
            continue
        # Stratejinin hâlâ var ve kullanıcıya ait olduğunu doğrula.
        if _engine.get_strategy(db, item.get("strategy_id", ""), current_user.id) is None:
            continue
        _engine.save_evaluation(
            db=db,
            user_id=current_user.id,
            strategy_id=item["strategy_id"],
            strategy_name=item.get("strategy_name", ""),
            request=req,
            result=result,
        )
        imported += 1

    return {"message": "Geçmiş aktarıldı", "imported": imported}


@router.delete("/evaluations")
def clear_evaluations(
    strategy_id: Optional[str] = Query(None, description="Yalnızca bu stratejinin kayıtlarını sil"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Test geçmişini temizler."""
    deleted = _engine.clear_evaluations(db, current_user.id, strategy_id)
    return {"message": "Test geçmişi temizlendi", "deleted": deleted}


@router.delete("/evaluations/{evaluation_id}")
def delete_evaluation(
    evaluation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Tek bir test kaydını siler (yalnızca sahibi)."""
    if not _engine.delete_evaluation(db, evaluation_id, current_user.id):
        raise HTTPException(status_code=404, detail=f"Test kaydı bulunamadı: {evaluation_id}")
    return {"message": "Test kaydı silindi", "evaluation_id": evaluation_id}


# ─── Strateji Detayı ─────────────────────────────────────────────────────────


@router.get("/{strategy_id}")
def get_strategy(strategy: dict = Depends(get_owned_strategy)):
    """Strateji detayını döndürür (yalnızca sahibi)."""
    return strategy


@router.post("")
def create_strategy(
    request: StrategyCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Yeni strateji oluşturur. Sahip, token'daki kullanıcıdır."""
    try:
        strategy = _engine.create_strategy(db, request, user_id=current_user.id)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    return {"message": "Strateji oluşturuldu", "strategy": strategy}


@router.put("/{strategy_id}")
def update_strategy(
    strategy_id: str,
    request: StrategyUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mevcut stratejiyi günceller (yalnızca sahibi)."""
    result = _engine.update_strategy(db, strategy_id, request, current_user.id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Strateji bulunamadı: {strategy_id}")
    return {"message": "Strateji güncellendi", "strategy": result}


@router.delete("/{strategy_id}")
def delete_strategy(
    strategy_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Stratejiyi siler (yalnızca sahibi). Tarama geçmişi de birlikte silinir."""
    success = _engine.delete_strategy(db, strategy_id, current_user.id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Strateji bulunamadı: {strategy_id}")
    return {"message": "Strateji silindi", "strategy_id": strategy_id}


@router.post("/{strategy_id}/evaluate")
def evaluate_strategy(
    request: EvaluateRequest,
    strategy: dict = Depends(get_owned_strategy),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Stratejiyi verilen sembol/timeframe üzerinde çalıştırır (yalnızca sahibi).

    Sinyalleri döndürür (BUY/SELL noktaları).
    """
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
            strategy=strategy,
            df=df,
            param_overrides=request.param_overrides,
            multi_tf_data=multi_tf_data if multi_tf_data else None,
            allow_short=request.allow_short,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Değerlendirme hatası: {e}")

    # Sonucu tekli test geçmişine kaydet (toplu tarama da aynı şekilde davranır).
    # Geçmiş kaydı başarısız olsa bile değerlendirme sonucu döndürülmeli.
    try:
        _engine.save_evaluation(
            db=db,
            user_id=current_user.id,
            strategy_id=strategy["id"],
            strategy_name=strategy.get("name", ""),
            request=request.model_dump(),
            result=result,
        )
    except Exception as e:
        db.rollback()
        print(f"Uyarı: test geçmişi kaydedilemedi: {e}")

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
def batch_evaluate_strategy(
    request: BatchEvaluateRequest,
    strategy: dict = Depends(get_owned_strategy),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Stratejiyi birden fazla sembol üzerinde paralel olarak değerlendirir (yalnızca sahibi).
    """
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
        strategy=strategy,
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

    # Otomatik olarak tarama geçmişine de kaydet (kullanıcıya bağlı)
    _scanner.save_scan(
        db=db,
        strategy_id=strategy["id"],
        strategy_name=strategy.get("name", "Strateji"),
        provider=request.provider,
        timeframe=request.timeframe,
        results=results_items,
        user_id=current_user.id,
    )

    return BatchEvaluateResponse(
        strategy_id=strategy["id"],
        strategy_name=strategy.get("name", ""),
        provider=request.provider,
        timeframe=request.timeframe,
        scanned_count=len(results_items),
        results=results_items,
    )


@router.get("/{strategy_id}/scans")
def get_strategy_scans(
    strategy: dict = Depends(get_owned_strategy),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Bir stratejiye ait tarama geçmişini döndürür (yalnızca sahibi)."""
    scans = _scanner.get_scans(db, strategy["id"], current_user.id)
    latest = scans[0] if scans else None
    return {"strategy_id": strategy["id"], "scans": scans, "latest": latest}


@router.post("/{strategy_id}/scans")
def save_strategy_scan(
    request: SaveScanRequest,
    strategy: dict = Depends(get_owned_strategy),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Strateji tarama sonucunu manuel olarak kaydeder (yalnızca sahibi)."""
    scan_item = _scanner.save_scan(
        db=db,
        strategy_id=strategy["id"],
        strategy_name=strategy.get("name", "Strateji"),
        provider=request.provider,
        timeframe=request.timeframe,
        results=request.results,
        user_id=current_user.id,
    )
    return {"message": "Tarama kaydedildi", "scan": scan_item}

