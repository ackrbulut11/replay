"""
Admin panel uçlarının smoke testleri (unittest).

Bu uçlar (özellikle /stats ve /users) hiç test edilmiyordu; Alert modelinde
var olmayan bir kolona (`is_active`) erişen bir hata production'da her
açılışta 500 dönene kadar fark edilmedi. Buradaki testler gerçek admin
yetkilendirmesini (`ADMIN_EMAILS`) devreye sokmadan `get_current_admin`
bağımlılığını override ederek uçların en azından 200 döndüğünü ve response
şemasına uyduğunu doğrular.
"""

from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.abspath("."))

from fastapi.testclient import TestClient  # noqa: E402

from app.auth.dependencies import get_current_admin  # noqa: E402
from app.database.models import Alert, Strategy, User, Watchlist  # noqa: E402
from app.database.postgres import SessionLocal  # noqa: E402
from main import app  # noqa: E402

# Testlerin ürettiği tüm satırlar bu önekle başlar; temizlik önek üzerinden yapılır.
TEST_PREFIX = "admin-smoke-"


class TestAdminAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.db = SessionLocal()
        cls.user = User(
            id=f"{TEST_PREFIX}user",
            email=f"{TEST_PREFIX}user@example.com",
            name="Admin Smoke Test",
        )
        cls.db.add(cls.user)
        cls.db.add(
            Strategy(
                id=f"{TEST_PREFIX}strategy",
                user_id=cls.user.id,
                name="Smoke Strategy",
                rules={
                    "entry_rules": {"logic": "AND", "conditions": []},
                    "exit_rules": {"logic": "AND", "conditions": []},
                },
            )
        )
        cls.db.add(
            Alert(
                id=f"{TEST_PREFIX}alert",
                user_id=cls.user.id,
                symbol="BTCUSDT",
                provider="binance",
                timeframe="1h",
                target_type="price",
                condition="rises_above",
                threshold_value=100.0,
                status="ACTIVE",
            )
        )
        cls.db.add(Watchlist(user_id=cls.user.id, lists=[]))
        cls.db.commit()

        app.dependency_overrides[get_current_admin] = lambda: cls.user
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls) -> None:
        app.dependency_overrides.pop(get_current_admin, None)
        cls.db.query(Watchlist).filter(Watchlist.user_id == cls.user.id).delete()
        cls.db.query(Alert).filter(Alert.user_id == cls.user.id).delete()
        cls.db.query(Strategy).filter(Strategy.user_id == cls.user.id).delete()
        cls.db.query(User).filter(User.id == cls.user.id).delete()
        cls.db.commit()
        cls.db.close()

    def test_stats(self):
        response = self.client.get("/api/admin/stats")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertGreaterEqual(data["total_users"], 1)
        self.assertGreaterEqual(data["total_strategies"], 1)
        self.assertGreaterEqual(data["total_alerts"], 1)

    def test_users_list(self):
        response = self.client.get("/api/admin/users")
        self.assertEqual(response.status_code, 200)
        emails = [u["email"] for u in response.json()]
        self.assertIn(self.user.email, emails)

    def test_user_detail(self):
        response = self.client.get(f"/api/admin/users/{self.user.id}/detail")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["id"], self.user.id)
        self.assertEqual(len(data["alerts"]), 1)
        self.assertEqual(len(data["strategies"]), 1)

    def test_waitlist(self):
        response = self.client.get("/api/admin/waitlist")
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.json(), list)

    def test_requires_admin(self):
        app.dependency_overrides.pop(get_current_admin, None)
        try:
            response = self.client.get("/api/admin/stats")
            self.assertIn(response.status_code, (401, 403))
        finally:
            app.dependency_overrides[get_current_admin] = lambda: self.user


if __name__ == "__main__":
    unittest.main()
