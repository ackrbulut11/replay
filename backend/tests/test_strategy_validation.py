"""
Strateji kural agaci dogrulamasi (unittest).

Eskiden tanimsiz parametreye ya da var olmayan gostergeye referans veren bir
strateji sorunsuz kaydediliyor, hata ancak test calistirilinca ve 500 olarak
ortaya cikiyordu.
"""

from __future__ import annotations

import unittest

from app.rules.validation import (
    VALID_TIMEFRAMES,
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



class TestSessizceCalismayanStratejiler(unittest.TestCase):
    """Kural agaci tek tek gecerli oldugu halde strateji HIC calismayabilir.

    Bu durumlar kaydetmede hic yakalanmiyordu; kullanici ancak '0 islem'
    sonucunu gorunce fark ediyordu -- o da genelde stratejinin kotu oldugu
    sanilarak.
    """

    @staticmethod
    def _condition():
        return {
            "left": {"type": "price", "field": "close"},
            "operator": ">",
            "right": {"type": "value", "value": 0},
        }

    def _strategy(self, **overrides):
        base = {
            "parameters": [],
            "entry_rules": {"logic": "AND", "conditions": [self._condition()]},
            "exit_rules": {"logic": "AND", "conditions": [self._condition()]},
            "timeframe_filters": [],
            "allow_short": False,
        }
        base.update(overrides)
        return base

    # ─── Bos zaman dilimi filtresi ──────────────────────────────────────────

    def test_bos_zaman_dilimi_filtresi_reddedilir(self):
        # Bos grup evaluate_group'ta False doner; filtre bir KAPI oldugu icin
        # strateji omur boyu tek sinyal uretemez.
        errors = validate_strategy(
            self._strategy(
                timeframe_filters=[{"timeframe": "4h", "logic": "AND", "conditions": []}]
            )
        )
        self.assertTrue(any("en az bir koşul" in e for e in errors), errors)

    def test_dolu_zaman_dilimi_filtresi_gecer(self):
        errors = validate_strategy(
            self._strategy(
                timeframe_filters=[
                    {"timeframe": "4h", "logic": "AND", "conditions": [self._condition()]}
                ]
            )
        )
        self.assertEqual(errors, [])

    # ─── Hic kural yok / pozisyon acilamiyor ────────────────────────────────

    def test_hic_kural_yoksa_reddedilir(self):
        errors = validate_strategy(
            self._strategy(
                entry_rules={"logic": "AND", "conditions": []},
                exit_rules={"logic": "AND", "conditions": []},
            )
        )
        self.assertTrue(any("hiç kural içermiyor" in e for e in errors), errors)

    def test_giris_kurali_yoksa_ve_short_kapaliysa_reddedilir(self):
        errors = validate_strategy(
            self._strategy(entry_rules={"logic": "AND", "conditions": []})
        )
        self.assertTrue(any("hiç pozisyon açamaz" in e for e in errors), errors)

    def test_giris_kurali_yoksa_ama_short_aciksa_gecerli(self):
        # allow_short acikken cikis kurali nakitteyken SHORT acar
        # (bkz. RuleEngine.evaluate_bar_with_state).
        errors = validate_strategy(
            self._strategy(
                entry_rules={"logic": "AND", "conditions": []}, allow_short=True
            )
        )
        self.assertEqual(errors, [])

    def test_cikis_kurali_olmamasi_hata_degildir(self):
        # Bilincli: bu durum artik gorunur (sonuctaki open_position alani).
        errors = validate_strategy(
            self._strategy(exit_rules={"logic": "AND", "conditions": []})
        )
        self.assertEqual(errors, [])

    # ─── Zaman dilimi adi ───────────────────────────────────────────────────

    def test_bilinmeyen_operand_zaman_dilimi_reddedilir(self):
        condition = self._condition()
        condition["left"] = {
            "type": "indicator", "name": "EMA", "period": 20, "timeframe": "3h",
        }
        errors = validate_strategy(
            self._strategy(entry_rules={"logic": "AND", "conditions": [condition]})
        )
        self.assertTrue(any("bilinmeyen zaman dilimi" in e for e in errors), errors)

    def test_gecerli_operand_zaman_dilimi_kabul_edilir(self):
        condition = self._condition()
        condition["left"] = {
            "type": "indicator", "name": "EMA", "period": 20, "timeframe": "4h",
        }
        errors = validate_strategy(
            self._strategy(entry_rules={"logic": "AND", "conditions": [condition]})
        )
        self.assertEqual(errors, [])

    def test_bilinmeyen_filtre_zaman_dilimi_reddedilir(self):
        errors = validate_strategy(
            self._strategy(
                timeframe_filters=[
                    {"timeframe": "2h", "logic": "AND", "conditions": [self._condition()]}
                ]
            )
        )
        self.assertTrue(any("bilinmeyen zaman dilimi" in e for e in errors), errors)

    def test_zaman_dilimi_listesi_loader_ile_ayni(self):
        """Liste iki yerde: rules/ katmani data/ katmanina bagimli olamaz."""
        from app.data.loader import TIMEFRAME_DELTAS

        self.assertEqual(VALID_TIMEFRAMES, frozenset(TIMEFRAME_DELTAS))

    # ─── rising / falling sag operandi ──────────────────────────────────────

    def test_rising_sag_operandi_gosterge_olamaz(self):
        # Sag operand ESIK degil, KAC BAR GERIYE bakilacagi. Oraya gosterge
        # konursa int(right_val) binlerce barlik geri bakis uretir ve kosul
        # sessizce hep NaN doner.
        condition = {
            "left": {"type": "indicator", "name": "EMA", "period": 20},
            "operator": "rising",
            "right": {"type": "indicator", "name": "EMA", "period": 50},
        }
        errors = validate_strategy(
            self._strategy(entry_rules={"logic": "AND", "conditions": [condition]})
        )
        self.assertTrue(any("bir SAYI olmalı" in e for e in errors), errors)

    def test_rising_sag_operandi_sayi_olmali(self):
        condition = {
            "left": {"type": "indicator", "name": "EMA", "period": 20},
            "operator": "rising",
            "right": {"type": "value", "value": 3},
        }
        errors = validate_strategy(
            self._strategy(entry_rules={"logic": "AND", "conditions": [condition]})
        )
        self.assertEqual(errors, [])

    def test_rising_bar_sayisi_en_az_bir_olmali(self):
        condition = {
            "left": {"type": "indicator", "name": "EMA", "period": 20},
            "operator": "falling",
            "right": {"type": "value", "value": 0},
        }
        errors = validate_strategy(
            self._strategy(entry_rules={"logic": "AND", "conditions": [condition]})
        )
        self.assertTrue(any("en az 1 olmalı" in e for e in errors), errors)

    def test_rising_parametre_referansi_kabul_edilir(self):
        condition = {
            "left": {"type": "indicator", "name": "EMA", "period": 20},
            "operator": "rising",
            "right": {"type": "value", "value": "$lookback"},
        }
        errors = validate_strategy(
            self._strategy(
                parameters=[{"name": "lookback", "default": 3, "min": 1, "max": 10}],
                entry_rules={"logic": "AND", "conditions": [condition]},
            )
        )
        self.assertEqual(errors, [])


if __name__ == "__main__":
    unittest.main()
