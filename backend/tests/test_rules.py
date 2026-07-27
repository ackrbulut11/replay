"""
Rule Engine & Conditions Unit Tests using standard unittest.
"""

import unittest
import pandas as pd
import numpy as np

from app.rules.conditions import (
    gt, lt, gte, lte, eq, neq, cross_above, cross_below, between
)
from app.indicators.registry import IndicatorRegistry
from app.rules.evaluator import RuleEvaluator
from app.rules.engine import RuleEngine, SignalType


class TestRules(unittest.TestCase):
    def test_operators(self):
        self.assertTrue(gt(10.0, 5.0))
        self.assertFalse(gt(5.0, 10.0))

        self.assertTrue(lt(5.0, 10.0))
        self.assertFalse(lt(10.0, 5.0))

        self.assertTrue(gte(10.0, 10.0))
        self.assertTrue(lte(5.0, 5.0))

        self.assertTrue(eq(10.0, 10.00000000001))
        self.assertTrue(neq(10.0, 10.5))

        # Cross above: prev_left <= prev_right AND left > right
        self.assertTrue(cross_above(10.0, 8.0, prev_left=7.0, prev_right=8.0))
        self.assertFalse(cross_above(10.0, 8.0, prev_left=9.0, prev_right=8.0))

        # Cross below: prev_left >= prev_right AND left < right
        self.assertTrue(cross_below(6.0, 8.0, prev_left=9.0, prev_right=8.0))
        self.assertFalse(cross_below(6.0, 8.0, prev_left=7.0, prev_right=8.0))

        # Between
        self.assertTrue(between(40.0, 30.0, right2=50.0))
        self.assertFalse(between(20.0, 30.0, right2=50.0))

    def test_indicator_registry(self):
        indicators = IndicatorRegistry.list_indicators()
        self.assertGreaterEqual(len(indicators), 8)

        dates = pd.date_range(start="2024-01-01", periods=100, freq="1D")
        df = pd.DataFrame({
            "timestamp": dates,
            "open": np.linspace(100, 200, 100),
            "high": np.linspace(105, 205, 100),
            "low": np.linspace(95, 195, 100),
            "close": np.linspace(100, 200, 100),
            "volume": np.random.randint(1000, 5000, size=100),
        })

        ema_val = IndicatorRegistry.get_value("EMA", df, period=20, bar_index=50)
        self.assertFalse(np.isnan(ema_val))
        self.assertGreater(ema_val, 0)

        rsi_val = IndicatorRegistry.get_value("RSI", df, period=14, bar_index=50)
        self.assertFalse(np.isnan(rsi_val))
        self.assertTrue(0 <= rsi_val <= 100)

    def test_stochastic(self):
        np.random.seed(7)
        close = 100 + np.random.randn(100).cumsum()
        df = pd.DataFrame({
            "open": close,
            "high": close + 2,
            "low": close - 2,
            "close": close,
            "volume": [1000] * 100,
        })

        # Alan verilmezse varsayilan %K dondurulur (arayuzdeki sablon boyle cagiriyor)
        k = IndicatorRegistry.get_value("Stochastic", df, period=14, bar_index=50)
        self.assertFalse(np.isnan(k))
        self.assertTrue(0 <= k <= 100, f"%K 0-100 araliginda olmali, gelen: {k}")

        d = IndicatorRegistry.get_value("Stochastic", df, period=14, bar_index=50, field="STOCH_D")
        self.assertTrue(0 <= d <= 100)

        # Warmup: period'dan onceki barlar NaN olmali (lookahead korumasi)
        self.assertTrue(np.isnan(IndicatorRegistry.get_value("Stochastic", df, 14, 5)))

    def test_stochastic_edge_cases(self):
        """Kesintisiz yukselis/dusus ve tamamen yatay fiyat."""
        n = 60
        up = pd.DataFrame({
            "open": np.linspace(100, 200, n), "high": np.linspace(100, 200, n),
            "low": np.linspace(100, 200, n), "close": np.linspace(100, 200, n),
            "volume": [1000] * n,
        })
        # Kapanis her zaman period'un en yuksegi -> %K = 100
        self.assertAlmostEqual(IndicatorRegistry.get_value("Stochastic", up, 14, 40), 100.0, places=6)

        down = up.copy()
        for col in ("open", "high", "low", "close"):
            down[col] = np.linspace(200, 100, n)
        self.assertAlmostEqual(IndicatorRegistry.get_value("Stochastic", down, 14, 40), 0.0, places=6)

        # Tamamen yatay: yuksek == dusuk, oran tanimsiz -> notr 50 (NaN degil)
        flat = up.copy()
        for col in ("open", "high", "low", "close"):
            flat[col] = 100.0
        self.assertEqual(IndicatorRegistry.get_value("Stochastic", flat, 14, 40), 50.0)

    def test_multi_output_field_names_are_stable(self):
        """
        Coklu ciktili indikatorlerin alan adlari arayuzdeki sablonlarla
        birebir eslesmeli. Uyusmazlik "gecersiz alan" hatasina yol aciyordu
        (ConditionEditor 'upper'/'lower'/'signal' gonderiyordu).
        """
        expected = {
            "MACD": ["MACD", "MACD_signal", "MACD_hist"],
            "BollingerBands": ["BB_upper", "BB_middle", "BB_lower"],
            "ADX": ["ADX", "+DI", "-DI"],
            "Stochastic": ["STOCH_K", "STOCH_D"],
        }
        for name, fields in expected.items():
            self.assertEqual(IndicatorRegistry.get_info(name)["fields"], fields, f"{name} alanlari degismis")

    def test_rule_evaluator_and_engine(self):
        closes = [10.0] * 30 + [12.0, 15.0, 18.0, 22.0, 25.0, 30.0, 35.0, 40.0, 45.0, 50.0]
        df = pd.DataFrame({
            "timestamp": pd.date_range(start="2024-01-01", periods=len(closes), freq="1D"),
            "open": closes,
            "high": [c + 1 for c in closes],
            "low": [c - 1 for c in closes],
            "close": closes,
            "volume": [1000] * len(closes),
        })

        strategy = {
            "id": "test_strat",
            "name": "Test Strategy",
            "parameters": [
                {"name": "fast_period", "type": "int", "default": 5, "min": 2, "max": 50},
                {"name": "slow_period", "type": "int", "default": 20, "min": 5, "max": 100},
            ],
            "entry_rules": {
                "logic": "AND",
                "conditions": [
                    {
                        "left": {"type": "indicator", "name": "EMA", "period": "$fast_period"},
                        "operator": ">",
                        "right": {"type": "indicator", "name": "EMA", "period": "$slow_period"},
                    }
                ],
            },
            "exit_rules": {
                "logic": "AND",
                "conditions": [],
            },
        }

        signals = RuleEngine.evaluate_range(strategy, df)
        self.assertIsInstance(signals, list)

        sig, details = RuleEngine.evaluate(strategy, df, bar_index=35)
        self.assertIn(sig, (SignalType.BUY, SignalType.SELL, SignalType.NEUTRAL))


if __name__ == "__main__":
    unittest.main()
