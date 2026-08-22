"""
Istek basina performans olcumu (unittest).

Olcumun iki sarti var ve ikisi de test ediliyor:

  1. Dogru etiketlemeli. Grafigin ILK PENCERESI ile arkaplandaki GECMIS
     DERINLESTIRMESI ayni uca (`/market/window`) gidiyor ve yalnizca
     bars_before/bars_after oraniyla ayriliyorlar. Ham yol adi hangi fazda
     oldugumuzu soylemiyordu -- kullanicinin 'bir kismi hemen geldi, kalani
     saniyeler sonra' dedigi sey tam olarak bu iki faz.

  2. Istegi ASLA bozmamali. Bir gelistirme araci yuzunden uretim yolunun
     kirilmasi kabul edilemez; bu yuzden log yazimi patlasa bile yanit
     etkilenmemeli.
"""

from __future__ import annotations

import json
import os
import shutil
import tempfile
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core import perf


def _request(path: str, query: str = ""):
    """`describe` icin asgari sahte istek."""
    from starlette.datastructures import QueryParams

    class _URL:
        def __init__(self, p):
            self.path = p

    class _Req:
        def __init__(self, p, q):
            self.url = _URL(p)
            self.query_params = QueryParams(q)

    return _Req(path, query)


class TestDescribe(unittest.TestCase):
    """Ham yol degil, insan dilinde faz adi."""

    def test_ilk_pencere(self):
        label, detail = perf.describe(
            _request("/api/market/window", "symbol=BTCUSDT&timeframe=1h&bars_before=1500&bars_after=1000")
        )
        self.assertEqual(label, "ilk pencere")
        self.assertIn("BTCUSDT 1h", detail)
        self.assertIn("1500", detail)

    def test_gecmis_derinlestirme(self):
        # Arkaplan derinlestirmesi: cok geriye, ileriye hic.
        label, _ = perf.describe(
            _request("/api/market/window", "symbol=BTCUSDT&timeframe=1h&bars_before=5000&bars_after=1")
        )
        self.assertEqual(label, "geçmiş derinleştirme")

    def test_ileri_uzatma(self):
        label, _ = perf.describe(
            _request("/api/market/window", "symbol=BTCUSDT&timeframe=1h&bars_before=1&bars_after=2000")
        )
        self.assertEqual(label, "ileri uzatma")

    def test_iki_faz_ayni_uc_ama_farkli_etiket(self):
        """Asil mesele bu: ayni yol, farkli faz."""
        first, _ = perf.describe(
            _request("/api/market/window", "bars_before=1500&bars_after=1000")
        )
        second, _ = perf.describe(
            _request("/api/market/window", "bars_before=5000&bars_after=1")
        )
        self.assertNotEqual(first, second)

    def test_strateji_calistirma(self):
        label, _ = perf.describe(_request("/api/strategy/abc123/evaluate"))
        self.assertEqual(label, "strateji çalıştırma")

    def test_test_gecmisi(self):
        label, _ = perf.describe(_request("/api/strategy/evaluations"))
        self.assertEqual(label, "test geçmişi")

    def test_bilinmeyen_yol_ham_haliyle_doner(self):
        label, _ = perf.describe(_request("/api/bilinmeyen/uc"))
        self.assertEqual(label, "bilinmeyen/uc")


class TestSayaclar(unittest.TestCase):
    """Sayaclar yalnizca olculen bir istek icindeyken calisir."""

    def test_istek_disinda_no_op(self):
        # Olcum kapaliyken cagri yapan kod kosul yazmak zorunda kalmamali.
        perf.note_provider_call(1.0)
        perf.note_cache_hit("ram")
        perf.note_rows(5)
        perf.note("bir sey")  # patlamamali

    def test_istek_icinde_birikir(self):
        record = perf.RequestPerf()
        token = perf._current.set(record)
        try:
            perf.note_cache_hit("ram")
            perf.note_cache_hit("disk")
            perf.note_cache_hit("disk")
            perf.note_provider_call(0.25)
            perf.note_rows(1500)
            perf.note("en eskiye çekildi")
        finally:
            perf._current.reset(token)

        self.assertEqual(record.ram_hits, 1)
        self.assertEqual(record.disk_hits, 2)
        self.assertEqual(record.provider_calls, 1)
        self.assertAlmostEqual(record.provider_ms, 250.0, places=1)
        self.assertEqual(record.rows, 1500)
        self.assertEqual(record.notes, ["en eskiye çekildi"])

    def test_timed_provider_call_hata_da_olsa_olcer(self):
        # Basarisiz bir cagri da kullaniciyi bekletmistir.
        record = perf.RequestPerf()
        token = perf._current.set(record)
        try:
            with self.assertRaises(RuntimeError):
                with perf.timed_provider_call():
                    raise RuntimeError("saglayici dustu")
        finally:
            perf._current.reset(token)
        self.assertEqual(record.provider_calls, 1)


