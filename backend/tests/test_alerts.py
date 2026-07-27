"""
Alarm motoru birim testleri (unittest).

Alarmlar kullanıcıya bağlı olarak veritabanında saklandığı için testler
geçici, bellek içi bir SQLite veritabanı kullanır.
"""

import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.alerts.engine import AlertEngine
from app.alerts.models import (
    AlertCondition,
    AlertCreateRequest,
    AlertStatus,
    AlertTargetType,
    AlertUpdateRequest,
)
from app.database.models import User
from app.database.postgres import Base


def _price_alert(threshold: float = 70000.0) -> AlertCreateRequest:
    return AlertCreateRequest(
        symbol="BTCUSDT",
        provider="binance",
        target_type=AlertTargetType.PRICE,
        condition=AlertCondition.RISES_ABOVE,
        threshold_value=threshold,
        note="Direnc alarmi",
    )


class TestAlerts(unittest.TestCase):
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

        self.engine = AlertEngine()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(bind=self.db_engine)

    def test_alert_crud(self):
        alert = self.engine.create_alert(self.db, _price_alert(), user_id=self.alice.id)
        self.assertEqual(alert["symbol"], "BTCUSDT")
        self.assertEqual(alert["threshold_value"], 70000.0)
        self.assertEqual(alert["status"], "ACTIVE")

        alerts = self.engine.list_alerts(self.db, self.alice.id, symbol="BTCUSDT")
        self.assertEqual(len(alerts), 1)
        self.assertEqual(alerts[0]["id"], alert["id"])

        updated = self.engine.update_alert(
            self.db, alert["id"], AlertUpdateRequest(status=AlertStatus.DISABLED), self.alice.id
        )
        self.assertEqual(updated["status"], "DISABLED")

        self.assertTrue(self.engine.delete_alert(self.db, alert["id"], self.alice.id))
        self.assertEqual(self.engine.list_alerts(self.db, self.alice.id), [])

    def test_alert_is_isolated_per_user(self):
        """Bir kullanıcı başkasının alarmına hiçbir işlemle erişememeli."""
        alert = self.engine.create_alert(self.db, _price_alert(), user_id=self.alice.id)
        alert_id = alert["id"]

        self.assertEqual(self.engine.list_alerts(self.db, self.bob.id), [])
        self.assertIsNone(self.engine.get_alert(self.db, alert_id, self.bob.id))
        self.assertIsNone(
            self.engine.update_alert(
                self.db, alert_id, AlertUpdateRequest(threshold_value=1.0), self.bob.id
            )
        )
        self.assertFalse(self.engine.delete_alert(self.db, alert_id, self.bob.id))

        # Alice'in alarmi bozulmadan duruyor
        still_there = self.engine.get_alert(self.db, alert_id, self.alice.id)
        self.assertIsNotNone(still_there)
        self.assertEqual(still_there["threshold_value"], 70000.0)

    def test_check_only_evaluates_own_alerts(self):
        """check_alerts baskasinin alarmini tetiklememeli."""
        self.engine.create_alert(self.db, _price_alert(65000.0), user_id=self.alice.id)

        # Bob ayni sembolu kontrol ediyor; Alice'in alarmi tetiklenmemeli
        triggered_for_bob = self.engine.check_alerts(
            self.db, symbol="BTCUSDT", provider="binance", current_price=66000.0, user_id=self.bob.id
        )
        self.assertEqual(triggered_for_bob, [])

        triggered_for_alice = self.engine.check_alerts(
            self.db, symbol="BTCUSDT", provider="binance", current_price=66000.0, user_id=self.alice.id
        )
        self.assertEqual(len(triggered_for_alice), 1)
        self.assertEqual(triggered_for_alice[0]["status"], "TRIGGERED")

    def test_check_trigger_price_and_indicator(self):
        self.engine.create_alert(self.db, _price_alert(65000.0), user_id=self.alice.id)
        self.engine.create_alert(
            self.db,
            AlertCreateRequest(
                symbol="BTCUSDT",
                provider="binance",
                target_type=AlertTargetType.RSI,
                indicator_period=14,
                condition=AlertCondition.FALLS_BELOW,
                threshold_value=30.0,
            ),
            user_id=self.alice.id,
        )

        triggered = self.engine.check_alerts(
            self.db,
            symbol="BTCUSDT",
            provider="binance",
            current_price=66000.0,
            user_id=self.alice.id,
            indicator_values={"RSI_14": 25.0},
        )

        self.assertEqual(len(triggered), 2)
        for t in triggered:
            self.assertEqual(t["status"], "TRIGGERED")

    def test_trigger_flag_does_not_leak_between_alerts(self):
        """
        Tetiklenme bayragi alarmlar arasinda sizmamali.

        Onceki surumde `is_triggered` dongu icinde sifirlanmadigi icin
        tetiklenen bir alarmdan sonraki alarm da yanlislikla tetikleniyordu.
        """
        # 1. alarm kesin tetiklenir (fiyat 66000 >= 65000)
        self.engine.create_alert(self.db, _price_alert(65000.0), user_id=self.alice.id)
        # 2. alarm kesinlikle tetiklenmemeli (fiyat 66000, esik 99999)
        self.engine.create_alert(self.db, _price_alert(99999.0), user_id=self.alice.id)

        triggered = self.engine.check_alerts(
            self.db, symbol="BTCUSDT", provider="binance", current_price=66000.0, user_id=self.alice.id
        )

        self.assertEqual(len(triggered), 1, "yalnizca esigi asan alarm tetiklenmeli")
        self.assertEqual(triggered[0]["threshold_value"], 65000.0)

        # Tetiklenmeyen alarm hala ACTIVE olmali
        active = self.engine.list_alerts(self.db, self.alice.id, status="ACTIVE")
        self.assertEqual(len(active), 1)
        self.assertEqual(active[0]["threshold_value"], 99999.0)


if __name__ == "__main__":
    unittest.main()
