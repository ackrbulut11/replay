"""
Kullanım istatistiği toplama uçları.

Şimdilik yalnızca çizim aracı kullanımını kaydeder (RULES.md #9: route iş
mantığı taşımaz, ancak burada tek satırlık bir insert'ten fazlası yok).
Admin panelindeki genel istatistikler bu tabloyu okur (bkz. admin.py).
"""

from __future__ import annotations

from pydantic import BaseModel
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database.models import DrawingUsageEvent, User, generate_uuid
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
