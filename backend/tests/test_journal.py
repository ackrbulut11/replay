"""
Trade Journal birim testleri (unittest).

İşlemler kullanıcıya bağlı olarak veritabanında saklandığı için testler
geçici, bellek içi bir SQLite veritabanı kullanır (test_alerts.py deseni).
"""

import unittest
from datetime import datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.models import User
from app.database.postgres import Base
from app.journal.models import (
    ExitReason,
    ReplayBar,
    TradeCloseRequest,
    TradeOpenRequest,
    TradeSide,
    TradeStatus,
    TradeUpdateRequest,
)
from app.journal.models import ReplaySessionCreateRequest
from app.journal.trade_journal import TradeJournal


def _open_request(**overrides) -> TradeOpenRequest:
    payload = {
        "symbol": "BTCUSDT",
        "provider": "binance",
        "timeframe": "1h",
        "side": TradeSide.LONG,
        "entry_price": 100.0,
        "quantity": 2.0,
        "stop_loss": 95.0,
        "take_profit": 110.0,
        "reason": "Destek bolgesinden donus",
    }
    payload.update(overrides)
    return TradeOpenRequest(**payload)


class JournalTestCase(unittest.TestCase):
    def setUp(self):
        self.db_engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.db_engine)
        self.db = sessionmaker(bind=self.db_engine)()

        self.alice = User(id="user-alice", email="alice@example.com", name="Alice")
        self.bob = User(id="user-bob", email="bob@example.com", name="Bob")
        self.db.add_all([self.alice, self.bob])
        self.db.commit()

        self.journal = TradeJournal()

    def tearDown(self):
        self.db.close()

    def _session(self, user_id: str, symbol: str = "BTCUSDT") -> str:
        """Gercek bir replay oturumu acar ve kimligini dondurur.

        open_trade artik session_id sahipligini dogruluyor; uydurma bir kimlik
        reddediliyor (bkz. TradeJournal.open_trade).
        """
        session = self.journal.start_session(
            self.db,
            ReplaySessionCreateRequest(symbol=symbol, timeframe="1h"),
            user_id=user_id,
        )
        return session.id


class TestOpenTrade(JournalTestCase):
    def test_acilan_islem_open_durumunda(self):
        trade = self.journal.open_trade(self.db, _open_request(), user_id=self.alice.id)

        self.assertEqual(trade.status, TradeStatus.OPEN.value)
        self.assertEqual(trade.user_id, self.alice.id)
        self.assertEqual(trade.symbol, "BTCUSDT")
        self.assertEqual(trade.side, "long")
        self.assertIsNone(trade.exit_price)
        self.assertIsNone(trade.pnl)
        self.assertEqual(trade.reason, "Destek bolgesinden donus")

    def test_sembol_buyuk_harfe_cevrilir(self):
        trade = self.journal.open_trade(self.db, _open_request(symbol="btcusdt"), user_id=self.alice.id)
        self.assertEqual(trade.symbol, "BTCUSDT")

    def test_yuzdeyle_seviye_belirlenebilir(self):
        # %5 stop / %10 hedef -> 100 girişte 95 ve 110 olmalı (long).
        trade = self.journal.open_trade(
            self.db,
            _open_request(stop_loss=None, take_profit=None, stop_loss_pct=5, take_profit_pct=10),
            user_id=self.alice.id,
        )
        self.assertAlmostEqual(trade.stop_loss, 95.0)
        self.assertAlmostEqual(trade.take_profit, 110.0)

    def test_short_yuzdesi_ters_yonde_cevrilir(self):
        trade = self.journal.open_trade(
            self.db,
            _open_request(
                side=TradeSide.SHORT,
                stop_loss=None,
                take_profit=None,
                stop_loss_pct=5,
                take_profit_pct=10,
            ),
            user_id=self.alice.id,
        )
        self.assertAlmostEqual(trade.stop_loss, 105.0)
        self.assertAlmostEqual(trade.take_profit, 90.0)

    def test_mutlak_fiyat_yuzdeye_gore_oncelikli(self):
        trade = self.journal.open_trade(
            self.db,
            _open_request(stop_loss=97.0, take_profit=None, stop_loss_pct=5, take_profit_pct=10),
            user_id=self.alice.id,
        )
        self.assertAlmostEqual(trade.stop_loss, 97.0)   # mutlak kazanır
        self.assertAlmostEqual(trade.take_profit, 110.0)  # yüzde boşluğu doldurur

    def test_ters_stop_reddedilir(self):
        # Long pozisyonda girişin üstünde stop-loss ilk mumda tetiklenirdi.
        with self.assertRaises(ValueError):
            self.journal.open_trade(
                self.db, _open_request(stop_loss=105.0), user_id=self.alice.id
            )


