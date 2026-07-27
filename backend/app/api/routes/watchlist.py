"""
İzleme Listesi REST API uçları.

Kullanıcı başına tek kayıt tutulur; giriş zorunludur ve her istek yalnızca
isteği yapan kullanıcının kaydına erişir. Sahiplik sorgunun kendisinde
(`user_id`) olduğu için ayrı bir kimlik kapısına gerek yoktur.
"""

from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database.models import User, Watchlist
from app.database.postgres import get_db

router = APIRouter(prefix="/watchlist", tags=["watchlist"])


class WatchlistPayload(BaseModel):
    """
    Kullanıcının düzenleyebildiği listeler (Favoriler + özel listeler).

    Liste içeriği arayüzün WatchlistGroup yapısıdır; şema burada bilinçli olarak
    gevşek tutulmuştur ki arayüze alan eklemek her seferinde migration
    gerektirmesin. BIST/NASDAQ/Kripto/Forex listeleri Favoriler'den türetildiği
    için gönderilmez.
    """

    lists: List[Dict[str, Any]] = Field(default_factory=list)


@router.get("", response_model=WatchlistPayload)
def get_watchlist(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Kullanıcının izleme listelerini döndürür.

    Hiç kaydı yoksa boş liste döner; arayüz bu durumda yereldeki listeleri
    sunucuya bir kez yükler (ilk geçiş) veya varsayılanları kullanır.
    """
    row = db.query(Watchlist).filter(Watchlist.user_id == current_user.id).first()
    return WatchlistPayload(lists=row.lists if row else [])


@router.put("", response_model=WatchlistPayload)
def save_watchlist(
    payload: WatchlistPayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """İzleme listelerini kaydeder (varsa günceller, yoksa oluşturur)."""
    row = db.query(Watchlist).filter(Watchlist.user_id == current_user.id).first()

    if row is None:
        row = Watchlist(user_id=current_user.id, lists=payload.lists)
        db.add(row)
    else:
        row.lists = payload.lists

    db.commit()
    db.refresh(row)
    return WatchlistPayload(lists=row.lists)
