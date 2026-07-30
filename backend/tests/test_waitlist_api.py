"""
Erken erişim (waitlist) ucunun testleri.

Uç nokta herkese açık olduğu için normal CRUD testinin ötesinde iki şeyi ayrıca
doğrular: aynı adresin ikinci gönderimi yeni satır açmaz ve IP başına hız sınırı
gerçekten devreye girer.
"""

from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.abspath("."))

from fastapi.testclient import TestClient  # noqa: E402

from app.api.routes import waitlist as waitlist_route  # noqa: E402
from app.database.models import WaitlistSignup  # noqa: E402
from app.database.postgres import SessionLocal  # noqa: E402
from main import app  # noqa: E402

client = TestClient(app)

# Testlerin ürettiği tüm adresler bu önekle başlar; temizlik önek üzerinden
# yapılır, böylece hız sınırı testinin açtığı satırlar da geride kalmaz.
TEST_EMAIL_PREFIX = "waitlist."


def _cleanup() -> None:
    db = SessionLocal()
    try:
        db.query(WaitlistSignup).filter(
            WaitlistSignup.email.like(f"{TEST_EMAIL_PREFIX}%@example.com")
        ).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()


def _count(email: str) -> int:
    db = SessionLocal()
    try:
        return db.query(WaitlistSignup).filter(WaitlistSignup.email == email).count()
    finally:
        db.close()


def _row(email: str) -> WaitlistSignup | None:
    db = SessionLocal()
    try:
        return db.query(WaitlistSignup).filter(WaitlistSignup.email == email).first()
    finally:
        db.close()


class TestWaitlistApi(unittest.TestCase):
    def setUp(self) -> None:
        # Hız sınırı süreç belleğinde; testler arasında sıfırlanmazsa
        # birbirini 429'a düşürür.
        waitlist_route._rate_state.clear()
        _cleanup()

    def tearDown(self) -> None:
        _cleanup()
        waitlist_route._rate_state.clear()

    def test_join_creates_single_row(self):
        response = client.post(
            "/api/waitlist",
            json={"email": "waitlist.test@example.com", "source": "hero"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["ok"])
        self.assertEqual(_count("waitlist.test@example.com"), 1)

        row = _row("waitlist.test@example.com")
        self.assertEqual(row.source, "hero")

    def test_duplicate_is_idempotent(self):
        payload = {"email": "waitlist.test@example.com", "source": "footer"}
        first = client.post("/api/waitlist", json=payload)
        second = client.post("/api/waitlist", json=payload)

        self.assertEqual(first.status_code, 200)
        # İkinci gönderim de başarılı görünür: "bu e-posta kayıtlı mı"
        # bilgisi dışarıya verilmez.
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.json(), first.json())
        self.assertEqual(_count("waitlist.test@example.com"), 1)

    def test_email_is_normalized(self):
        response = client.post(
            "/api/waitlist",
            json={"email": "  Waitlist.Upper@Example.com  ", "source": "hero"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(_count("waitlist.upper@example.com"), 1)

    def test_unknown_source_is_dropped(self):
        response = client.post(
            "/api/waitlist",
            json={"email": "waitlist.test@example.com", "source": "<script>"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(_row("waitlist.test@example.com").source)

    def test_invalid_emails_rejected(self):
        for bad in ["", "abc", "abc@", "a@b", "a b@c.com", "iki@@nokta.com"]:
            with self.subTest(email=bad):
                response = client.post("/api/waitlist", json={"email": bad})
                self.assertEqual(response.status_code, 422, f"kabul edildi: {bad}")

    def test_rate_limit_blocks_flood(self):
        limit = waitlist_route.RATE_LIMIT_MAX_REQUESTS
        for i in range(limit):
            response = client.post(
                "/api/waitlist", json={"email": f"waitlist.rate+{i}@example.com"}
            )
            self.assertEqual(response.status_code, 200)

        blocked = client.post(
            "/api/waitlist", json={"email": "waitlist.rate@example.com"}
        )
        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(_count("waitlist.rate@example.com"), 0)


if __name__ == "__main__":
    unittest.main()