class TestCloseTrade(JournalTestCase):
    def test_kapanista_pnl_hesaplanir(self):
        trade = self.journal.open_trade(self.db, _open_request(), user_id=self.alice.id)
        closed = self.journal.close_trade(
            self.db, trade, TradeCloseRequest(exit_price=110.0, exit_bar_index=9)
        )

        self.assertEqual(closed.status, TradeStatus.CLOSED.value)
        self.assertAlmostEqual(closed.pnl, 20.0)  # (110-100) * 2
        self.assertAlmostEqual(closed.pnl_percent, 10.0)
        self.assertEqual(closed.exit_reason, ExitReason.MANUAL.value)
        self.assertEqual(closed.exit_bar_index, 9)
        self.assertIsNotNone(closed.closed_at)

    def test_short_ters_yonde_kazanir(self):
        trade = self.journal.open_trade(
            self.db,
            _open_request(side=TradeSide.SHORT, stop_loss=105.0, take_profit=90.0),
            user_id=self.alice.id,
        )
        closed = self.journal.close_trade(self.db, trade, TradeCloseRequest(exit_price=90.0))
        self.assertAlmostEqual(closed.pnl, 20.0)

    def test_ikinci_kez_kapatilamaz(self):
        # Aksi halde ikinci çağrı pnl'i sessizce yeniden hesaplayıp günlüğü bozardı.
        trade = self.journal.open_trade(self.db, _open_request(), user_id=self.alice.id)
        self.journal.close_trade(self.db, trade, TradeCloseRequest(exit_price=110.0))

        with self.assertRaises(ValueError):
            self.journal.close_trade(self.db, trade, TradeCloseRequest(exit_price=120.0))

    def test_stop_sebebi_korunur(self):
        trade = self.journal.open_trade(self.db, _open_request(), user_id=self.alice.id)
        closed = self.journal.close_trade(
            self.db,
            trade,
            TradeCloseRequest(exit_price=95.0, exit_reason=ExitReason.STOP_LOSS),
        )
        self.assertEqual(closed.exit_reason, ExitReason.STOP_LOSS.value)
        self.assertAlmostEqual(closed.pnl, -10.0)


class TestSahiplik(JournalTestCase):
    def test_baskasinin_islemi_gorunmez(self):
        trade = self.journal.open_trade(self.db, _open_request(), user_id=self.alice.id)

        self.assertIsNone(self.journal.get_trade(self.db, trade.id, self.bob.id))
        self.assertIsNotNone(self.journal.get_trade(self.db, trade.id, self.alice.id))

    def test_listeleme_yalnizca_kendi_islemleri(self):
        self.journal.open_trade(self.db, _open_request(), user_id=self.alice.id)
        self.journal.open_trade(self.db, _open_request(symbol="ETHUSDT"), user_id=self.bob.id)

        alice_trades = self.journal.list_trades(self.db, self.alice.id)
        self.assertEqual(len(alice_trades), 1)
        self.assertEqual(alice_trades[0].symbol, "BTCUSDT")

    def test_performans_yalnizca_kendi_islemlerinden(self):
        alice_trade = self.journal.open_trade(self.db, _open_request(), user_id=self.alice.id)
        self.journal.close_trade(self.db, alice_trade, TradeCloseRequest(exit_price=110.0))

        bob_trade = self.journal.open_trade(self.db, _open_request(), user_id=self.bob.id)
        self.journal.close_trade(self.db, bob_trade, TradeCloseRequest(exit_price=200.0))

        report = self.journal.performance(self.db, self.alice.id, starting_balance=1000.0)
        self.assertEqual(report["total_trades"], 1)
        self.assertAlmostEqual(report["net_profit"], 20.0)


