from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_admin
from app.database.models import Alert, ReplaySession, Strategy, User
from app.database.postgres import get_db

# Tüm admin uçları ADMIN_EMAILS beyaz listesiyle korunur (router seviyesinde).
router = APIRouter(prefix="/admin", tags=["Admin"], dependencies=[Depends(get_current_admin)])


class AdminUserItem(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    avatar_url: Optional[str] = None
    created_at: Optional[datetime] = None
    last_login_at: Optional[datetime] = None
    strategies_count: int = 0
    alerts_count: int = 0
    # Kullanıcının alarm kurduğu pariteler (tekrarsız, alfabetik)
    alert_symbols: List[str] = []
    replay_sessions_count: int = 0

    class Config:
        from_attributes = True


class AdminStatsResponse(BaseModel):
    total_users: int
    total_strategies: int
    total_alerts: int
    total_replay_sessions: int
    latest_users: List[AdminUserItem]


def _alert_summary(db: Session, user_ids: List[str]) -> dict[str, tuple[int, List[str]]]:
    """
    Kullanıcı başına (alarm sayısı, parite listesi) döndürür.

    Kullanıcı başına ayrı sorgu atmak yerine tek seferde gruplanır; kullanıcı
    sayısı arttıkça N+1 sorguya dönüşmesin.
    """
    if not user_ids:
        return {}

    rows = (
        db.query(Alert.user_id, Alert.symbol, func.count(Alert.id))
        .filter(Alert.user_id.in_(user_ids))
        .group_by(Alert.user_id, Alert.symbol)
        .all()
    )

    summary: dict[str, tuple[int, List[str]]] = {}
    for user_id, symbol, count in rows:
        total, symbols = summary.get(user_id, (0, []))
        summary[user_id] = (total + count, symbols + [symbol])

    return {uid: (total, sorted(set(symbols))) for uid, (total, symbols) in summary.items()}


def _strategy_counts(db: Session, user_ids: List[str]) -> dict[str, int]:
    """Kullanıcı başına strateji sayısı (tek sorguda)."""
    if not user_ids:
        return {}
    rows = (
        db.query(Strategy.user_id, func.count(Strategy.id))
        .filter(Strategy.user_id.in_(user_ids))
        .group_by(Strategy.user_id)
        .all()
    )
    return {user_id: count for user_id, count in rows}


def _replay_counts(db: Session, user_ids: List[str]) -> dict[str, int]:
    """Kullanıcı başına replay oturumu sayısı (tek sorguda)."""
    if not user_ids:
        return {}
    rows = (
        db.query(ReplaySession.user_id, func.count(ReplaySession.id))
        .filter(ReplaySession.user_id.in_(user_ids))
        .group_by(ReplaySession.user_id)
        .all()
    )
    return {user_id: count for user_id, count in rows}


def _build_items(db: Session, users: List[User]) -> List[AdminUserItem]:
    """Kullanıcı listesini sayaçlarıyla birlikte hazırlar."""
    user_ids = [u.id for u in users]
    alerts = _alert_summary(db, user_ids)
    strategies = _strategy_counts(db, user_ids)
    replays = _replay_counts(db, user_ids)

    items: List[AdminUserItem] = []
    for u in users:
        alert_count, alert_symbols = alerts.get(u.id, (0, []))
        items.append(
            AdminUserItem(
                id=u.id,
                email=u.email,
                name=u.name,
                avatar_url=u.avatar_url,
                created_at=u.created_at,
                last_login_at=u.last_login_at,
                strategies_count=strategies.get(u.id, 0),
                alerts_count=alert_count,
                alert_symbols=alert_symbols,
                replay_sessions_count=replays.get(u.id, 0),
            )
        )
    return items


@router.get("/users", response_model=List[AdminUserItem])
def get_all_users(db: Session = Depends(get_db)):
    """
    Tüm kaydolan kullanıcıların listesini ve kullanıcı istatistiklerini getirir.
    """
    users = db.query(User).order_by(User.created_at.desc()).all()
    return _build_items(db, users)


@router.get("/stats", response_model=AdminStatsResponse)
def get_admin_stats(db: Session = Depends(get_db)):
    """
    Platform genel istatistik özeti ve son katılan 5 kullanıcıyı getirir.
    """
    users = db.query(User).order_by(User.created_at.desc()).limit(5).all()

    return AdminStatsResponse(
        total_users=db.query(User).count(),
        total_strategies=db.query(Strategy).count(),
        total_alerts=db.query(Alert).count(),
        total_replay_sessions=db.query(ReplaySession).count(),
        latest_users=_build_items(db, users),
    )
