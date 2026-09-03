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

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import or_, func, delete
from sqlalchemy.orm import Session

from app.database.models import JournalTrade, ReplaySession, generate_uuid
from app.engines import replay_engine
from app.journal.models import (
    ExitReason,
    ReplayBar,
    ReplaySessionCreateRequest,
    TradeCloseRequest,
    TradeOpenRequest,
    TradeStatus,
    TradeUpdateRequest,
)
from app.reports.performance_report import calculate_performance


class TradeJournal:
    """İşlem günlüğü motoru (veritabanı destekli)."""

    @staticmethod
    def start_session(
        db: Session, request: ReplaySessionCreateRequest, user_id: str
    ) -> ReplaySession:
        """
        Yeni bir replay oturumu açar.

        `journal_trades.session_id` bu tabloya yabancı anahtardır; işlem
        panelinin göndereceği kimlik burada üretilen gerçek bir satıra
        karşılık gelmek ZORUNDADIR — istemcide uydurulmuş bir kimlik
        `open_trade`'de yakalanmayan bir bütünlük hatasına yol açar.
        """
        session = ReplaySession(
            id=generate_uuid(),
            user_id=user_id,
            symbol=request.symbol.upper(),
            timeframe=request.timeframe,
            starting_balance=request.starting_balance,
            # Oturum başlangıcında iki bakiye eşittir; kapanan her işlem
            # `current_balance`'ı günceller (bkz. close_trade).
            current_balance=request.starting_balance,
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        return session

    @staticmethod
    def get_session(db: Session, session_id: str, user_id: str) -> Optional[ReplaySession]:
        """Oturumu döndürür — yalnızca sahibi için."""
        return (
            db.query(ReplaySession)
            .filter(ReplaySession.id == session_id, ReplaySession.user_id == user_id)
            .first()
        )

    @staticmethod
    def owns_session(db: Session, session_id: str, user_id: str) -> bool:
        """Verilen replay oturumu bu kullanıcıya mı ait?"""
        return TradeJournal.get_session(db, session_id, user_id) is not None

    @staticmethod
    def open_trade(db: Session, request: TradeOpenRequest, user_id: str) -> JournalTrade:
        """
        Yeni bir pozisyon açar.

        `session_id` VERİLDİĞİNDE sahiplik kontrolünden geçer: istekten gelen
        kimlik doğrulanmadan yabancı anahtara yazılıyordu, yani başka bir
        kullanıcının oturum kimliği gönderilebiliyordu. İşlemin kendisi yine
        `user_id` ile korunduğu için veri sızıntısı yoktu, ama iki kullanıcının
        işlemleri aynı oturuma bağlanabiliyor ve `save_session` sayımı
        bozulabiliyordu. Alan opsiyoneldir (oturumsuz işlem kaydı mümkün).

        Stop-loss/take-profit seviyeleri replay engine tarafından doğrulanır;
        ters tarafa konmuş bir seviye `ValueError` fırlatır.
        """
        if request.session_id and not TradeJournal.owns_session(db, request.session_id, user_id):
            # Var olmayan ve başkasına ait oturum aynı mesajı alır: varlık sızmaz.
            raise ValueError(f"Replay oturumu bulunamadı: {request.session_id}")

        stop_loss, take_profit = request.stop_loss, request.take_profit

        # Yüzdeyle verilen seviyeler mutlak fiyata çevrilir. Mutlak değer de
        # verilmişse o kazanır; yüzde yalnızca boş kalan tarafı doldurur.
        if request.stop_loss_pct is not None or request.take_profit_pct is not None:
            pct_stop, pct_take = replay_engine.levels_from_percent(
                side=request.side.value,
                entry_price=request.entry_price,
                stop_loss_pct=request.stop_loss_pct,
                take_profit_pct=request.take_profit_pct,
            )
            stop_loss = stop_loss if stop_loss is not None else pct_stop
            take_profit = take_profit if take_profit is not None else pct_take

        replay_engine.validate_levels(
            side=request.side.value,
            entry_price=request.entry_price,
            stop_loss=stop_loss,
            take_profit=take_profit,
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
            stop_loss=stop_loss,
            take_profit=take_profit,
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
        include_saved: bool = False,
        limit: int | None = 200,
    ) -> list[JournalTrade]:
        """
        Kullanıcının işlemlerini en yeniden eskiye listeler.

        `include_saved`, `session_id` ile birlikte verildiğinde filtre "VEYA"ya
        döner: bu oturumun işlemleri **artı** aynı sembolde daha önce kalıcı
        olarak kaydedilmiş işlemler. Replay geçmişi paneli bunu kullanır —
        kullanıcı geçmiş denemelerini kaydettiyse yeni oturumda da görmeli,
        kaydetmediyse grafik temiz açılmalı.
        """
        query = db.query(JournalTrade).filter(JournalTrade.user_id == user_id)
        if symbol:
            query = query.filter(JournalTrade.symbol == symbol.upper())
        if status:
            query = query.filter(JournalTrade.status == status)

        if session_id and include_saved:
            query = query.filter(
                or_(
                    JournalTrade.session_id == session_id,
                    JournalTrade.is_saved.is_(True),
                )
            )
        elif session_id:
            query = query.filter(JournalTrade.session_id == session_id)
        elif include_saved:
            query = query.filter(JournalTrade.is_saved.is_(True))

        query = query.order_by(JournalTrade.created_at.desc())
        return query.limit(min(limit, 1000)).all() if limit is not None else query.all()

    @staticmethod
    def report_trades(db: Session, user_id: str, **filters) -> list[JournalTrade]:
        """Rapor için tüm kapanışları piyasa zamanına göre sıralar."""
        trades = TradeJournal.list_trades(db, user_id, status=TradeStatus.CLOSED.value,
                                         limit=None, **filters)
        return sorted(trades, key=lambda t: (
            TradeJournal._utc(t.exit_time or t.closed_at or t.created_at or datetime.min), t.id))

    @staticmethod
    def _utc(value: datetime) -> datetime:
        return value.astimezone(timezone.utc).replace(tzinfo=None) if value.tzinfo else value

    @staticmethod
    def _adjust_balance(db: Session, session_id: str, pnl: float) -> None:
        db.query(ReplaySession).filter(ReplaySession.id == session_id).update({
            ReplaySession.current_balance: func.coalesce(
                ReplaySession.current_balance, ReplaySession.starting_balance, 0.0) + pnl
        }, synchronize_session=False)

    @staticmethod
    def save_session(db: Session, session_id: str, user_id: str) -> int:
        """
        Bir replay oturumunun KAPANMIŞ işlemlerini kalıcı olarak işaretler.

        Kaç işlemin işaretlendiğini döndürür. Yalnızca çağıranın kendi
        işlemlerine dokunur (sahiplik sorguda filtrelenir, ayrıca kontrol
        edilmesine gerek kalmaz).

        Açık pozisyon kasıtlı olarak dışarıda bırakılır: `is_saved` işlemi
        `include_saved` sorgusuyla sembolün HER YENİ oturumuna sızıyor
        (bkz. list_trades). Hâlâ açık bir işlem bu şekilde kaydedilirse,
        sonraki bir replay oturumunda güncel fiyattan tamamen kopuk, hayalet
        bir "açık pozisyon" olarak geri gelir ve panel onu günceliyle
        karıştırır.
        """
        updated = (
            db.query(JournalTrade)
            .filter(
                JournalTrade.user_id == user_id,
                JournalTrade.session_id == session_id,
                JournalTrade.status == TradeStatus.CLOSED.value,
            )
            .update({JournalTrade.is_saved: True}, synchronize_session=False)
        )
        db.commit()
        return updated

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

        if trade.entry_time and request.exit_time and TradeJournal._utc(request.exit_time) < TradeJournal._utc(trade.entry_time):
            raise ValueError("Çıkış zamanı girişten önce olamaz")

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

        # Tek atomik durum geçişi: iki eşzamanlı istek aynı kârı yazamaz.
        updated = db.query(JournalTrade).filter(
            JournalTrade.id == trade.id, JournalTrade.user_id == trade.user_id,
            JournalTrade.status == TradeStatus.OPEN.value,
        ).update({
            JournalTrade.status: TradeStatus.CLOSED.value,
            JournalTrade.exit_price: closed["exit_price"],
            JournalTrade.pnl: closed["pnl"], JournalTrade.pnl_percent: closed["pnl_percent"],
            JournalTrade.exit_reason: closed["exit_reason"],
            JournalTrade.exit_bar_index: request.exit_bar_index,
            JournalTrade.exit_time: request.exit_time, JournalTrade.closed_at: datetime.utcnow(),
        }, synchronize_session=False)
        if updated != 1:
            db.rollback()
            raise ValueError("İşlem zaten kapatılmış veya silinmiş")
        if trade.session_id:
            TradeJournal._adjust_balance(db, trade.session_id, closed["pnl"] or 0.0)

        db.commit()
        db.refresh(trade)
        return trade

    @staticmethod
    def advance(
        db: Session,
        trade: JournalTrade,
        bars: list[ReplayBar],
    ) -> JournalTrade:
        """Replay ilerledikçe stop-loss/take-profit tetiklendi mi kontrol eder.

        Seviyeler eskiden yalnızca KAYDEDİLİYORDU: `replay_engine.check_exit`
        canlı akışta hiç çağrılmıyordu (yalnızca testlerden), tek kapanış yolu
        "Kapat" düğmesiydi. Kullanıcı stop koyup fiyat oradan geçtiğinde pozisyon
        açık kalıyor, manuel backtest disiplinli bir stop'un değil "elle
        kapatana kadar taşı"nın sonucunu ölçüyordu — üstelik strateji tarafında
        stop çalıştığı için karşılaştırma da bozuluyordu.

        Tetikleme kararı ve çıkış fiyatı `engines/replay_engine` içindedir
        (RULES.md #8, finansal hesap arayüze yazılmaz): fiyat gap farkındalıdır,
        aynı mumda ikisi de tetiklenirse stop kazanır.

        Girişin yapıldığı bar ve öncesi ATLANIR: kullanıcı o barın kapanışında
        pozisyona girdi, o barın yükseği/düşüğü girişten önce oluşmuştu.
        Çağrı idempotenttir — tetikleme yoksa işlem olduğu gibi döner, kapanmış
        bir işlem hiç değerlendirilmez.
        """
        if trade.status == TradeStatus.CLOSED.value:
            return trade
        if trade.stop_loss is None and trade.take_profit is None:
            return trade

        position = {
            "side": trade.side,
            "entry_price": trade.entry_price,
            "quantity": trade.quantity or 1.0,
            "stop_loss": trade.stop_loss,
            "take_profit": trade.take_profit,
            "entry_bar_index": trade.entry_bar_index,
            "entry_time": trade.entry_time,
        }
        entry_bar = trade.entry_bar_index

        bars = sorted(bars, key=lambda b: TradeJournal._utc(b.timestamp) if b.timestamp else datetime.min)
        for bar in bars:
            if trade.entry_time:
                if bar.timestamp is None or TradeJournal._utc(bar.timestamp) <= TradeJournal._utc(trade.entry_time):
                    continue
            elif (
                entry_bar is not None
                and bar.bar_index is not None
                and bar.bar_index <= entry_bar
            ):
                continue

            result = replay_engine.advance_bar(
                position,
                {
                    "open": bar.open,
                    "high": bar.high,
                    "low": bar.low,
                    "close": bar.close,
                    "timestamp": bar.timestamp,
                },
                bar_index=bar.bar_index if bar.bar_index is not None else -1,
            )
            closed = result["closed_trade"]
            if closed is None:
                continue

            return TradeJournal.close_trade(
                db,
                trade,
                TradeCloseRequest(
                    exit_price=closed["exit_price"],
                    exit_bar_index=bar.bar_index,
                    exit_time=bar.timestamp,
                    exit_reason=ExitReason(closed["exit_reason"]),
                ),
            )

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
        # RETURNING gerçek satırı silip okur; eski ORM kopyası bakiye hesabına girmez.
        removed = db.execute(delete(JournalTrade).where(
            JournalTrade.id == trade.id, JournalTrade.user_id == trade.user_id,
        ).returning(JournalTrade.session_id, JournalTrade.pnl, JournalTrade.status),
            execution_options={"synchronize_session": False}).first()
        if removed and removed.session_id and removed.status == TradeStatus.CLOSED.value:
            TradeJournal._adjust_balance(db, removed.session_id, -(removed.pnl or 0.0))
        db.commit()

    @staticmethod
    def performance(
        db: Session,
        user_id: str,
        symbol: Optional[str] = None,
        session_id: Optional[str] = None,
        include_saved: bool = False,
        starting_balance: float = 10000.0,
    ) -> dict:
        """
        Kullanıcının kapanmış işlemlerinden performans raporu üretir.

        Açık pozisyonlar rapora girmez: henüz gerçekleşmemiş kâr/zararı
        istatistiğe katmak win rate ve drawdown'ı yanıltırdı.

        `session_id` verilmişse başlangıç bakiyesi O OTURUMUN kendi değerinden
        alınır; çağıranın gönderdiği varsayılan yalnızca oturum yokken geçerli
        olur. Aksi halde 50.000 ile başlatılmış bir oturumun raporu 10.000
        üzerinden hesaplanır ve drawdown yüzdeleri anlamsız çıkardı.
        """
        if session_id:
            session = (
                db.query(ReplaySession)
                .filter(ReplaySession.id == session_id, ReplaySession.user_id == user_id)
                .first()
            )
            if session is not None and session.starting_balance:
                starting_balance = session.starting_balance

        trades = TradeJournal.report_trades(
            db,
            user_id,
            symbol=symbol,
            session_id=session_id,
            include_saved=include_saved,
        )
        # En eskiden yeniye: equity curve ve drawdown kronolojik sırayla anlamlı.
        ordered = trades
        # Ağırlıklı getiri için fiyat ve miktar da gerekli (bkz. weighted_return_pct).
        return calculate_performance(
            [
                {"pnl": t.pnl, "entry_price": t.entry_price, "quantity": t.quantity}
                for t in ordered
            ],
            starting_balance=starting_balance,
        )
