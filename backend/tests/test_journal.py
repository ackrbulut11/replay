"""
Trade Journal birim testleri (unittest).

İşlemler kullanıcıya bağlı olarak veritabanında saklandığı için testler
geçici, bellek içi bir SQLite veritabanı kullanır (test_alerts.py deseni).
"""

import unittest
from datetime import datetime, timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.models import User
from app.database.postgres import Base
from app.journal.models import (
    ExitReason,
    TradeCloseRequest,
    TradeOpenRequest,
    TradeSide,
    TradeStatus,
    TradeUpdateRequest,
)
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


if __name__ == "__main__":
    unittest.main()