class TestFiltreler(JournalTestCase):
    def test_sembol_ve_durum_filtresi(self):
        btc = self.journal.open_trade(self.db, _open_request(), user_id=self.alice.id)
        self.journal.open_trade(
            self.db, _open_request(symbol="ETHUSDT"), user_id=self.alice.id
        )
        self.journal.close_trade(self.db, btc, TradeCloseRequest(exit_price=110.0))

        self.assertEqual(len(self.journal.list_trades(self.db, self.alice.id, symbol="BTCUSDT")), 1)
        self.assertEqual(len(self.journal.list_trades(self.db, self.alice.id, status="OPEN")), 1)
        self.assertEqual(len(self.journal.list_trades(self.db, self.alice.id, status="CLOSED")), 1)


class TestSaveSession(JournalTestCase):
    def test_acik_islem_kaydedilmez(self):
        """
        Açık bir işlem "Kaydet" ile is_saved=True olursa, include_saved
        sorgusu onu sembolün HER YENİ oturumuna hayalet bir açık pozisyon
        olarak sızdırır (bkz. journalStore.reload, ReplayTradePanel). Bu yüzden
        save_session yalnızca kapanmış işlemleri işaretlemeli.
        """
        session_id = self._session(self.alice.id)
        open_trade = self.journal.open_trade(
            self.db, _open_request(session_id=session_id), user_id=self.alice.id
        )
        closed_trade = self.journal.open_trade(
            self.db, _open_request(session_id=session_id), user_id=self.alice.id
        )
        self.journal.close_trade(self.db, closed_trade, TradeCloseRequest(exit_price=110.0))

        saved_count = self.journal.save_session(self.db, session_id, user_id=self.alice.id)

        self.assertEqual(saved_count, 1)
        self.db.refresh(open_trade)
        self.db.refresh(closed_trade)
        self.assertFalse(open_trade.is_saved)
        self.assertTrue(closed_trade.is_saved)

    def test_kaydedilmis_acik_islem_yeni_oturuma_sizmaz(self):
        """Uçtan uca: eski oturumdaki açık işlem, yeni bir oturumun include_saved sorgusunda görünmemeli."""
        old_session = self._session(self.alice.id)
        old_open = self.journal.open_trade(
            self.db, _open_request(session_id=old_session), user_id=self.alice.id
        )
        self.journal.save_session(self.db, old_session, user_id=self.alice.id)
        self.db.refresh(old_open)
        self.assertFalse(old_open.is_saved)

        results = self.journal.list_trades(
            self.db, self.alice.id, symbol="BTCUSDT",
            session_id=self._session(self.alice.id), include_saved=True
        )
        self.assertEqual(results, [])


class TestUpdateTrade(JournalTestCase):
    def test_gunluk_alanlari_guncellenir(self):
        trade = self.journal.open_trade(self.db, _open_request(), user_id=self.alice.id)
        updated = self.journal.update_trade(
            self.db,
            trade,
            TradeUpdateRequest(notes="Hedefe ulasti", screenshot="https://example.com/a.png"),
        )

        self.assertEqual(updated.notes, "Hedefe ulasti")
        self.assertEqual(updated.screenshot, "https://example.com/a.png")
        # Dokunulmayan alan korunur.
        self.assertEqual(updated.reason, "Destek bolgesinden donus")

    def test_acik_pozisyonda_seviye_degistirilebilir(self):
        trade = self.journal.open_trade(self.db, _open_request(), user_id=self.alice.id)
        updated = self.journal.update_trade(self.db, trade, TradeUpdateRequest(stop_loss=98.0))
        self.assertAlmostEqual(updated.stop_loss, 98.0)

    def test_gecersiz_seviye_reddedilir(self):
        trade = self.journal.open_trade(self.db, _open_request(), user_id=self.alice.id)
        with self.assertRaises(ValueError):
            self.journal.update_trade(self.db, trade, TradeUpdateRequest(stop_loss=120.0))

    def test_kapanmis_islemin_seviyesi_degistirilemez(self):
        trade = self.journal.open_trade(self.db, _open_request(), user_id=self.alice.id)
        self.journal.close_trade(self.db, trade, TradeCloseRequest(exit_price=110.0))

        with self.assertRaises(ValueError):
            self.journal.update_trade(self.db, trade, TradeUpdateRequest(stop_loss=98.0))

    def test_kapanmis_islemin_notu_degistirilebilir(self):
        trade = self.journal.open_trade(self.db, _open_request(), user_id=self.alice.id)
        self.journal.close_trade(self.db, trade, TradeCloseRequest(exit_price=110.0))

        updated = self.journal.update_trade(self.db, trade, TradeUpdateRequest(notes="Ders alindi"))
        self.assertEqual(updated.notes, "Ders alindi")


