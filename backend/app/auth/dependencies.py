from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.core.config import settings
from app.database.postgres import get_db
from app.database.models import User
from app.auth.jwt import decode_token

security = HTTPBearer(auto_error=False)

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Geçersiz veya süresi dolmuş kimlik doğrulaması",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    if not credentials:
        raise credentials_exception

    token = credentials.credentials
    payload = decode_token(token)
    if payload is None or payload.get("type") != "access":
        raise credentials_exception

    user_id: str = payload.get("sub")
    if user_id is None:
        raise credentials_exception

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        # Token geçerli ama kullanıcı silinmiş olabilir; None döndürmek
        # çağıran tarafta AttributeError'a yol açar.
        raise credentials_exception
    return user


def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User | None:
    if not credentials:
        return None
    try:
        token = credentials.credentials
        payload = decode_token(token)
        if payload is None or payload.get("type") != "access":
            return None
        user_id = payload.get("sub")
        if not user_id:
            return None
        return db.query(User).filter(User.id == user_id).first()
    except Exception:
        return None


def is_user_admin(user: User) -> bool:
    """
    Kullanıcının admin olup olmadığını söyler.

    Yetki, .env üzerinden okunan ADMIN_EMAILS listesine göre verilir (RULES.md #17).
    Liste boşsa hiç kimse admin sayılmaz.
    """
    admin_emails = settings.admin_emails
    if not admin_emails:
        return False
    return (user.email or "").lower() in admin_emails


def get_current_admin(current_user: User = Depends(get_current_user)) -> User:
    """Admin yetkisi gerektiren uçlar için kullanıcı doğrular."""
    if not is_user_admin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bu işlem için admin yetkisi gerekiyor",
        )
    return current_user
