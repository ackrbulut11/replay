"""
Gosterge uyumu — backend altin ornekle ayni sayilari uretiyor mu?

Gostergeler iki yerde hesaplaniyor: burada (strateji motorunun gordugu) ve
frontend `src/utils/indicators.ts` icinde (kullanicinin grafikte gordugu).
Ikisi farkli formuller kullandigi surece kullanici grafikte kesisim gorup
backtest'te goremiyordu; Bollinger'da fark hic kapanmiyordu bile
(populasyon vs orneklem standart sapmasi).

Bu test backend'in altin ornekten SAPMADIGINI dogrular. Karsi taraf
`frontend/e2e/indicator-parity.spec.ts` ayni dosyaya karsi ayni seyi yapar.
Backend hesabi bilerek degistirilirse altin ornek yeniden uretilmeli
(`scripts/generate_indicator_parity.py`) VE frontend ayni sekilde
guncellenmeli — testin amaci tam olarak bunu zorlamak.
"""

from __future__ import annotations

import json
import math
import os
import unittest

import pandas as pd

from app.indicators.registry import IndicatorRegistry

FIXTURE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "indicator_parity.json")

# Altin ornek 10 ondaliga yuvarli; karsilastirma bir basamak toleransli.
PLACES = 9


def _load_fixture() -> dict:
    with open(FIXTURE_PATH, "r", encoding="utf-8") as fh:
        return json.load(fh)


class TestIndicatorParityFixture(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.fixture = _load_fixture()
        close = cls.fixture["close"]
        cls.df = pd.DataFrame(
            {
                "close": close,
                "high": [round(c * 1.004, 4) for c in close],
                "low": [round(c * 0.996, 4) for c in close],
                "open": close,
                "volume": [1.0] * len(close),
            }
        )

    def _assert_series(self, key: str, name: str, period: int, field: str | None = None) -> None:
        expected = self.fixture["indicators"][key]
        self.assertEqual(len(expected), len(self.df), f"{key}: uzunluk degismis")

        for i, want in enumerate(expected):
            got = IndicatorRegistry.get_value(name, self.df, period, i, field)
            if want is None:
                self.assertTrue(
                    math.isnan(got),
                    f"{key}[{i}]: isinma bolgesinde deger uretildi ({got}), NaN bekleniyordu",
                )
            else:
                self.assertFalse(math.isnan(got), f"{key}[{i}]: NaN, {want} bekleniyordu")
                self.assertAlmostEqual(got, want, places=PLACES, msg=f"{key}[{i}] sapti")

    def test_ema(self):
        self._assert_series("EMA20", "EMA", 20)
        self._assert_series("EMA50", "EMA", 50)

    def test_rsi(self):
        self._assert_series("RSI14", "RSI", 14)

    def test_bollinger(self):
        self._assert_series("BB20_upper", "BollingerBands", 20, "BB_upper")
        self._assert_series("BB20_middle", "BollingerBands", 20, "BB_middle")
        self._assert_series("BB20_lower", "BollingerBands", 20, "BB_lower")

    def test_macd(self):
        self._assert_series("MACD12_line", "MACD", 12, "MACD")
        self._assert_series("MACD12_signal", "MACD", 12, "MACD_signal")
        self._assert_series("MACD12_hist", "MACD", 12, "MACD_hist")


class TestFixtureShape(unittest.TestCase):
    """Altin ornek frontend'in de okuyabilecegi bicimde kalmali."""

    def test_isinma_bolgesi_none(self):
        fixture = _load_fixture()
        # EMA20 ilk 20 bar, MACD(12) ilk 35 bar bos olmali (warmup_bars).
        self.assertTrue(all(v is None for v in fixture["indicators"]["EMA20"][:20]))
        self.assertIsNotNone(fixture["indicators"]["EMA20"][20])
        self.assertTrue(all(v is None for v in fixture["indicators"]["MACD12_line"][:35]))
        self.assertIsNotNone(fixture["indicators"]["MACD12_line"][35])

    def test_kapanis_serisi_dolu(self):
        fixture = _load_fixture()
        self.assertEqual(len(fixture["close"]), 300)
        self.assertTrue(all(isinstance(c, float) for c in fixture["close"]))


if __name__ == "__main__":
    unittest.main()