class TestPerformans(JournalTestCase):
    def test_acik_pozisyonlar_rapora_girmez(self):
        closed = self.journal.open_trade(self.db, _open_request(), user_id=self.alice.id)
        self.journal.close_trade(self.db, closed, TradeCloseRequest(exit_price=110.0))
        self.journal.open_trade(self.db, _open_request(), user_id=self.alice.id)  # açık kalır

        report = self.journal.performance(self.db, self.alice.id, starting_balance=1000.0)
        self.assertEqual(report["total_trades"], 1)

    def test_equity_curve_kronolojik(self):
        # Önce kazanç, sonra kayıp: drawdown ikinci işlemden gelmeli.
        first = self.journal.open_trade(self.db, _open_request(), user_id=self.alice.id)
        self.journal.close_trade(self.db, first, TradeCloseRequest(exit_price=110.0))
        first.closed_at = datetime(2024, 1, 1)

        second = self.journal.open_trade(self.db, _open_request(), user_id=self.alice.id)
        self.journal.close_trade(self.db, second, TradeCloseRequest(exit_price=95.0))
        second.closed_at = datetime(2024, 1, 2)
        self.db.commit()

        report = self.journal.performance(self.db, self.alice.id, starting_balance=1000.0)
        self.assertEqual(report["equity_curve"], [1000.0, 1020.0, 1010.0])
        self.assertAlmostEqual(report["max_drawdown"], 10.0)

    def test_islem_yokken_bos_rapor(self):
        report = self.journal.performance(self.db, self.alice.id, starting_balance=5000.0)
        self.assertEqual(report["total_trades"], 0)
        self.assertIsNone(report["win_rate"])
        self.assertAlmostEqual(report["ending_balance"], 5000.0)


class TestDeleteTrade(JournalTestCase):
    def test_silinen_islem_kaybolur(self):
        trade = self.journal.open_trade(self.db, _open_request(), user_id=self.alice.id)
        self.journal.delete_trade(self.db, trade)
        self.assertEqual(len(self.journal.list_trades(self.db, self.alice.id)), 0)


class TestSessionOwnership(JournalTestCase):
    """open_trade, istekten gelen session_id'yi dogrulamali."""

    def test_own_session_is_accepted(self):
        session_id = self._session(self.alice.id)
        trade = self.journal.open_trade(
            self.db, _open_request(session_id=session_id), user_id=self.alice.id
        )
        self.assertEqual(trade.session_id, session_id)

    def test_other_users_session_is_rejected(self):
        bob_session = self._session(self.bob.id)
        with self.assertRaises(ValueError):
            self.journal.open_trade(
                self.db, _open_request(session_id=bob_session), user_id=self.alice.id
            )

    def test_unknown_session_is_rejected(self):
        with self.assertRaises(ValueError):
            self.journal.open_trade(
                self.db, _open_request(session_id="uydurma-kimlik"), user_id=self.alice.id
            )

    def test_missing_session_is_allowed(self):
        """Alan opsiyonel: oturumsuz islem kaydi mumkun."""
        trade = self.journal.open_trade(self.db, _open_request(), user_id=self.alice.id)
        self.assertIsNone(trade.session_id)


