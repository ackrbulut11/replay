import hmac
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Optional
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

from app.database.postgres import get_db
from app.database.models import User
from app.auth.jwt import create_access_token, create_refresh_token, decode_token
from app.auth.dependencies import (
    get_current_user,
    get_current_user_optional,
    is_user_admin,
)
from app.core.security import RateLimiter, client_ip
from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])

# Frontend auth isteklerini Vercel'in aynı-origin `/api` rewrite'ı üzerinden
# gönderir. Böylece refresh cookie üçüncü taraf cookie olmaz; Lax, CSRF'e karşı
# da `SameSite=None`'dan daha dar bir yüzey bırakır. Üretimde HTTPS zorunludur.
_IS_PROD = settings.ENVIRONMENT == "production"
_REFRESH_COOKIE_KWARGS = {
    "httponly": True,
    "secure": _IS_PROD,
    "samesite": "lax",
}

# Kimlik uçları herkese açık ve her isteği bir veritabanı sorgusuna (Google
# doğrulamasında ayrıca bir dış çağrıya) çeviriyor. IP başına sınır, kaba
# kuvvet denemelerini ve token yenileme fırtınalarını sınırlar.
_auth_rate_limiter = RateLimiter(
    max_requests=30,
    window_seconds=60,
    detail="Çok fazla kimlik doğrulama denemesi. Lütfen biraz sonra tekrar deneyin.",
)


def _client_ip(request: Request) -> str:
    """Geriye dönük yerel ad; güvenilir ortak IP çözümleyicisini kullanır."""
    return client_ip(request)


class GoogleAuthRequest(BaseModel):
    credential: str = Field(..., min_length=1, max_length=8192)

class UserResponse(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    avatar_url: Optional[str] = None
    initial_balance: float
    currency: str
    # Arayüz admin sekmesini buna göre gösterir. Yetkinin kendisi her zaman
    # sunucuda ADMIN_EMAILS ile kontrol edilir; bu alan yalnızca görsel bir
    # ipucudur ve istemcide değiştirilmesi hiçbir erişim kazandırmaz.
    is_admin: bool = False

    class Config:
        from_attributes = True


def build_user_response(user: User) -> UserResponse:
    """ORM kullanıcısını is_admin alanı doldurulmuş yanıta çevirir."""
    return UserResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        avatar_url=user.avatar_url,
        initial_balance=user.initial_balance,
        currency=user.currency,
        is_admin=is_user_admin(user),
    )

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

@router.post("/google", response_model=TokenResponse)
def google_auth(
    request_data: GoogleAuthRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    _auth_rate_limiter.check(f"google:{_client_ip(request)}")
    token = request_data.credential
    user_info = None

    # Google token doğrulama
    try:
        # Geliştirici test girişi: yalnızca DEV_LOGIN_TOKEN .env'de dolu VE
        # gönderilen credential ona birebir eşitse çalışır. Varsayılan olarak
        # DEV_LOGIN_TOKEN boş olduğu için bu yol tamamen kapalıdır.
        if settings.DEV_LOGIN_TOKEN and hmac.compare_digest(token, settings.DEV_LOGIN_TOKEN):
            user_info = {
                "google_id": "dev_google_12345",
                "email": settings.DEV_LOGIN_EMAIL,
                "name": "Demo Trader",
                "avatar_url": "https://lh3.googleusercontent.com/a/default-user"
            }
        elif settings.GOOGLE_CLIENT_ID:
            id_info = id_token.verify_oauth2_token(
                token,
                google_requests.Request(),
                settings.GOOGLE_CLIENT_ID
            )
            # Kullanıcı eşleştirmesi E-POSTAYA göre yapılıyor (aşağıya bakın),
            # bu yüzden adresin Google tarafından doğrulanmış olması şart:
            # doğrulanmamış bir adres taşıyan hesap, aynı adrese sahip mevcut
            # bir hesabın üzerine oturabilirdi.
            if not id_info.get("email_verified"):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Google hesabınızın e-posta adresi doğrulanmamış.",
                )
            user_info = {
                "google_id": id_info.get("sub"),
                "email": id_info.get("email"),
                "name": id_info.get("name"),
                "avatar_url": id_info.get("picture")
            }
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Sunucu Google kimlik doğrulaması için yapılandırılmamış."
            )
    except HTTPException:
        raise
    except Exception as exc:
        # Ayrıntı istemciye SIZDIRILMAZ: kütüphane hataları iç durumu (beklenen
        # audience, saat kayması, anahtar kimlikleri) açık ediyordu. Sunucu
        # tarafında loglanır, Sentry'ye de oradan gider.
        logger.warning("Google kimlik dogrulama basarisiz: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google kimlik doğrulaması başarısız. Lütfen tekrar deneyin.",
        )

    if not user_info or not user_info.get("email"):
        raise HTTPException(status_code=400, detail="Google hesabından e-posta adresi alınamadı.")

    # Veritabanında kullanıcıyı bul veya yeni oluştur
    user = db.query(User).filter(User.email == user_info["email"]).first()
    if not user:
        user = User(
            google_id=user_info["google_id"],
            email=user_info["email"],
            name=user_info["name"],
            avatar_url=user_info["avatar_url"],
            last_login_at=datetime.utcnow(),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        # Bilgilerini güncelle
        user.name = user_info.get("name", user.name)
        user.avatar_url = user_info.get("avatar_url", user.avatar_url)
        if not user.google_id:
            user.google_id = user_info.get("google_id")
        user.last_login_at = datetime.utcnow()
        db.commit()

    # Access ve Refresh token üret. Refresh token kullanıcının güncel
    # `token_version`'ını taşır: çıkış bu sayacı artırınca eski token'lar
    # anında geçersizleşir (bkz. /logout).
    access_token = create_access_token(
        data={"sub": user.id, "email": user.email, "ver": user.token_version or 0}
    )
    refresh_token = create_refresh_token(
        data={"sub": user.id, "ver": user.token_version or 0}
    )

    # Refresh token'ı httpOnly cookie olarak ekle
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        **_REFRESH_COOKIE_KWARGS,
    )

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=build_user_response(user)
    )


