"""
Örüntü arama motoru birim testleri.

Vurgu bitişik barların BÖLGEye katlanmasında ve lookahead güvenliğinde:
ikisi de sessizce bozulabilecek, gözle fark edilmesi zor davranışlar.
"""

import unittest

import pandas as pd

from app.engines import pattern_engine
from app.rules.validation import validate_condition_group


def make_df(closes: list[float], start_ts: int = 1_700_000_000, step: int = 86400) -> pd.DataFrame:
    """Verilen kapanışlardan basit bir OHLCV çerçevesi kurar."""
    return pd.DataFrame(
        {
            "timestamp": [start_ts + i * step for i in range(len(closes))],
            "open": closes,
            "high": [c + 1 for c in closes],
            "low": [c - 1 for c in closes],
            "close": closes,
            "volume": [1000.0] * len(closes),
        }
    )


def close_gt(value: float) -> dict:
    return {
        "logic": "AND",
        "conditions": [
            {
                "left": {"type": "price", "name": "close"},
                "operator": ">",
                "right": {"type": "value", "value": value},
            }
        ],
    }


class TestPatternEngine(unittest.TestCase):
    # Testlerdeki veriler 0. barı bilinçli olarak eşleşmeyen bir değerle
    # başlatır: tarama 1. bardan başlıyor (bkz. test_first_bar_is_never_scanned).

    def test_finds_single_region(self):
        # 100,101,102 eşleşir (>99.5); 90 ve 98,97 eşleşmez.
        df = make_df([90, 100, 101, 102, 98, 97])
        result = pattern_engine.search(df, close_gt(99.5))

        self.assertEqual(result["region_count"], 1)
        self.assertEqual(result["match_count"], 3)

        region = result["regions"][0]
        self.assertEqual(region["start_index"], 1)
        self.assertEqual(region["end_index"], 3)
        self.assertEqual(region["bar_count"], 3)

    def test_first_bar_is_never_scanned(self):
        """Tarama 1. bardan başlar — 0. barın öncesi yok.

        `cross_above` / `rising` gibi operatörler bir önceki bara bakıyor;
        warmup tabanı strateji motoruyla ortak tutulduğu için koşulda böyle
        bir operatör olmasa da ilk bar atlanır. Sessiz bir davranış olmasın
        diye burada açıkça sabitlendi.
        """
        df = make_df([100, 100, 100])
        result = pattern_engine.search(df, close_gt(50))

        self.assertEqual(result["total_bars_scanned"], 2)
        self.assertEqual(result["regions"][0]["start_index"], 1)

    def test_splits_non_adjacent_matches_into_regions(self):
        # Eşleşme: 1-2, sonra 5. İki ayrı bölge olmalı, tek bölge değil.
        df = make_df([90, 100, 101, 90, 91, 105])
        result = pattern_engine.search(df, close_gt(99.5))

        self.assertEqual(result["region_count"], 2)
        self.assertEqual(result["match_count"], 3)
        self.assertEqual(
            [(r["start_index"], r["end_index"]) for r in result["regions"]],
            [(1, 2), (5, 5)],
        )

    def test_closes_region_open_at_end_of_data(self):
        # Veri, koşul hâlâ doğruyken bitiyor — son bölge kaybolmamalı.
        df = make_df([90, 100, 101])
        result = pattern_engine.search(df, close_gt(99.5))

        self.assertEqual(result["region_count"], 1)
        self.assertEqual(result["regions"][0]["end_index"], 2)

    def test_no_match_returns_empty(self):
        df = make_df([10, 11, 12])
        result = pattern_engine.search(df, close_gt(1000))

        self.assertEqual(result["region_count"], 0)
        self.assertEqual(result["match_count"], 0)
        self.assertEqual(result["regions"], [])
        self.assertFalse(result["truncated"])

    def test_empty_dataframe(self):
        result = pattern_engine.search(pd.DataFrame(), close_gt(1))
        self.assertEqual(result["match_count"], 0)
        self.assertEqual(result["regions"], [])

    def test_region_carries_timestamps(self):
        df = make_df([90, 100, 101], start_ts=1_700_000_000, step=86400)
        region = pattern_engine.search(df, close_gt(99.5))["regions"][0]

        self.assertEqual(region["start_time"], 1_700_000_000 + 86400)
        self.assertEqual(region["end_time"], 1_700_000_000 + 2 * 86400)

    def test_truncation_keeps_full_count(self):
        """Liste kırpılsa da sayım tam kalmalı.

        `region_count`'ı listeden türetmek "500 bölge bulundu" deyip gerçekte
        binlerce olduğunu gizlerdi.
        """
        # Bir eşleşmeyen bir eşleşen: 10 ayrı bölge (0. bar zaten atlanıyor).
        df = make_df([0, 100] * 10)
        result = pattern_engine.search(df, close_gt(50), max_regions=3)

        self.assertEqual(result["region_count"], 10)
        self.assertEqual(len(result["regions"]), 3)
        self.assertTrue(result["truncated"])

    def test_warmup_skips_unreliable_bars(self):
        """İndikatörün ısınmadığı barlar taranmamalı.

        EMA(20) ilk 20 barda NaN döner; o barları "eşleşmedi" saymak yerine
        hiç taramamak gerekir, yoksa bölge sınırları ısınma artığıyla kayar.
        """
        df = make_df([100] * 40)
        group = {
            "logic": "AND",
            "conditions": [
                {
                    "left": {"type": "indicator", "name": "EMA", "period": 20},
                    "operator": ">",
                    "right": {"type": "value", "value": 0},
                }
            ],
        }
        result = pattern_engine.search(df, group)

        # 40 bar var, ilk 20'si ısınma → 20 bar taranır.
        self.assertEqual(result["total_bars_scanned"], 20)
        self.assertEqual(result["regions"][0]["start_index"], 20)

    def test_candle_pattern_through_engine(self):
        """Mum formasyonları aramada da kullanılabilmeli (asıl amaç bu)."""
        df = pd.DataFrame(
            {
                "timestamp": [1, 2, 3],
                "open": [100, 94, 100],
                "high": [101, 102, 101],
                "low": [94, 93, 99],
                "close": [95, 101, 100],
                "volume": [1.0, 1.0, 1.0],
            }
        )
        group = {
            "logic": "AND",
            "conditions": [
                {
                    "left": {"type": "indicator", "name": "BullishEngulfing", "period": 1},
                    "operator": ">",
                    "right": {"type": "value", "value": 0},
                }
            ],
        }
        result = pattern_engine.search(df, group)

        self.assertEqual(result["match_count"], 1)
        self.assertEqual(result["regions"][0]["start_index"], 1)

    def test_no_lookahead(self):
        """Bir barın eşleşmesi SONRAKİ barlara bağlı olmamalı.

        Veriyi kısaltıp aynı barı yeniden aradığımızda sonuç değişmemeli
        (RULES.md §19-23).
        """
        df = make_df([100, 90, 101, 95, 102, 91])
        full = pattern_engine.search(df, close_gt(99.5))
        full_matches = {
            i
            for r in full["regions"]
            for i in range(r["start_index"], r["end_index"] + 1)
        }

        for cut in range(1, len(df) + 1):
            partial = pattern_engine.search(df.iloc[:cut].reset_index(drop=True), close_gt(99.5))
            partial_matches = {
                i
                for r in partial["regions"]
                for i in range(r["start_index"], r["end_index"] + 1)
            }
            self.assertEqual(
                partial_matches,
                {i for i in full_matches if i < cut},
                f"{cut} barlık kesitte eşleşmeler farklı — ileri bakış var",
            )

    def test_respects_index_bounds(self):
        df = make_df([100, 101, 102, 103, 104])
        result = pattern_engine.search(df, close_gt(50), start_index=2, end_index=3)

        self.assertEqual(result["total_bars_scanned"], 2)
        self.assertEqual(result["regions"][0]["start_index"], 2)
        self.assertEqual(result["regions"][0]["end_index"], 3)

    def test_resolves_parameter_reference(self):
        # Eşik doğrudan sayı değil, "$esik" parametresi.
        group = {
            "logic": "AND",
            "conditions": [
                {
                    "left": {"type": "price", "name": "close"},
                    "operator": ">",
                    "right": {"type": "value", "value": "$esik"},
                }
            ],
        }
        df = make_df([90, 100, 90, 101])
        result = pattern_engine.search(df, group, params={"esik": 99.5})

        self.assertEqual(result["match_count"], 2)