class TestSessionBalance(JournalTestCase):
    """replay_sessions.current_balance olu kolondu; artik isliyor."""

    def _session(self, balance=10000.0, user_id=None):
        return self.journal.start_session(
            self.db,
            ReplaySessionCreateRequest(symbol="BTCUSDT", timeframe="1h", starting_balance=balance),
            user_id=user_id or self.alice.id,
        )

    def test_new_session_starts_with_given_balance(self):
        session = self._session(balance=50_000)
        self.assertEqual(session.starting_balance, 50_000)
        self.assertEqual(session.current_balance, 50_000)

    def test_winning_trade_increases_balance(self):
        session = self._session(balance=10_000)
        trade = self.journal.open_trade(
            self.db, _open_request(session_id=session.id), user_id=self.alice.id
        )
        # entry 100, quantity 2 -> cikis 110 => +20
        self.journal.close_trade(self.db, trade, TradeCloseRequest(exit_price=110.0))
        self.db.refresh(session)
        self.assertAlmostEqual(session.current_balance, 10_020.0, places=6)

    def test_losing_trade_decreases_balance(self):
        session = self._session(balance=10_000)
        trade = self.journal.open_trade(
            self.db, _open_request(session_id=session.id), user_id=self.alice.id
        )
        self.journal.close_trade(self.db, trade, TradeCloseRequest(exit_price=96.0))
        self.db.refresh(session)
        self.assertAlmostEqual(session.current_balance, 9_992.0, places=6)

    def test_balance_accumulates_over_trades(self):
        session = self._session(balance=10_000)
        for exit_price in (110.0, 105.0):
            trade = self.journal.open_trade(
                self.db, _open_request(session_id=session.id), user_id=self.alice.id
            )
            self.journal.close_trade(self.db, trade, TradeCloseRequest(exit_price=exit_price))
        self.db.refresh(session)
        # +20 ve +10
        self.assertAlmostEqual(session.current_balance, 10_030.0, places=6)

    def test_open_trade_does_not_move_balance(self):
        session = self._session(balance=10_000)
        self.journal.open_trade(
            self.db, _open_request(session_id=session.id), user_id=self.alice.id
        )
        self.db.refresh(session)
        self.assertAlmostEqual(session.current_balance, 10_000.0, places=6)

    def test_performance_uses_session_starting_balance(self):
        """Oturumun kendi bakiyesi, cagiranin varsayilanini ezmeli."""
        session = self._session(balance=50_000)
        trade = self.journal.open_trade(
            self.db, _open_request(session_id=session.id), user_id=self.alice.id
        )
        self.journal.close_trade(self.db, trade, TradeCloseRequest(exit_price=110.0))

        report = self.journal.performance(
            self.db, self.alice.id, session_id=session.id, starting_balance=10_000.0
        )
        self.assertEqual(report["starting_balance"], 50_000)

    def test_get_session_is_owner_scoped(self):
        session = self._session(user_id=self.alice.id)
        self.assertIsNotNone(self.journal.get_session(self.db, session.id, self.alice.id))
        self.assertIsNone(self.journal.get_session(self.db, session.id, self.bob.id))


if __name__ == "__main__":
    unittest.main()