@router.post("/refresh", response_model=dict)
def refresh_token(request: Request, response: Response, db: Session = Depends(get_db)):
    _auth_rate_limiter.check(f"refresh:{_client_ip(request)}")
    cookie_refresh_token = request.cookies.get("refresh_token")
    if not cookie_refresh_token:
        raise HTTPException(status_code=401, detail="Refresh token bulunamadı")

    payload = decode_token(cookie_refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Geçersiz refresh token")

    user_id = payload.get("sub")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Kullanıcı bulunamadı")

    # Çıkış yapılmışsa (ya da oturumlar sıfırlanmışsa) sayaç artmıştır ve eski
    # token artık geçersizdir. Sürüm taşımayan token'lar bu alan eklenmeden
    # önce üretilmiştir; onlar da 0 sayılır ve mevcut oturumlar kırılmaz.
    if int(payload.get("ver", 0)) != int(user.token_version or 0):
        raise HTTPException(status_code=401, detail="Oturum sonlandırılmış")

    new_access_token = create_access_token(
        data={"sub": user.id, "email": user.email, "ver": user.token_version or 0}
    )
    return {"access_token": new_access_token, "token_type": "bearer"}


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return build_user_response(current_user)


@router.post("/logout")
def logout(
    request: Request,
    response: Response,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """Oturumu kapatır ve refresh token'ı SUNUCU TARAFINDA da geçersiz kılar.

    Cookie'yi silmek tek başına yetmiyordu: sızmış (ya da paylaşılan bir
    bilgisayarda ele geçirilmiş) bir refresh token 14 gün boyunca geçerli
    kalıyor, çıkış yapmak onu geçersizleştirmiyordu. `token_version` artırılınca
    o kullanıcıya ait tüm eski refresh token'lar anında düşer.

    Kimlik doğrulaması ZORUNLU DEĞİL: token'ı çoktan düşmüş bir istemci de
    çıkış yapabilmeli, cookie yine silinir.
    """
    user_to_revoke = current_user
    if user_to_revoke is None:
        # Access token düşmüş/eksik olsa bile eldeki httpOnly refresh cookie'si
        # oturum sahibini güvenle belirler. Yalnızca hâlâ güncel bir token
        # sürümü iptal edilir; eski bir cookie sayacı ikinci kez artırmaz.
        cookie_token = request.cookies.get("refresh_token")
        payload = decode_token(cookie_token) if cookie_token else None
        if payload and payload.get("type") == "refresh" and payload.get("sub"):
            candidate = db.query(User).filter(User.id == payload["sub"]).first()
            if candidate and int(payload.get("ver", 0)) == int(candidate.token_version or 0):
                user_to_revoke = candidate

    if user_to_revoke is not None:
        user_to_revoke.token_version = (user_to_revoke.token_version or 0) + 1
        db.commit()

    response.delete_cookie(
        key="refresh_token",
        secure=_REFRESH_COOKIE_KWARGS["secure"],
        samesite=_REFRESH_COOKIE_KWARGS["samesite"],
    )
    return {"message": "Başarıyla çıkış yapıldı"}