class TestConditionGroupValidation(unittest.TestCase):
    def test_accepts_valid_group(self):
        self.assertEqual(validate_condition_group(close_gt(10)), [])

    def test_rejects_non_object(self):
        self.assertTrue(validate_condition_group("bir metin"))

    def test_rejects_bad_operator(self):
        group = {
            "logic": "AND",
            "conditions": [
                {
                    "left": {"type": "price", "name": "close"},
                    "operator": "kesinlikle_yok",
                    "right": {"type": "value", "value": 1},
                }
            ],
        }
        self.assertTrue(validate_condition_group(group))

    def test_rejects_unknown_parameter_reference(self):
        group = {
            "logic": "AND",
            "conditions": [
                {
                    "left": {"type": "price", "name": "close"},
                    "operator": ">",
                    "right": {"type": "value", "value": "$tanimsiz"},
                }
            ],
        }
        self.assertTrue(validate_condition_group(group, parameters=[]))

    def test_rejects_negative_offset_as_lookahead(self):
        group = {
            "logic": "AND",
            "conditions": [
                {
                    "left": {"type": "price", "name": "close", "offset": -1},
                    "operator": ">",
                    "right": {"type": "value", "value": 1},
                }
            ],
        }
        self.assertTrue(validate_condition_group(group))


if __name__ == "__main__":
    unittest.main()