class TestAdvanceSeviyeTetikleme(JournalTestCase):
    """Replay ilerledikce stop-loss/take-profit gercekten tetiklenir.

    Seviyeler eskiden yalnizca KAYDEDILIYORDU: replay_engine.check_exit canli
    akista hic cagrilmiyordu (sadece testlerden), tek kapanis yolu 'Kapat'
    dugmesiydi. Kullanici stop koyup fiyat oradan gectiginde pozisyon acik
    kaliyor, manuel backtest disiplinli bir stop'un degil 'elle kapatana kadar
    tasi'nin sonucunu olcuyordu.
    """

    def _open(self, **overrides):
        session_id = self._session(self.alice.id)
        return self.journal.open_trade(
            self.db,
            _open_request(session_id=session_id, entry_bar_index=10, **overrides),
            user_id=self.alice.id,
        )

    @staticmethod
    def _bar(index, high, low, open_=None, close=None):
        return ReplayBar(
            bar_index=index,
            timestamp=datetime(2024, 1, 1, 12, 0),
            open=open_ if open_ is not None else (high + low) / 2,
            high=high,
            low=low,
            close=close if close is not None else (high + low) / 2,
        )

    def test_stop_tetiklenmezse_islem_acik_kalir(self):
        trade = self._open()
        result = self.journal.advance(self.db, trade, [self._bar(11, high=105, low=99)])
        self.assertEqual(result.status, TradeStatus.OPEN.value)
        self.assertIsNone(result.exit_price)

    def test_stop_delinince_pozisyon_kapanir(self):
        trade = self._open()
        result = self.journal.advance(self.db, trade, [self._bar(11, high=101, low=90, open_=99)])
        self.assertEqual(result.status, TradeStatus.CLOSED.value)
        self.assertEqual(result.exit_reason, ExitReason.STOP_LOSS.value)
        self.assertAlmostEqual(result.exit_price, 95.0)
        self.assertEqual(result.exit_bar_index, 11)

    def test_hedef_tetiklenince_pozisyon_kapanir(self):
        trade = self._open()
        result = self.journal.advance(self.db, trade, [self._bar(11, high=115, low=101, open_=102)])
        self.assertEqual(result.status, TradeStatus.CLOSED.value)
        self.assertEqual(result.exit_reason, ExitReason.TAKE_PROFIT.value)
        self.assertAlmostEqual(result.exit_price, 110.0)

    def test_bosluklu_acilista_seviyeden_degil_acilistan_dolar(self):
        trade = self._open()
        # Mum stop'un (95) cok altinda aciyor: emir 95'ten degil 60'tan dolar.
        result = self.journal.advance(self.db, trade, [self._bar(11, high=62, low=58, open_=60)])
        self.assertEqual(result.status, TradeStatus.CLOSED.value)
        self.assertAlmostEqual(result.exit_price, 60.0)
        # Giris 100, miktar 2 -> -80 TL
        self.assertAlmostEqual(result.pnl, -80.0)

    def test_giris_bari_ve_oncesi_atlanir(self):
        # Kullanici 10. barin KAPANISINDA girdi; o barin dusugu girisden once
        # olusmustu, seviyeyi tetiklememeli.
        trade = self._open()
        result = self.journal.advance(
            self.db, trade, [self._bar(9, high=101, low=50), self._bar(10, high=101, low=50)]
        )
        self.assertEqual(result.status, TradeStatus.OPEN.value)

    def test_ilk_tetiklenen_mum_kazanir(self):
        trade = self._open()
        result = self.journal.advance(
            self.db,
            trade,
            [
                self._bar(11, high=105, low=99),
                self._bar(12, high=101, low=90, open_=99),   # stop
                self._bar(13, high=130, low=120, open_=125),  # hedef (gec kaldi)
            ],
        )
        self.assertEqual(result.exit_reason, ExitReason.STOP_LOSS.value)
        self.assertEqual(result.exit_bar_index, 12)

    def test_ayni_mumda_ikisi_de_tetiklenirse_stop_kazanir(self):
        trade = self._open()
        result = self.journal.advance(self.db, trade, [self._bar(11, high=115, low=90, open_=100)])
        self.assertEqual(result.exit_reason, ExitReason.STOP_LOSS.value)

    def test_seviyesiz_islem_dokunulmaz(self):
        trade = self._open(stop_loss=None, take_profit=None)
        result = self.journal.advance(self.db, trade, [self._bar(11, high=500, low=1)])
        self.assertEqual(result.status, TradeStatus.OPEN.value)

    def test_kapali_islem_yeniden_degerlendirilmez(self):
        trade = self._open()
        self.journal.close_trade(
            self.db, trade, TradeCloseRequest(exit_price=103.0, exit_reason=ExitReason.MANUAL)
        )
        # Idempotent: istemci yaris durumlarini ayrica ele almak zorunda kalmasin.
        result = self.journal.advance(self.db, trade, [self._bar(11, high=101, low=50)])
        self.assertEqual(result.exit_reason, ExitReason.MANUAL.value)
        self.assertAlmostEqual(result.exit_price, 103.0)

    def test_kapanis_oturum_bakiyesine_islenir(self):
        trade = self._open()
        session_id = trade.session_id
        self.journal.advance(self.db, trade, [self._bar(11, high=101, low=90, open_=99)])
        session = self.journal.get_session(self.db, session_id, user_id=self.alice.id)
        # Giris 100, cikis 95, miktar 2 -> -10 TL
        self.assertAlmostEqual(session.current_balance, 10000.0 - 10.0)
