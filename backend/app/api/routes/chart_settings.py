"""
Kullanıcı bazlı grafik ayarları REST API uçları.

Kullanıcı başına tek kayıt tutulur; giriş zorunludur ve her istek yalnızca
isteği yapan kullanıcının kaydına erişir. Sahiplik sorgunun kendisinde
(`user_id`) olduğu için ayrı bir kimlik kapısına gerek yoktur (Watchlist ile
aynı desen, bkz. app/api/routes/watchlist.py).
"""

from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database.models import ChartSettings, User
from app.database.postgres import get_db

router = APIRouter(prefix="/chart-settings", tags=["chart-settings"])


class ChartSettingsPayload(BaseModel):
    """
    Şema bilinçli olarak gevşek tutulmuştur (RSI alanları + çizim araçları
    başına stil), arayüze yeni bir gösterge/araç eklemek migration
    gerektirmesin diye.
    """

    rsi: Dict[str, Any] = Field(default_factory=dict)
    drawing_defaults: Dict[str, Any] = Field(default_factory=dict)


@router.get("", response_model=ChartSettingsPayload)
def get_chart_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Kullanıcının grafik ayarlarını döndürür; hiç kaydı yoksa boş döner."""
    row = db.query(ChartSettings).filter(ChartSettings.user_id == current_user.id).first()
    if not row:
        return ChartSettingsPayload(rsi={}, drawing_defaults={})
    return ChartSettingsPayload(rsi=row.rsi or {}, drawing_defaults=row.drawing_defaults or {})


@router.put("", response_model=ChartSettingsPayload)
def save_chart_settings(
    payload: ChartSettingsPayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Grafik ayarlarını kaydeder (varsa günceller, yoksa oluşturur)."""
    row = db.query(ChartSettings).filter(ChartSettings.user_id == current_user.id).first()

    if row is None:
        row = ChartSettings(
            user_id=current_user.id,
            rsi=payload.rsi,
            drawing_defaults=payload.drawing_defaults,
        )
        db.add(row)
    else:
        row.rsi = payload.rsi
        row.drawing_defaults = payload.drawing_defaults

    db.commit()
    db.refresh(row)
    return ChartSettingsPayload(rsi=row.rsi, drawing_defaults=row.drawing_defaults)
