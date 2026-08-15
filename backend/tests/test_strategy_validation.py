"""
Strateji kural agaci dogrulamasi (unittest).

Eskiden tanimsiz parametreye ya da var olmayan gostergeye referans veren bir
strateji sorunsuz kaydediliyor, hata ancak test calistirilinca ve 500 olarak
ortaya cikiyordu.
"""

from __future__ import annotations

import unittest

from app.rules.validation import (
    StrategyValidationError,
    raise_if_invalid,
    validate_strategy,
)


def strategy(**overrides):
    base = {
        "id": "s1", "name": "S1",
        "parameters": [{"name": "fast", "type": "int", "default": 10, "min": 2, "max": 50}],
        "entry_rules": {"logic": "AND", "conditions": [{
            "left": {"type": "indicator", "name": "EMA", "period": "$fast"},
            "operator": ">",
            "right": {"type": "value", "value": 100},
        }]},
        "exit_rules": {"logic": "AND", "conditions": []},
        "timeframe_filters": [],
    }
    base.update(overrides)
    return base


class TestValidStrategies(unittest.TestCase):
    def test_reference_strategy_is_valid(self):
        self.assertEqual(validate_strategy(strategy()), [])

    def test_nested_groups_are_valid(self):
        s = strategy(entry_rules={"logic": "OR", "conditions": [
            {"logic": "AND", "conditions": [{
                "left": {"type": "price", "field": "close"},
                "operator": ">",
                "right": {"type": "value", "value": 1},
            }]},
        ]})
        self.assertEqual(validate_strategy(s), [])

    def test_arithmetic_operand_is_valid(self):
        s = strategy(entry_rules={"logic": "AND", "conditions": [{
            "left": {"type": "price", "field": "close"},
            "operator": "<",
            "right": {"type": "expr", "op": "-",
                      "left": {"type": "price", "field": "close"},
                      "right": {"type": "indicator", "name": "ATR", "period": 14}},
        }]})
        self.assertEqual(validate_strategy(s), [])


class TestInvalidStrategies(unittest.TestCase):
    def _errors(self, **overrides):
        return validate_strategy(strategy(**overrides))

    def test_undefined_parameter_reference(self):
        errors = self._errors(entry_rules={"logic": "AND", "conditions": [{
            "left": {"type": "indicator", "name": "EMA", "period": "$yok"},
            "operator": ">",
            "right": {"type": "value", "value": 1},
        }]})
        self.assertTrue(any("$yok" in e for e in errors), errors)

    def test_unknown_indicator(self):
        errors = self._errors(entry_rules={"logic": "AND", "conditions": [{
            "left": {"type": "indicator", "name": "SihirliOrtalama", "period": 20},
            "operator": ">",
            "right": {"type": "value", "value": 1},
        }]})
        self.assertTrue(any("SihirliOrtalama" in e for e in errors), errors)

    def test_invalid_indicator_field(self):
        errors = self._errors(entry_rules={"logic": "AND", "conditions": [{
            "left": {"type": "indicator", "name": "MACD", "period": 12, "field": "signal"},
            "operator": ">",
            "right": {"type": "value", "value": 1},
        }]})
        self.assertTrue(any("signal" in e for e in errors), errors)

    def test_field_on_single_output_indicator(self):
        errors = self._errors(entry_rules={"logic": "AND", "conditions": [{
            "left": {"type": "indicator", "name": "EMA", "period": 20, "field": "upper"},
            "operator": ">",
            "right": {"type": "value", "value": 1},
        }]})
        self.assertTrue(any("tek çıktılıdır" in e for e in errors), errors)

    def test_invalid_price_field(self):
        errors = self._errors(entry_rules={"logic": "AND", "conditions": [{
            "left": {"type": "price", "field": "kapanis"},
            "operator": ">",
            "right": {"type": "value", "value": 1},
        }]})
        self.assertTrue(any("kapanis" in e for e in errors), errors)

    def test_unknown_operator(self):
        errors = self._errors(entry_rules={"logic": "AND", "conditions": [{
            "left": {"type": "price", "field": "close"},
            "operator": "yaklasik_esit",
            "right": {"type": "value", "value": 1},
        }]})
        self.assertTrue(any("yaklasik_esit" in e for e in errors), errors)

    def test_period_out_of_range(self):
        errors = self._errors(entry_rules={"logic": "AND", "conditions": [{
            "left": {"type": "indicator", "name": "RSI", "period": 5000},
            "operator": ">",
            "right": {"type": "value", "value": 1},
        }]})
        self.assertTrue(any("periyodu" in e for e in errors), errors)

    def test_negative_offset(self):
        errors = self._errors(entry_rules={"logic": "AND", "conditions": [{
            "left": {"type": "price", "field": "close", "offset": -2},
            "operator": ">",
            "right": {"type": "value", "value": 1},
        }]})
        self.assertTrue(any("offset" in e for e in errors), errors)

    def test_between_without_second_bound(self):
        errors = self._errors(entry_rules={"logic": "AND", "conditions": [{
            "left": {"type": "indicator", "name": "RSI", "period": 14},
            "operator": "between",
            "right": {"type": "value", "value": 30},
        }]})
        self.assertTrue(any("right2" in e for e in errors), errors)

    def test_duplicate_parameter_names(self):
        errors = self._errors(parameters=[
            {"name": "fast", "default": 10},
            {"name": "fast", "default": 20},
        ])
        self.assertTrue(any("birden fazla" in e for e in errors), errors)

    def test_default_outside_min_max(self):
        errors = self._errors(parameters=[
            {"name": "fast", "default": 999, "min": 2, "max": 50},
        ])
        self.assertTrue(any("varsayılan" in e for e in errors), errors)

    def test_unknown_arithmetic_operation(self):
        errors = self._errors(entry_rules={"logic": "AND", "conditions": [{
            "left": {"type": "price", "field": "close"},
            "operator": ">",
            "right": {"type": "expr", "op": "^",
                      "left": {"type": "value", "value": 2},
                      "right": {"type": "value", "value": 3}},
        }]})
        self.assertTrue(any("^" in e for e in errors), errors)

    def test_all_errors_are_reported_together(self):
        """Kullaniciya tek tek degil hepsi birden gosterilmeli."""
        errors = self._errors(entry_rules={"logic": "XOR", "conditions": [{
            "left": {"type": "indicator", "name": "Yok", "period": 20},
            "operator": "hicbiri",
            "right": {"type": "price", "field": "kapanis"},
        }]})
        self.assertGreaterEqual(len(errors), 4, errors)

    def test_raise_if_invalid_raises(self):
        with self.assertRaises(StrategyValidationError) as ctx:
            raise_if_invalid(strategy(entry_rules={"logic": "AND", "conditions": [{
                "left": {"type": "indicator", "name": "Yok", "period": 20},
                "operator": ">",
                "right": {"type": "value", "value": 1},
            }]}))
        self.assertTrue(ctx.exception.errors)


if __name__ == "__main__":
    unittest.main()
