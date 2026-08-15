"""
Piyasa verisi uclarinin korunmasi (unittest).

Bu uclarin tamami eskiden herkese acikti: /data tek istekle onlarca sayfalik
saglayici indirmesi tetikleyebildigi icin backend, herkesin kullanabilecegi
sinirsiz bir piyasa verisi proxy'sine donusuyordu.
"""

from __future__ import annotations

import unittest

from fastapi.testclient import TestClient

import main
from app.api.routes import market as market_route
from app.auth.dependencies import get_current_user
from app.database.models import User

client = TestClient(main.app)

# Kimlik dogrulamasi disindaki davranisi test etmek icin sahte kullanici.
_FAKE_USER = User(id="market-test-user", email="market@example.com", name="Market")

PROTECTED_PATHS = [
    "/api/market/symbols",
    "/api/market/search?q=BTC",
    "/api/market/quotes?items=binance:BTCUSDT",
    "/api/market/coverage?provider=binance&symbol=BTCUSDT&timeframe=1d",
    "/api/market/window?provider=binance&symbol=BTCUSDT&timeframe=1d&anchor=1700000000",
    "/api/market/data?provider=binance&symbol=BTCUSDT&timeframe=1d",
]


class TestMarketAuth(unittest.TestCase):
    def setUp(self) -> None:
        market_route._rate_limiter.reset()

    def tearDown(self) -> None:
        main.app.dependency_overrides.clear()
        market_route._rate_limiter.reset()

    def test_all_market_endpoints_require_auth(self):
        for path in PROTECTED_PATHS:
            with self.subTest(path=path):
                response = client.get(path)
                self.assertEqual(
                    response.status_code, 401, f"{path} kimlik dogrulamasi istemiyor"
                )

    def test_authenticated_request_is_allowed(self):
        main.app.dependency_overrides[get_current_user] = lambda: _FAKE_USER
        # Aga cikmayan uc: sembol katalogu bellekten donuyor.
        response = client.get("/api/market/symbols")
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.json(), list)


class TestMarketRateLimit(unittest.TestCase):
    def setUp(self) -> None:
        market_route._rate_limiter.reset()
        main.app.dependency_overrides[get_current_user] = lambda: _FAKE_USER

    def tearDown(self) -> None:
        main.app.dependency_overrides.clear()
        market_route._rate_limiter.reset()

    def test_limit_blocks_flood_from_one_user(self):
        limit = market_route._rate_limiter._max_requests
        for _ in range(limit):
            self.assertEqual(client.get("/api/market/symbols").status_code, 200)

        blocked = client.get("/api/market/symbols")
        self.assertEqual(blocked.status_code, 429)
        self.assertIn("retry-after", {k.lower() for k in blocked.headers})


if __name__ == "__main__":
    unittest.main()
