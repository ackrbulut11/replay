"""
Grafik ayarları (RSI + çizim araçları) uçlarının smoke testleri (unittest).
"""

from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.abspath("."))

from fastapi.testclient import TestClient  # noqa: E402

from app.auth.dependencies import get_current_user  # noqa: E402
from app.database.models import ChartSettings, User  # noqa: E402
from app.database.postgres import SessionLocal  # noqa: E402
from main import app  # noqa: E402

TEST_PREFIX = "chart-settings-smoke-"


class TestChartSettingsAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.db = SessionLocal()
        cls.user = User(
            id=f"{TEST_PREFIX}user",
            email=f"{TEST_PREFIX}user@example.com",
            name="Chart Settings Smoke Test",
        )
        cls.db.add(cls.user)
        cls.db.commit()

        app.dependency_overrides[get_current_user] = lambda: cls.user
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls) -> None:
        app.dependency_overrides.pop(get_current_user, None)
        cls.db.query(ChartSettings).filter(ChartSettings.user_id == cls.user.id).delete()
        cls.db.query(User).filter(User.id == cls.user.id).delete()
        cls.db.commit()
        cls.db.close()

    def test_get_returns_empty_when_no_row(self):
        response = self.client.get("/api/chart-settings")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {"rsi": {}, "drawing_defaults": {}, "log_scale": False, "drawings": {}},
        )

    def test_put_then_get_round_trip(self):
        payload = {
            "rsi": {"period": 21, "overbought": 75, "oversold": 25},
            "drawing_defaults": {
                "trendLine": {"color": "#ffffff", "lineWidth": 2, "opacity": 1, "lineStyle": "dashed"},
            },
            "log_scale": True,
            "drawings": {
                "BINANCE:BTCUSDT": [
                    {"id": "drawing_1", "tool": "trendLine", "points": [{"time": 1, "price": 2}], "color": "#fff", "lineWidth": 2, "opacity": 1},
                ],
            },
        }
        put_response = self.client.put("/api/chart-settings", json=payload)
        self.assertEqual(put_response.status_code, 200)
        self.assertEqual(put_response.json(), payload)

        get_response = self.client.get("/api/chart-settings")
        self.assertEqual(get_response.status_code, 200)
        self.assertEqual(get_response.json(), payload)

    def test_put_overwrites_previous(self):
        self.client.put("/api/chart-settings", json={"rsi": {"period": 14}, "drawing_defaults": {}})
        second = self.client.put(
            "/api/chart-settings", json={"rsi": {"period": 9}, "drawing_defaults": {}}
        )
        self.assertEqual(second.json()["rsi"], {"period": 9})

        row_count = (
            self.db.query(ChartSettings).filter(ChartSettings.user_id == self.user.id).count()
        )
        self.assertEqual(row_count, 1)

    def test_requires_auth(self):
        app.dependency_overrides.pop(get_current_user, None)
        try:
            response = self.client.get("/api/chart-settings")
            self.assertEqual(response.status_code, 401)
        finally:
            app.dependency_overrides[get_current_user] = lambda: self.user


if __name__ == "__main__":
    unittest.main()