class TestMiddleware(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.log_path = os.path.join(self.tmp, "logs", "perf.jsonl")

        app = FastAPI()
        app.add_middleware(perf.PerfLoggingMiddleware, log_path=self.log_path)

        @app.get("/api/market/window")
        def window(symbol: str = "", timeframe: str = "", bars_before: int = 0, bars_after: int = 0):
            perf.note_cache_hit("disk")
            perf.note_rows(1500)
            return {"ok": True}

        @app.get("/api/patlayan")
        def patlayan():
            raise RuntimeError("bilerek")

        self.client = TestClient(app, raise_server_exceptions=False)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _entries(self):
        with open(self.log_path, "r", encoding="utf-8") as handle:
            return [json.loads(line) for line in handle if line.strip()]

    def test_istek_kaydedilir(self):
        response = self.client.get(
            "/api/market/window?symbol=BTCUSDT&timeframe=1h&bars_before=1500&bars_after=1000"
        )
        self.assertEqual(response.status_code, 200)

        entries = self._entries()
        self.assertEqual(len(entries), 1)
        entry = entries[0]
        self.assertEqual(entry["label"], "ilk pencere")
        self.assertEqual(entry["status"], 200)
        self.assertEqual(entry["rows"], 1500)
        self.assertEqual(entry["disk_hits"], 1)
        self.assertGreaterEqual(entry["ms"], 0.0)

    def test_hatali_istek_de_kaydedilir(self):
        # Yavaslik cogu zaman hatanin yaninda gorunur; 500'ler kaybolmamali.
        self.client.get("/api/patlayan")
        entries = self._entries()
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["status"], 500)

    def test_log_yazimi_patlasa_bile_istek_bozulmaz(self):
        # Bir gelistirme araci uretim yolunu kiramaz.
        with patch("app.core.perf.open", side_effect=OSError("disk dolu")):
            response = self.client.get("/api/market/window?symbol=X&timeframe=1h&bars_before=2&bars_after=2")
        self.assertEqual(response.status_code, 200)

    def test_her_istek_ayri_kayit(self):
        for _ in range(3):
            self.client.get("/api/market/window?bars_before=1500&bars_after=1000")
        self.assertEqual(len(self._entries()), 3)


class TestAyarlar(unittest.TestCase):
    """Uretimde kendiliginden kapali olmali."""

    def _settings(self, environment, perf_log=None):
        from app.core.config import Settings

        return Settings(ENVIRONMENT=environment, PERF_LOG=perf_log)

    def test_gelistirmede_acik(self):
        self.assertTrue(self._settings("development").perf_log_enabled)

    def test_uretimde_kapali(self):
        # Her istekte diske satir yazmak uretimde istenmez.
        self.assertFalse(self._settings("production").perf_log_enabled)

    def test_acikca_acilabilir(self):
        self.assertTrue(self._settings("production", perf_log=True).perf_log_enabled)

    def test_acikca_kapatilabilir(self):
        self.assertFalse(self._settings("development", perf_log=False).perf_log_enabled)

    def test_install_kapaliyken_middleware_takmaz(self):
        app = FastAPI()
        before = len(app.user_middleware)
        path = perf.install(app, self._settings("production"))
        self.assertIsNone(path)
        self.assertEqual(len(app.user_middleware), before)


class TestFormatLine(unittest.TestCase):
    def test_saglayici_payi_gorunur(self):
        line = perf.format_line({
            "ts": 0, "method": "GET", "path": "/api/market/window",
            "label": "geçmiş derinleştirme", "detail": "BTCUSDT 1h",
            "status": 200, "ms": 836.0, "provider_calls": 1, "provider_ms": 462.0,
            "ram_hits": 0, "disk_hits": 0, "rows": 5000, "notes": [],
        })
        self.assertIn("geçmiş derinleştirme", line)
        self.assertIn("836", line)
        self.assertIn("462", line)
        self.assertIn("5000", line)

    def test_hata_durumu_isaretlenir(self):
        line = perf.format_line({
            "ts": 0, "method": "GET", "path": "/x", "label": "x", "detail": "",
            "status": 502, "ms": 10.0, "provider_calls": 0, "provider_ms": 0.0,
            "ram_hits": 0, "disk_hits": 0, "rows": None, "notes": [],
        })
        self.assertIn("502", line)


if __name__ == "__main__":
    unittest.main()
