"""
Erken erişim (waitlist) REST API ucu.

Landing page'deki tek alanlı form buraya yazar. Sitenin herkese açık kısmında
olduğu için **kimlik doğrulaması yoktur** — bu yüzden uç nokta bilinçli olarak
mümkün olduğunca küçük tutulmuştur: tek yazılabilir alan, katı doğrulama,
IP başına basit hız sınırı ve varlık bilgisi sızdırmayan tek tip yanıt.

Aynı adresin ikinci gönderimi yeni satır açmaz ve hata da döndürmez; fikir
olarak idempotenttir. Kullanıcı deneyimi için "already_registered" bayrağı
döner, böylece frontend zaten kayıtlı olduğunu küçük bir notla bildirebilir.
"""

from __future__ import annotations

import re
from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import RateLimiter
from app.database.models import WaitlistSignup
from app.database.postgres import get_db

router = APIRouter(prefix="/waitlist", tags=["waitlist"])

# Kasıtlı olarak sade: RFC uyumlu tam doğrulama yerine "tek @, noktalı alan adı"
# kontrolü. Amaç yazım hatasını yakalamak; adresin gerçekten var olduğunu
# yalnızca gönderilen e-posta kanıtlar.
EMAIL_PATTERN = re.compile(r"^[^@\s]{1,64}@[^@\s.]+(\.[^@\s.]+)+$")

MAX_EMAIL_LENGTH = 254
ALLOWED_SOURCES = {"hero", "footer"}

# IP başına hız sınırı: aynı adresten kısa sürede çok sayıda kayıt açılmasın.
# Kullanıcıya görünen metinler İngilizce: bu ucun tek istemcisi İngilizce olan
# landing page'dir.
_rate_limiter = RateLimiter(
    max_requests=10,
    window_seconds=3600,
    detail="Too many attempts. Please try again later.",
)


def client_ip(request: Request) -> str:
    """
    İstemci IP'si. Render arkasında olduğumuz için X-Forwarded-For'un ilk
    değeri gerçek istemcidir; başlık yoksa doğrudan bağlantıya düşer.
    """
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class WaitlistRequest(BaseModel):
    email: str = Field(..., max_length=MAX_EMAIL_LENGTH)
    # Formun bulunduğu bölüm; beklenmeyen bir değer gelirse yok sayılır.
    source: Optional[str] = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not EMAIL_PATTERN.match(normalized):
            raise ValueError("Enter a valid email address.")
        return normalized

    @field_validator("source")
    @classmethod
    def validate_source(cls, value: Optional[str]) -> Optional[str]:
        return value if value in ALLOWED_SOURCES else None


class WaitlistResponse(BaseModel):
    """`already_registered`, frontend'in "zaten kayıtlısınız" notunu göstermesi içindir."""

    ok: bool = True
    already_registered: bool = False
    message: str = "You are on the list. We will email you when it is ready."


_ALREADY_REGISTERED_MESSAGE = "You are already on the list."


@router.post("", response_model=WaitlistResponse)
def join_waitlist(
    payload: WaitlistRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """E-postayı erken erişim listesine ekler (zaten varsa hiçbir şey yapmaz)."""
    _rate_limiter.check(client_ip(request))

    existing = (
        db.query(WaitlistSignup).filter(WaitlistSignup.email == payload.email).first()
    )
    if existing is not None:
        return WaitlistResponse(already_registered=True, message=_ALREADY_REGISTERED_MESSAGE)

    db.add(WaitlistSignup(email=payload.email, source=payload.source))
    try:
        db.commit()
    except IntegrityError:
        # İki istek aynı anda geldiğinde benzersiz kısıt devreye girer;
        # kullanıcı açısından sonuç yine "listedesiniz".
        db.rollback()
        return WaitlistResponse(already_registered=True, message=_ALREADY_REGISTERED_MESSAGE)

    return WaitlistResponse()
