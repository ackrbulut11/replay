"""
Kullanım istatistiği toplama uçları.

Şimdilik yalnızca çizim aracı kullanımını kaydeder (RULES.md #9: route iş
mantığı taşımaz, ancak burada tek satırlık bir insert'ten fazlası yok).
Admin panelindeki genel istatistikler bu tabloyu okur (bkz. admin.py).
"""

from __future__ import annotations

import json
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user, get_current_user_optional
from app.core.security import RateLimiter, client_ip
from app.database.models import DrawingUsageEvent, User, UserEvent, generate_uuid
from app.database.postgres import get_db

router = APIRouter(prefix="/analytics", tags=["Analytics"])

# Olay gövdesi sınırları — herkese açık yazma ucu olduğu için gerekli.
MAX_MESSAGE_LENGTH = 2000
MAX_CONTEXT_LENGTH = 4000

# Dakika başına olay sınırı. Frontend hata/aksiyon başına tek olay gönderiyor;
# normal kullanımda dakikada birkaç taneyi geçmez.
_rate_limiter = RateLimiter(
    max_requests=30,
    window_seconds=60,
    detail="Çok fazla olay kaydı. Lütfen biraz sonra tekrar deneyin.",
)


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
    """Olay kaydı isteği.

    Alan uzunlukları sınırlıdır: bu uç kimlik doğrulaması ZORUNLU OLMAYAN tek
    yazma ucudur (aşağıya bakın) ve sınırsız uzunlukta bir `message`/`context`
    veritabanını şişirmek için hazır bir kanal olurdu.
    """

    event_type: str = Field(..., min_length=1, max_length=64)
    level: str = Field("info", max_length=16)
    message: Optional[str] = Field(None, max_length=MAX_MESSAGE_LENGTH)
    context: Optional[dict[str, Any]] = None

    @field_validator("context")
    @classmethod
    def validate_context(cls, value: Optional[dict]) -> Optional[dict]:
        if value is None:
            return None
        serialized = json.dumps(value, default=str)
        if len(serialized) > MAX_CONTEXT_LENGTH:
            raise ValueError(f"context en fazla {MAX_CONTEXT_LENGTH} karakter olabilir")
        return value


@router.post("/events", status_code=204)
def log_user_event(
    payload: UserEventRequest,
    request: Request,
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

    Kimlik doğrulaması zorunlu olmadığı için hız sınırı VARDIR: aksi halde
    herkes `user_events` tablosuna sınırsız satır ekleyebiliyordu. Sınır giriş
    yapmış kullanıcılarda kimliğe, yapmamışlarda IP'ye göre işler — böylece
    tek bir IP arkasındaki gerçek kullanıcılar birbirini bloklamaz.
    """
    key = f"user:{current_user.id}" if current_user else f"ip:{client_ip(request)}"
    _rate_limiter.check(key)

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
