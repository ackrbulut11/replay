"""
Trade Journal REST API uçları.

Tüm uçlar giriş gerektirir ve yalnızca isteği yapan kullanıcının kendi
işlemlerine erişir. İş mantığı `journal/trade_journal.py` içindedir
(RULES.md #9: route dosyasına iş mantığı yazılmaz).
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database.models import JournalTrade, User
from app.database.postgres import get_db
from app.journal.models import (
    PerformanceResponse,
    ReplaySessionCreateRequest,
    ReplaySessionResponse,
    TradeCloseRequest,
    TradeOpenRequest,
    TradeResponse,
    TradeUpdateRequest,
)
from app.journal.trade_journal import TradeJournal

router = APIRouter(prefix="/journal", tags=["journal"])
_journal = TradeJournal()


def get_owned_trade(
    trade_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JournalTrade:
    """
    Yol parametresindeki işlemi yalnızca sahibi için döndürür.

    Sahibi olmayan bir istek 403 değil 404 alır: 403, başkasına ait bir
    işlemin var olduğunu sızdırırdı (strateji ve alarmlarla aynı desen).
    """
    trade = _journal.get_trade(db, trade_id, current_user.id)
    if trade is None:
        raise HTTPException(status_code=404, detail=f"İşlem bulunamadı: {trade_id}")
    return trade


# NOT: /performance, /{trade_id}'den ÖNCE tanımlanmalı — aksi halde yol
# parametresi bu ucu yutar ve "performance" bir trade_id sanılır.
@router.get("/performance", response_model=PerformanceResponse)
def get_performance(
    symbol: Optional[str] = Query(None, description="Sembol filtresi"),
    session_id: Optional[str] = Query(None, description="Replay oturumu filtresi"),
    starting_balance: float = Query(10000.0, gt=0, description="Başlangıç bakiyesi"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Kapanmış işlemlerden performans raporu üretir.

    Win Rate, Loss Rate, Profit Factor, Sharpe, Max Drawdown, Net Profit ve
    equity curve döner. Açık pozisyonlar rapora dahil edilmez.
    """
    return _journal.performance(
        db,
        current_user.id,
        symbol=symbol,
        session_id=session_id,
        starting_balance=starting_balance,
    )


@router.get("/trades", response_model=list[TradeResponse])
def list_trades(
    symbol: Optional[str] = Query(None, description="Sembol filtresi"),
    status: Optional[str] = Query(None, description="Durum filtresi (OPEN, CLOSED)"),
    session_id: Optional[str] = Query(None, description="Replay oturumu filtresi"),
    limit: int = Query(200, gt=0, le=1000),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Giriş yapan kullanıcının işlemlerini listeler (en yeni önce)."""
    return _journal.list_trades(
        db,
        current_user.id,
        symbol=symbol,
        status=status,
        session_id=session_id,
        limit=limit,
    )


@router.post("/sessions", response_model=ReplaySessionResponse, status_code=201)
def start_session(
    request: ReplaySessionCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Yeni bir replay oturumu başlatır; manuel işlemler bu oturuma bağlanır."""
    return _journal.start_session(db, request, user_id=current_user.id)


@router.post("/trades", response_model=TradeResponse, status_code=201)
def open_trade(
    request: TradeOpenRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Replay sırasında yeni bir pozisyon açar."""
    try:
        return _journal.open_trade(db, request, user_id=current_user.id)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/trades/{trade_id}", response_model=TradeResponse)
def get_trade(trade: JournalTrade = Depends(get_owned_trade)):
    """İşlem detayını döndürür (yalnızca sahibi)."""
    return trade


@router.post("/trades/{trade_id}/close", response_model=TradeResponse)
def close_trade(
    request: TradeCloseRequest,
    trade: JournalTrade = Depends(get_owned_trade),
    db: Session = Depends(get_db),
):
    """Açık pozisyonu kapatır ve kâr/zararını hesaplar."""
    try:
        return _journal.close_trade(db, trade, request)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))


@router.patch("/trades/{trade_id}", response_model=TradeResponse)
def update_trade(
    request: TradeUpdateRequest,
    trade: JournalTrade = Depends(get_owned_trade),
    db: Session = Depends(get_db),
):
    """Not, sebep, ekran görüntüsü ve (açık pozisyonda) seviyeleri günceller."""
    try:
        return _journal.update_trade(db, trade, request)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/trades/{trade_id}", status_code=204)
def delete_trade(
    trade: JournalTrade = Depends(get_owned_trade),
    db: Session = Depends(get_db),
):
    """İşlemi siler."""
    _journal.delete_trade(db, trade)
