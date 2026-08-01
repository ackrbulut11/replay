"""
Kullanım istatistiği toplama uçları.

Şimdilik yalnızca çizim aracı kullanımını kaydeder (RULES.md #9: route iş
mantığı taşımaz, ancak burada tek satırlık bir insert'ten fazlası yok).
Admin panelindeki genel istatistikler bu tabloyu okur (bkz. admin.py).
"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user, get_current_user_optional
from app.database.models import DrawingUsageEvent, User, UserEvent, generate_uuid
from app.database.postgres import get_db

router = APIRouter(prefix="/analytics", tags=["Analytics"])


class DrawingUsageRequest(BaseModel):
    symbol: str
    provider: str
    tool: str


@router.post("/drawing-usage", status_code=204)
def log_drawing_usage(
    payload: DrawingUsageRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Bir çizim tamamlandığında tek satırlık kullanım kaydı ekler.

    Sadece admin panelindeki toplu istatistikler için kullanılır; başarısız
    olması kullanıcının çizim yapmasını etkilememeli, bu yüzden frontend bu
    çağrıyı sessizce yutar (bkz. services/chartAnalytics.ts).
    """
    event = DrawingUsageEvent(
        id=generate_uuid(),
        user_id=current_user.id,
        symbol=payload.symbol.upper(),
        provider=payload.provider,
        tool=payload.tool,
    )
    db.add(event)
    db.commit()


class UserEventRequest(BaseModel):
    event_type: str
    level: str = "info"
    message: Optional[str] = None
    context: Optional[dict[str, Any]] = None


@router.post("/events", status_code=204)
def log_user_event(
    payload: UserEventRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """
    Kullanıcının karşılaştığı hataları (frontend/backend) ve manuel etiketlenmiş
    önemli aksiyonları (strateji kaydetme, alarm oluşturma vb.) kaydeder.

    Oturum açılmamışken de hata oluşabileceği için kimlik doğrulama zorunlu
    değildir (bkz. get_current_user_optional); user_id bu durumda null olur.
    Başarısız olması kullanıcının akışını etkilememeli, bu yüzden frontend bu
    çağrıyı sessizce yutar (bkz. services/eventLog.ts).
    """
    event = UserEvent(
        id=generate_uuid(),
        user_id=current_user.id if current_user else None,
        event_type=payload.event_type,
        level=payload.level,
        message=payload.message,
        context=payload.context,
    )
    db.add(event)
    db.commit()
