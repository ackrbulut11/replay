from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel

from app.database.postgres import get_db
from app.database.models import User, Strategy, JournalTrade, ReplaySession
from app.auth.dependencies import get_current_user

router = APIRouter(prefix="/admin", tags=["Admin"])

class AdminUserItem(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    avatar_url: Optional[str] = None
    created_at: Optional[datetime] = None
    strategies_count: int = 0
    trades_count: int = 0
    replay_sessions_count: int = 0

    class Config:
        from_attributes = True

class AdminStatsResponse(BaseModel):
    total_users: int
    total_strategies: int
    total_trades: int
    total_replay_sessions: int
    latest_users: List[AdminUserItem]

@router.get("/users", response_model=List[AdminUserItem])
def get_all_users(
    db: Session = Depends(get_db),
    admin_key: Optional[str] = Header(None, alias="X-Admin-Key")
):
    """
    Tüm kaydolan kullanıcıların listesini ve kullanıcı istatistiklerini getirir.
    """
    from app.engines.strategy_engine import StrategyEngine
    engine = StrategyEngine()
    json_count = len(engine.list_strategies())

    users = db.query(User).order_by(User.created_at.desc()).all()
    
    result = []
    for u in users:
        sql_strat_cnt = db.query(Strategy).filter(Strategy.user_id == u.id).count()
        strat_cnt = max(json_count, sql_strat_cnt)
        trade_cnt = db.query(JournalTrade).filter(JournalTrade.user_id == u.id).count()
        replay_cnt = db.query(ReplaySession).filter(ReplaySession.user_id == u.id).count()

        result.append(AdminUserItem(
            id=u.id,
            email=u.email,
            name=u.name,
            avatar_url=u.avatar_url,
            created_at=u.created_at,
            strategies_count=strat_cnt,
            trades_count=trade_cnt,
            replay_sessions_count=replay_cnt
        ))

    return result

@router.get("/stats", response_model=AdminStatsResponse)
def get_admin_stats(db: Session = Depends(get_db)):
    """
    Platform genel istatistik özeti ve son katılan 5 kullanıcıyı getirir.
    """
    from app.engines.strategy_engine import StrategyEngine
    engine = StrategyEngine()
    json_count = len(engine.list_strategies())

    total_u = db.query(User).count()
    sql_strat_count = db.query(Strategy).count()
    total_s = max(json_count, sql_strat_count)

    total_t = db.query(JournalTrade).count()
    total_r = db.query(ReplaySession).count()

    users = db.query(User).order_by(User.created_at.desc()).limit(5).all()
    latest = []
    for u in users:
        sql_strat_cnt = db.query(Strategy).filter(Strategy.user_id == u.id).count()
        strat_cnt = max(json_count, sql_strat_cnt)
        trade_cnt = db.query(JournalTrade).filter(JournalTrade.user_id == u.id).count()
        replay_cnt = db.query(ReplaySession).filter(ReplaySession.user_id == u.id).count()

        latest.append(AdminUserItem(
            id=u.id,
            email=u.email,
            name=u.name,
            avatar_url=u.avatar_url,
            created_at=u.created_at,
            strategies_count=strat_cnt,
            trades_count=trade_cnt,
            replay_sessions_count=replay_cnt
        ))

    return AdminStatsResponse(
        total_users=total_u,
        total_strategies=total_s,
        total_trades=total_t,
        total_replay_sessions=total_r,
        latest_users=latest
    )
