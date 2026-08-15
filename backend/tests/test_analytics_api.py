"""
Analytics uclari (unittest).

/analytics/events kimlik dogrulamasi ZORUNLU OLMAYAN tek yazma ucudur
(oturum acilmamisken de hata olusabiliyor); bu yuzden govde boyutu ve
hiz siniri testle kilitlenir.
"""

from __future__ import annotations

import unittest

from fastapi.testclient import TestClient

import main
from app.api.routes import analytics as analytics_route

client = TestClient(main.app)


class TestUserEvents(unittest.TestCase):
    def setUp(self) -> None:
        analytics_route._rate_limiter.reset()

    def tearDown(self) -> None:
        analytics_route._rate_limiter.reset()

    def test_anonymous_event_is_accepted(self):
        response = client.post(
            "/api/analytics/events",
            json={"event_type": "api_error", "level": "error", "message": "test"},
        )
        self.assertEqual(response.status_code, 204)

    def test_oversized_message_is_rejected(self):
        response = client.post(
            "/api/analytics/events",
            json={
                "event_type": "api_error",
                "message": "x" * (analytics_route.MAX_MESSAGE_LENGTH + 1),
            },
        )
        self.assertEqual(response.status_code, 422)

    def test_oversized_context_is_rejected(self):
        response = client.post(
            "/api/analytics/events",
            json={
                "event_type": "api_error",
                "context": {"blob": "x" * (analytics_route.MAX_CONTEXT_LENGTH + 1)},
            },
        )
        self.assertEqual(response.status_code, 422)

    def test_oversized_event_type_is_rejected(self):
        response = client.post(
            "/api/analytics/events", json={"event_type": "x" * 65}
        )
        self.assertEqual(response.status_code, 422)

    def test_flood_is_rate_limited(self):
        limit = analytics_route._rate_limiter._max_requests
        for _ in range(limit):
            self.assertEqual(
                client.post("/api/analytics/events", json={"event_type": "x"}).status_code,
                204,
            )

        blocked = client.post("/api/analytics/events", json={"event_type": "x"})
        self.assertEqual(blocked.status_code, 429)


if __name__ == "__main__":
    unittest.main()
