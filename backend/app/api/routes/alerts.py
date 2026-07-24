"""
Alerts REST API Routes.
"""

from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, HTTPException, Query

from app.alerts.engine import AlertEngine
from app.alerts.models import (
    AlertCreateRequest,
    AlertUpdateRequest,
    AlertCheckRequest,
    AlertCheckResponse,
)

router = APIRouter(prefix="/alerts", tags=["alerts"])
_engine = AlertEngine()


@router.get("")
@router.get("/list")
def list_alerts(
    symbol: Optional[str] = Query(None, description="Symbol filter"),
    status: Optional[str] = Query(None, description="Status filter (ACTIVE, TRIGGERED, DISABLED)"),
):
    """Lists saved alerts."""
    alerts = _engine.list_alerts(symbol=symbol, status=status)
    return {"alerts": alerts, "count": len(alerts)}


@router.get("/{alert_id}")
def get_alert(alert_id: str):
    """Gets a specific alert by ID."""
    alert = _engine.get_alert(alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail=f"Alert not found: {alert_id}")
    return alert


@router.post("")
def create_alert(request: AlertCreateRequest):
    """Creates a new price or indicator alert."""
    try:
        alert = _engine.create_alert(request)
        return {"message": "Alert created successfully", "alert": alert}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{alert_id}")
def update_alert(alert_id: str, request: AlertUpdateRequest):
    """Updates an existing alert status or threshold."""
    result = _engine.update_alert(alert_id, request)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Alert not found: {alert_id}")
    return {"message": "Alert updated successfully", "alert": result}


@router.delete("/{alert_id}")
def delete_alert(alert_id: str):
    """Deletes an alert by ID."""
    success = _engine.delete_alert(alert_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Alert not found: {alert_id}")
    return {"message": "Alert deleted successfully", "alert_id": alert_id}


@router.post("/check")
def check_alerts(request: AlertCheckRequest):
    """Evaluates active alerts for a symbol against current price/indicator values."""
    try:
        triggered = _engine.check_alerts(
            symbol=request.symbol,
            provider=request.provider,
            current_price=request.current_price,
            indicator_values=request.indicator_values,
        )
        return AlertCheckResponse(
            checked_count=len(triggered),
            triggered_alerts=triggered,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
