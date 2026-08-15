"""
Hazir strateji sablonlari (unittest).

Sablonlar kullaniciya "calisir baslangic noktasi" olarak sunuluyor; gecersiz
ya da hic sinyal uretmeyen bir sablon, ogrenme esigini dusurmek yerine
yukseltirdi. Bu yuzden her sablon hem dogrulamadan gecmeli hem de gercek
veri uzerinde calisabilmeli.
"""

from __future__ import annotations

import unittest

import numpy as np
import pandas as pd

from app.engines.strategy_engine import StrategyEngine
from app.rules.templates import STRATEGY_TEMPLATES, get_template, list_templates
from app.rules.validation import validate_strategy


def market(n=400):
    """Trendli + gurultulu sentetik seri: hem giris hem cikis tetiklenebilsin."""
    np.random.seed(42)
    trend = np.concatenate([
        np.linspace(100, 160, n // 2),
        np.linspace(160, 120, n - n // 2),
    ])
    close = trend + np.random.randn(n) * 2
    return pd.DataFrame({
        "timestamp": pd.date_range("2023-01-01", periods=n, freq="1D"),
        "open": close,
        "high": close + np.abs(np.random.randn(n)) * 1.5,
        "low": close - np.abs(np.random.randn(n)) * 1.5,
        "close": close,
        "volume": np.random.randint(1000, 5000, size=n).astype(float),
    })


class TestTemplates(unittest.TestCase):
    def test_there_are_templates(self):
        self.assertGreaterEqual(len(STRATEGY_TEMPLATES), 5)

    def test_keys_are_unique(self):
        keys = [t["key"] for t in STRATEGY_TEMPLATES]
        self.assertEqual(len(keys), len(set(keys)))

    def test_every_template_has_name_and_description(self):
        for template in STRATEGY_TEMPLATES:
            with self.subTest(key=template["key"]):
                self.assertTrue(template["name"])
                self.assertTrue(template["description"])

    def test_every_template_passes_validation(self):
        """Sablonun kendisi gecersizse kullanici kaydedemez."""
        for template in STRATEGY_TEMPLATES:
            with self.subTest(key=template["key"]):
                errors = validate_strategy(template["strategy"])
                self.assertEqual(errors, [], f"{template['key']}: {errors}")

    def test_every_template_runs_on_real_shaped_data(self):
        """Degerlendirme patlamamali; sinyal sayisi sifir olabilir ama hata olmamali."""
        df = market()
        engine = StrategyEngine()
        for template in STRATEGY_TEMPLATES:
            with self.subTest(key=template["key"]):
                strategy = {**template["strategy"], "id": template["key"], "name": template["name"]}
                result = engine.evaluate(strategy, df)
                self.assertIn("signals", result)
                self.assertIn("performance", result)

    def test_templates_produce_signals_on_a_trending_market(self):
        """En az bir sablon bu veri setinde islem uretmeli; hepsi sessizse sablonlar ise yaramaz."""
        df = market()
        engine = StrategyEngine()
        total = 0
        for template in STRATEGY_TEMPLATES:
            strategy = {**template["strategy"], "id": template["key"], "name": template["name"]}
            total += engine.evaluate(strategy, df)["total_trades"]
        self.assertGreater(total, 0)

    def test_templates_carry_realistic_costs(self):
        """Sifir maliyetli sablon "her zaman karli" gorunurdu."""
        for template in STRATEGY_TEMPLATES:
            with self.subTest(key=template["key"]):
                self.assertGreater(template["strategy"]["commission_bps"], 0)

    def test_templates_use_the_rule_compliant_bar_delay(self):
        for template in STRATEGY_TEMPLATES:
            with self.subTest(key=template["key"]):
                self.assertEqual(template["strategy"]["bar_delay"], 1)

    def test_get_template_by_key(self):
        self.assertIsNotNone(get_template("ema_cross"))
        self.assertIsNone(get_template("olmayan_sablon"))

    def test_list_templates_returns_copies(self):
        """Cagiran taraf listeyi degistirirse kaynak bozulmamali."""
        listed = list_templates()
        listed[0]["name"] = "DEGISTI"
        self.assertNotEqual(STRATEGY_TEMPLATES[0]["name"], "DEGISTI")

    def test_nested_group_template_exists(self):
        """Ic ice grup ozelligini gosteren bir sablon olmali."""
        template = get_template("breakout_or_pullback")
        self.assertIsNotNone(template)
        conditions = template["strategy"]["entry_rules"]["conditions"]
        self.assertTrue(any("conditions" in c for c in conditions))

    def test_arithmetic_template_exists(self):
        """Aritmetik operand ozelligini gosteren bir sablon olmali."""
        template = get_template("atr_trailing")
        self.assertIsNotNone(template)
        right = template["strategy"]["exit_rules"]["conditions"][0]["right"]
        self.assertEqual(right["type"], "expr")


if __name__ == "__main__":
    unittest.main()
