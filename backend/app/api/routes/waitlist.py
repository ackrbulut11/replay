"""
Erken erişim (waitlist) REST API ucu.

Landing page'deki tek alanlı form buraya yazar. Sitenin herkese açık kısmında
olduğu için **kimlik doğrulaması yoktur** — bu yüzden uç nokta bilinçli olarak
mümkün olduğunca küçük tutulmuştur: tek yazılabilir alan, katı doğrulama,
IP başına basit hız sınırı ve varlık bilgisi sızdırmayan tek tip yanıt.

Aynı adresin ikinci gönderimi yeni satır açmaz ve hata da döndürmez; fikir
olarak idempotenttir. "Bu e-posta kayıtlı mı?" sorusunun cevabı dışarıya
verilmez, çünkü bu tek başına bir bilgi sızıntısıdır.
"""

from __future__ import annotations

import re
import time
from typing import Dict, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

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
RATE_LIMIT_WINDOW_SECONDS = 3600
RATE_LIMIT_MAX_REQUESTS = 10

# (istek sayısı, pencere başlangıcı) — süreç belleğinde tutulur. Render'da tek
# instance çalıştığı için yeterli; kalıcı bir çözüm gerekirse Redis'e taşınır.
_rate_state: Dict[str, Tuple[int, float]] = {}


def _client_ip(request: Request) -> str:
    """
    İstemci IP'si. Render arkasında olduğumuz için X-Forwarded-For'un ilk
    değeri gerçek istemcidir; başlık yoksa doğrudan bağlantıya düşer.
    """
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _check_rate_limit(ip: str) -> None:
    """Pencere içindeki istek sayısı sınırı aşarsa 429 fırlatır."""
    now = time.monotonic()
    count, window_start = _rate_state.get(ip, (0, now))

    if now - window_start > RATE_LIMIT_WINDOW_SECONDS:
        count, window_start = 0, now

    if count >= RATE_LIMIT_MAX_REQUESTS:
        # Kullanıcıya görünen metinler İngilizce: bu ucun tek istemcisi
        # İngilizce olan landing page'dir.
        raise HTTPException(
            status_code=429,
            detail="Too many attempts. Please try again later.",
        )

    _rate_state[ip] = (count + 1, window_start)


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
    """
    Tek tip yanıt: adres yeni de olsa, zaten kayıtlı da olsa aynı gövde döner.
    Aksi halde uç nokta bir e-posta doğrulama servisine dönüşür.
    """

    ok: bool = True
    message: str = "You are on the list. We will email you when it is ready."


@router.post("", response_model=WaitlistResponse)
def join_waitlist(
    payload: WaitlistRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """E-postayı erken erişim listesine ekler (zaten varsa hiçbir şey yapmaz)."""
    _check_rate_limit(_client_ip(request))

    existing = (
        db.query(WaitlistSignup).filter(WaitlistSignup.email == payload.email).first()
    )
    if existing is not None:
        return WaitlistResponse()

    db.add(WaitlistSignup(email=payload.email, source=payload.source))
    try:
        db.commit()
    except IntegrityError:
        # İki istek aynı anda geldiğinde benzersiz kısıt devreye girer;
        # kullanıcı açısından sonuç yine "listedesiniz".
        db.rollback()

    return WaitlistResponse()
