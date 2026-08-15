"""
Auth API testleri (unittest).

NOT: Bu dosya daha once pytest tarzi duz bir fonksiyondu (`def test_auth_flow`).
Proje unittest kullandigi ve `unittest` yalnizca TestCase alt siniflarini
topladigi icin dosya HIC CALISMIYORDU -- ustelik icerigi de eskimisti:
kaldirilmis olan "imzasi dogrulanmamis JWT'yi kabul et" yedek yolunu
dogruluyordu (bkz. PRE_LAUNCH_CHECKLIST.md, dev-login backdoor maddesi).

Artik gercek davranisi test eder: Google token'i dogrulanir, dogrulanmamis
e-posta reddedilir, dev girisi yalnizca acikca yapilandirilmissa calisir.

GOOGLE_CLIENT_ID ve DEV_LOGIN_TOKEN test icinde acikca ayarlanir; boylece
testler gelistiricinin .env dosyasindan bagimsiz calisir.
"""

from __future__ import annotations

import unittest
from contextlib import contextmanager
from unittest.mock import patch

from fastapi.testclient import TestClient

import main
from app.core.config import settings
from app.database.models import User
from app.database.postgres import SessionLocal

client = TestClient(main.app)

VERIFIED_CLAIMS = {
    "sub": "google-sub-verified",
    "email": "verified.trader@example.com",
    "email_verified": True,
    "name": "Verified Trader",
    "picture": "https://example.com/avatar.jpg",
}


@contextmanager
def google_returns(claims=None, error=None):
    """Google dogrulamasini taklit eder ve client ID'yi yapilandirilmis kilar."""
    kwargs = {"side_effect": error} if error else {"return_value": claims}
    with patch.object(settings, "GOOGLE_CLIENT_ID", "test-client-id"), \
         patch.object(settings, "DEV_LOGIN_TOKEN", ""), \
         patch("app.auth.router.id_token.verify_oauth2_token", **kwargs):
        yield


def _login(credential: str = "gecerli-token"):
    return client.post("/api/auth/google", json={"credential": credential})


def _delete_user(email: str) -> None:
    db = SessionLocal()
    try:
        db.query(User).filter(User.email == email).delete()
        db.commit()
    finally:
        db.close()


class TestGoogleLogin(unittest.TestCase):
    def tearDown(self) -> None:
        _delete_user(VERIFIED_CLAIMS["email"])

    def test_verified_google_account_logs_in(self):
        with google_returns(VERIFIED_CLAIMS):
            response = _login()

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("access_token", data)
        self.assertEqual(data["user"]["email"], VERIFIED_CLAIMS["email"])
        self.assertIn("refresh_token", response.cookies)

    def test_unverified_email_is_rejected(self):
        """Kullanici eslestirmesi e-postaya gore yapiliyor; dogrulanmamis bir
        adres mevcut bir hesabin uzerine oturabilirdi."""
        with google_returns({**VERIFIED_CLAIMS, "email_verified": False}):
            response = _login()

        self.assertEqual(response.status_code, 401)

    def test_missing_email_verified_claim_is_rejected(self):
        claims = {k: v for k, v in VERIFIED_CLAIMS.items() if k != "email_verified"}
        with google_returns(claims):
            response = _login()

        self.assertEqual(response.status_code, 401)

    def test_invalid_token_is_rejected(self):
        """Imzasi dogrulanmamis JWT kabul eden yedek yol KALDIRILDI."""
        with google_returns(error=ValueError("Invalid token signature")):
            response = _login("sahte-token")

        self.assertEqual(response.status_code, 401)

    def test_login_fails_when_client_id_is_not_configured(self):
        """GOOGLE_CLIENT_ID bosken istek reddedilir; claim'lere guvenilmez."""
        with patch.object(settings, "GOOGLE_CLIENT_ID", ""), \
             patch.object(settings, "DEV_LOGIN_TOKEN", ""):
            response = _login()

        self.assertEqual(response.status_code, 500)

    def test_dev_login_requires_exact_configured_token(self):
        with patch.object(settings, "GOOGLE_CLIENT_ID", ""), \
             patch.object(settings, "DEV_LOGIN_TOKEN", "gizli-dev-token"):
            wrong = _login("yanlis-token")
            self.assertEqual(wrong.status_code, 500, "yanlis token dev girisi yapmamali")

            right = _login("gizli-dev-token")
            self.assertEqual(right.status_code, 200)

        _delete_user(settings.DEV_LOGIN_EMAIL)


class TestAuthenticatedFlow(unittest.TestCase):
    def setUp(self) -> None:
        with google_returns(VERIFIED_CLAIMS):
            response = _login()
        self.assertEqual(response.status_code, 200)
        self.access_token = response.json()["access_token"]
        self.refresh_token = response.cookies["refresh_token"]

    def tearDown(self) -> None:
        # TestClient cerez kavanozunu istekler arasinda saklar; temizlenmezse
        # bir sonraki testin "cerezsiz" istegi yine cerezli gider.
        client.cookies.clear()
        _delete_user(VERIFIED_CLAIMS["email"])

    def test_me_returns_current_user(self):
        response = client.get(
            "/api/auth/me", headers={"Authorization": f"Bearer {self.access_token}"}
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["email"], VERIFIED_CLAIMS["email"])

    def test_me_requires_a_token(self):
        self.assertEqual(client.get("/api/auth/me").status_code, 401)

    def test_refresh_issues_a_new_access_token(self):
        response = client.post(
            "/api/auth/refresh", cookies={"refresh_token": self.refresh_token}
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("access_token", response.json())

    def test_refresh_without_cookie_is_rejected(self):
        client.cookies.clear()
        self.assertEqual(client.post("/api/auth/refresh").status_code, 401)

    def test_logout_succeeds(self):
        self.assertEqual(client.post("/api/auth/logout").status_code, 200)


if __name__ == "__main__":
    unittest.main()
