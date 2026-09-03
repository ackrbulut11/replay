"""Ortak HTTP güvenlik katmanı ve gevşek JSON şemalarının sınır testleri."""

from __future__ import annotations

import unittest

from fastapi.testclient import TestClient
from pydantic import ValidationError

import main
from app.api.routes.chart_settings import ChartSettingsPayload
from app.api.routes.watchlist import WatchlistPayload


client = TestClient(main.app)


class TestHttpSecurityMiddleware(unittest.TestCase):
    def test_guvenlik_basliklari_tum_yanitlara_eklenir(self):
        response = client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["x-content-type-options"], "nosniff")
        self.assertEqual(response.headers["referrer-policy"], "strict-origin-when-cross-origin")
        self.assertIn("camera=()", response.headers["permissions-policy"])

    def test_bes_megabayti_asan_govde_reddedilir(self):
        response = client.post(
            "/api/auth/google",
            content=b"x" * (5 * 1024 * 1024 + 1),
            headers={"content-type": "application/json"},
        )
        self.assertEqual(response.status_code, 413)


class TestFlexiblePayloadLimits(unittest.TestCase):
    def test_izleme_listesi_toplam_oge_siniri(self):
        with self.assertRaises(ValidationError):
            WatchlistPayload(
                lists=[
                    {"name": "A", "items": [{}] * 500},
                    {"name": "B", "items": [{}] * 500},
                    {"name": "C", "items": [{}]},
                ]
            )

    def test_cizim_sembol_anahtari_siniri(self):
        with self.assertRaises(ValidationError):
            ChartSettingsPayload(drawings={str(index): [] for index in range(501)})
