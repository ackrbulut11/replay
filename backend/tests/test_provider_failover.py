"""
Yahoo erisilemedigin de ikincil kaynaga dusulmesi (unittest).

Hisse ve BIST verisinin TEK kaynagi Yahoo Finance'in dokumante edilmemis
`query1` ucu ve ona taklit User-Agent ile gidiliyor. Yahoo bulut IP'lerini
duzenli olarak engelliyor (429/403); o an /market/* uclarinin TAMAMI calismaz
hale geliyordu -- grafik, tarama, alarm, hepsi.

Twelve Data zaten entegre ve o ana kadar YALNIZCA Yahoo'nun intraday derinlik
sinirinin gerisini dolduruyordu. Yahoo tumden dustugunde de devreye girmesi,
mevcut ve onayli bir bagimlilikla kazanilan bir dayaniklilik.

Testler aga cikmaz: hem `requests.get` hem Twelve Data taklit edilir.
"""

from __future__ import annotations

import unittest
from datetime import timedelta
from unittest.mock import patch

import pandas as pd
import requests

from app.data.providers import twelvedata
from app.data.providers.bist import BistProvider
from app.data.providers.nasdaq import NasdaqProvider
from app.utils.time import utc_now


def _frame(rows=10, price=100.0):
    stamps = pd.date_range(end=utc_now() - timedelta(days=1), periods=rows, freq="D")
    return pd.DataFrame({
        "timestamp": stamps,
        "open": [price] * rows,
        "high": [price + 1] * rows,
        "low": [price - 1] * rows,
        "close": [price] * rows,
        "volume": [1.0] * rows,
    })


class _Response:
    """requests.Response yerine gecen asgari sahte."""

    def __init__(self, status_code):
        self.status_code = status_code

    def raise_for_status(self):
        raise requests.exceptions.HTTPError(f"{self.status_code} hata")

    def json(self):
        return {}


class FailoverTestCase(unittest.TestCase):
    def setUp(self):
        self.provider = NasdaqProvider()
        self.end = utc_now()
        self.start = self.end - timedelta(days=30)

    def _fetch(self, provider=None, **kwargs):
        provider = provider or self.provider
        return provider.fetch_ohlcv("AAPL", "1d", self.start, self.end, **kwargs)


class TestYahooDown(FailoverTestCase):
    def test_429_da_twelve_data_devreye_girer(self):
        with patch("app.data.providers.nasdaq.requests.get", return_value=_Response(429)), \
             patch.object(twelvedata, "is_configured", return_value=True), \
             patch.object(twelvedata, "fetch_ohlcv", return_value=_frame()) as td:
            df = self._fetch()
        self.assertFalse(df.empty)
        self.assertEqual(len(df), 10)
        td.assert_called_once()

    def test_403_da_twelve_data_devreye_girer(self):
        with patch("app.data.providers.nasdaq.requests.get", return_value=_Response(403)), \
             patch.object(twelvedata, "is_configured", return_value=True), \
             patch.object(twelvedata, "fetch_ohlcv", return_value=_frame()):
            df = self._fetch()
        self.assertFalse(df.empty)

    def test_ag_hatasinda_da_devreye_girer(self):
        with patch("app.data.providers.nasdaq.requests.get",
                   side_effect=requests.exceptions.ConnectionError("baglanti yok")), \
             patch.object(twelvedata, "is_configured", return_value=True), \
             patch.object(twelvedata, "fetch_ohlcv", return_value=_frame()):
            df = self._fetch()
        self.assertFalse(df.empty)

    def test_404_yedege_dusmez(self):
        # Sembol yok: kullanici hatasi, ikincil kaynak da bulamaz.
        with patch("app.data.providers.nasdaq.requests.get", return_value=_Response(404)), \
             patch.object(twelvedata, "is_configured", return_value=True), \
             patch.object(twelvedata, "fetch_ohlcv", return_value=_frame()) as td:
            with self.assertRaises(RuntimeError) as ctx:
                self._fetch()
        self.assertIn("bulamadı", str(ctx.exception))
        td.assert_not_called()

    def test_yedek_yapilandirilmamissa_ozgun_hata_yukselir(self):
        with patch("app.data.providers.nasdaq.requests.get", return_value=_Response(429)), \
             patch.object(twelvedata, "is_configured", return_value=False):
            with self.assertRaises(RuntimeError) as ctx:
                self._fetch()
        # Asil arizayi ikincil bir hatayla maskelemek teshisi zorlastirirdi.
        self.assertIn("429", str(ctx.exception))

    def test_yedek_de_bos_donerse_ozgun_hata_yukselir(self):
        with patch("app.data.providers.nasdaq.requests.get", return_value=_Response(500)), \
             patch.object(twelvedata, "is_configured", return_value=True), \
             patch.object(twelvedata, "fetch_ohlcv", return_value=pd.DataFrame()):
            with self.assertRaises(RuntimeError) as ctx:
                self._fetch()
        self.assertIn("500", str(ctx.exception))

    def test_yedek_de_patlarsa_ozgun_hata_yukselir(self):
        with patch("app.data.providers.nasdaq.requests.get", return_value=_Response(500)), \
             patch.object(twelvedata, "is_configured", return_value=True), \
             patch.object(twelvedata, "fetch_ohlcv", side_effect=RuntimeError("kota doldu")):
            with self.assertRaises(RuntimeError) as ctx:
                self._fetch()
        self.assertIn("500", str(ctx.exception))

    def test_replay_penceresi_yedege_dusmez(self):
        # allow_gap_fill=False: replay penceresi ikincil kaynaga gitmemeli
        # (saniyeler suren gecikme, bkz. IDataProvider docstring'i).
        with patch("app.data.providers.nasdaq.requests.get", return_value=_Response(429)), \
             patch.object(twelvedata, "is_configured", return_value=True), \
             patch.object(twelvedata, "fetch_ohlcv", return_value=_frame()) as td:
            with self.assertRaises(RuntimeError):
                self._fetch(allow_gap_fill=False)
        td.assert_not_called()


class TestBistAyniYoluKullanir(FailoverTestCase):
    """BIST sağlayıcısı NasdaqProvider'dan miras aldığı için yedek onda da çalışır."""

    def test_bist_de_yedege_duser(self):
        provider = BistProvider()
        with patch("app.data.providers.nasdaq.requests.get", return_value=_Response(429)), \
             patch.object(twelvedata, "is_configured", return_value=True), \
             patch.object(twelvedata, "fetch_ohlcv", return_value=_frame()) as td:
            df = provider.fetch_ohlcv("THYAO", "1d", self.start, self.end)
        self.assertFalse(df.empty)
        # BIST son eki eklenerek gonderilmeli.
        self.assertEqual(td.call_args[0][0], "THYAO.IS")


if __name__ == "__main__":
    unittest.main()
