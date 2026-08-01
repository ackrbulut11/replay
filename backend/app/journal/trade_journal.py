"""
Trade Journal — işlem günlüğü yönetimi.

İşlemleri `journal_trades` tablosunda kullanıcıya bağlı olarak saklar. Bir
kullanıcı yalnızca kendi işlemlerini görebilir/değiştirebilir; tüm sorgular
`user_id` ile filtrelenir (strateji ve alarmlarla aynı sahiplik deseni).

Pozisyon matematiği burada tekrarlanmaz — kâr/zarar ve stop/take-profit
kontrolü `engines/replay_engine.py`, performans metrikleri
`reports/performance_report.py` içindedir (RULES.md #8).
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.database.models import JournalTrade, generate_uuid
from app.engines import replay_engine
from app.journal.models import (
    ExitReason,
    TradeCloseRequest,
    TradeOpenRequest,
    TradeStatus,
    TradeUpdateRequest,
)
from app.reports.performance_report import calculate_performance


class TradeJournal:
    """İşlem günlüğü motoru (veritabanı destekli)."""

    @staticmethod
    def open_trade(db: Session, request: TradeOpenRequest, user_id: str) -> JournalTrade:
        """
        Yeni bir pozisyon açar.

        Stop-loss/take-profit seviyeleri replay engine tarafından doğrulanır;
        ters tarafa konmuş bir seviye `ValueError` fırlatır.
        """
        replay_engine.validate_levels(
            side=request.side.value,
            entry_price=request.entry_price,
            stop_loss=request.stop_loss,
            take_profit=request.take_profit,
        )

        trade = JournalTrade(
            id=generate_uuid(),
            user_id=user_id,
            session_id=request.session_id,
            symbol=request.symbol.upper(),
            provider=request.provider,
            timeframe=request.timeframe,
            side=request.side.value,
            status=TradeStatus.OPEN.value,
            entry_price=request.entry_price,
            quantity=request.quantity,
            stop_loss=request.stop_loss,
            take_profit=request.take_profit,
            pnl=None,
            entry_bar_index=request.entry_bar_index,
            entry_time=request.entry_time,
            reason=request.reason,
            notes=request.notes,
            screenshot=request.screenshot,
        )
        db.add(trade)
        db.commit()
        db.refresh(trade)
        return trade

    @staticmethod
    def get_trade(db: Session, trade_id: str, user_id: str) -> Optional[JournalTrade]:
        """Tek bir işlemi döndürür — yalnızca sahibi için."""
        return (
            db.query(JournalTrade)
            .filter(JournalTrade.id == trade_id, JournalTrade.user_id == user_id)
            .first()
        )

    @staticmethod
    def list_trades(
        db: Session,
        user_id: str,
        symbol: Optional[str] = None,
        status: Optional[str] = None,
        session_id: Optional[str] = None,
        limit: int = 200,
    ) -> list[JournalTrade]:
        """Kullanıcının işlemlerini en yeniden eskiye listeler."""
        query = db.query(JournalTrade).filter(JournalTrade.user_id == user_id)
        if symbol:
            query = query.filter(JournalTrade.symbol == symbol.upper())
        if status:
            query = query.filter(JournalTrade.status == status)
        if session_id:
            query = query.filter(JournalTrade.session_id == session_id)
        return query.order_by(JournalTrade.created_at.desc()).limit(min(limit, 1000)).all()

    @staticmethod
    def close_trade(
        db: Session,
        trade: JournalTrade,
        request: TradeCloseRequest,
    ) -> JournalTrade:
        """
        Açık bir pozisyonu kapatır ve kâr/zararını yazar.

        Zaten kapalı bir işlemi tekrar kapatmak `ValueError` fırlatır: aksi
        halde ikinci çağrı pnl'i sessizce yeniden hesaplayıp günlüğü bozar.
        """
        if trade.status == TradeStatus.CLOSED.value:
            raise ValueError("İşlem zaten kapatılmış")

        closed = replay_engine.close_position(
            position={
                "side": trade.side,
                "entry_price": trade.entry_price,
                "quantity": trade.quantity or 1.0,
                "stop_loss": trade.stop_loss,
                "take_profit": trade.take_profit,
                "entry_bar_index": trade.entry_bar_index,
                "entry_time": trade.entry_time,
            },
            exit_price=request.exit_price,
            bar_index=request.exit_bar_index if request.exit_bar_index is not None else -1,
            reason=request.exit_reason.value,
            exit_time=request.exit_time,
        )

        trade.status = TradeStatus.CLOSED.value
        trade.exit_price = closed["exit_price"]
        trade.pnl = closed["pnl"]
        trade.pnl_percent = closed["pnl_percent"]
        trade.exit_reason = closed["exit_reason"]
        trade.exit_bar_index = request.exit_bar_index
        trade.exit_time = request.exit_time
        trade.closed_at = datetime.utcnow()

        db.commit()
        db.refresh(trade)
        return trade

    @staticmethod
    def update_trade(db: Session, trade: JournalTrade, request: TradeUpdateRequest) -> JournalTrade:
        """
        Günlük alanlarını günceller (not, sebep, ekran görüntüsü, seviyeler).

        Seviyeler yalnızca pozisyon açıkken değiştirilebilir; kapanmış bir
        işlemin stop/take-profit'ini sonradan düzenlemek geçmişi yeniden
        yazmak olurdu.
        """
        data = request.model_dump(exclude_unset=True)

        for field in ("reason", "notes", "screenshot"):
            if field in data:
                setattr(trade, field, data[field])

        level_fields = {f: data[f] for f in ("stop_loss", "take_profit") if f in data}
        if level_fields:
            if trade.status == TradeStatus.CLOSED.value:
                raise ValueError("Kapanmış bir işlemin stop/take-profit seviyeleri değiştirilemez")

            replay_engine.validate_levels(
                side=trade.side,
                entry_price=trade.entry_price,
                stop_loss=level_fields.get("stop_loss", trade.stop_loss),
                take_profit=level_fields.get("take_profit", trade.take_profit),
            )
            for field, value in level_fields.items():
                setattr(trade, field, value)

        db.commit()
        db.refresh(trade)
        return trade

    @staticmethod
    def delete_trade(db: Session, trade: JournalTrade) -> None:
        """İşlemi siler."""
        db.delete(trade)
        db.commit()

    @staticmethod
    def performance(
        db: Session,
        user_id: str,
        symbol: Optional[str] = None,
        session_id: Optional[str] = None,
        starting_balance: float = 10000.0,
    ) -> dict:
        """
        Kullanıcının kapanmış işlemlerinden performans raporu üretir.

        Açık pozisyonlar rapora girmez: henüz gerçekleşmemiş kâr/zararı
        istatistiğe katmak win rate ve drawdown'ı yanıltırdı.
        """
        trades = TradeJournal.list_trades(
            db,
            user_id,
            symbol=symbol,
            status=TradeStatus.CLOSED.value,
            session_id=session_id,
            limit=1000,
        )
        # En eskiden yeniye: equity curve ve drawdown kronolojik sırayla anlamlı.
        ordered = sorted(trades, key=lambda t: t.closed_at or t.created_at or datetime.min)
        return calculate_performance(
            [{"pnl": t.pnl} for t in ordered],
            starting_balance=starting_balance,
        )
