"""
Alarm REST API uçları.

Tüm uçlar giriş gerektirir ve yalnızca isteği yapan kullanıcının kendi
alarmlarına erişir. İş mantığı alerts/engine.py içindedir (RULES.md #9).
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.alerts.engine import AlertEngine
from app.alerts.models import (
    AlertCheckRequest,
    AlertCheckResponse,
    AlertCreateRequest,
    AlertUpdateRequest,
)
from app.auth.dependencies import get_current_user
from app.data.loader import loader as shared_loader
from app.database.models import User
from app.database.postgres import get_db

router = APIRouter(prefix="/alerts", tags=["alerts"])
_engine = AlertEngine()
# Alarm değerlendirmesi gösterge hesabı için piyasa verisine ihtiyaç duyar;
# loader'ın kendi önbelleği olduğu için tekil örnek paylaşılır.
# Paylasilan tek ornek: her route kendi DataLoader()'ini yaratinca RAM
# onbellegi kopyalaniyor ve parquet kilitleri ayri ayri calisip ise
# yaramiyordu (bkz. data/loader.py sonundaki not).
_loader = shared_loader


def get_owned_alert(
    alert_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """
    Yol parametresindeki alarmı yalnızca sahibi için döndürür.

    Sahibi olmayan bir istek 403 değil 404 alır: 403, başkasına ait bir
    alarmın var olduğunu sızdırırdı.
    """
    alert = _engine.get_alert(db, alert_id, current_user.id)
    if alert is None:
        raise HTTPException(status_code=404, detail=f"Alarm bulunamadı: {alert_id}")
    return alert


@router.get("")
@router.get("/list")
def list_alerts(
    symbol: Optional[str] = Query(None, description="Sembol filtresi"),
    status: Optional[str] = Query(None, description="Durum filtresi (ACTIVE, TRIGGERED, DISABLED)"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Giriş yapan kullanıcının alarmlarını listeler."""
    alerts = _engine.list_alerts(db, current_user.id, symbol=symbol, status=status)
    return {"alerts": alerts, "count": len(alerts)}


@router.get("/{alert_id}")
def get_alert(alert: dict = Depends(get_owned_alert)):
    """Alarm detayını döndürür (yalnızca sahibi)."""
    return alert


@router.post("")
def create_alert(
    request: AlertCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Yeni fiyat veya gösterge alarmı oluşturur."""
    try:
        alert = _engine.create_alert(db, request, user_id=current_user.id)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    return {"message": "Alarm oluşturuldu", "alert": alert}


@router.put("/{alert_id}")
def update_alert(
    alert_id: str,
    request: AlertUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Alarmın durumunu veya eşiğini günceller (yalnızca sahibi)."""
    result = _engine.update_alert(db, alert_id, request, current_user.id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Alarm bulunamadı: {alert_id}")
    return {"message": "Alarm güncellendi", "alert": result}


@router.delete("/{alert_id}")
def delete_alert(
    alert_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Alarmı siler (yalnızca sahibi)."""
    if not _engine.delete_alert(db, alert_id, current_user.id):
        raise HTTPException(status_code=404, detail=f"Alarm bulunamadı: {alert_id}")
    return {"message": "Alarm silindi", "alert_id": alert_id}


@router.post("/check")
def check_alerts(
    request: AlertCheckRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Kullanıcının etkin alarmlarını değerlendirir.

    Fiyat ve gösterge değerleri sunucuda, alarmın kendi zaman diliminde
    yüklenen veriden hesaplanır (istekteki `current_price`/`indicator_values`
    yalnızca eski istemcilerle uyum için kabul edilir, kullanılmaz).
    """
    try:
        triggered = _engine.check_alerts(
            db=db,
            symbol=request.symbol,
            provider=request.provider,
            user_id=current_user.id,
            loader=_loader,
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

    return AlertCheckResponse(
        checked_count=len(triggered),
        triggered_alerts=triggered,
    )
