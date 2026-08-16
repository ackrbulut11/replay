"""
Mum formasyonu birim testleri.

Her formasyon için hem POZİTİF hem NEGATİF bir örnek var: yalnızca "bulduğunu"
test etmek, her bara 1 döndüren bozuk bir formülü de geçirirdi.
"""

import unittest

import pandas as pd

from app.indicators.patterns import (
    calc_bearish_engulfing,
    calc_bullish_engulfing,
    calc_doji,
    calc_evening_star,
    calc_hammer,
    calc_morning_star,
    calc_shooting_star,
)
from app.indicators.registry import IndicatorRegistry


def make_df(bars: list[tuple[float, float, float, float]]) -> pd.DataFrame:
    """(open, high, low, close) listesinden OHLCV çerçevesi kurar."""
    return pd.DataFrame(
        {
            "open": [b[0] for b in bars],
            "high": [b[1] for b in bars],
            "low": [b[2] for b in bars],
            "close": [b[3] for b in bars],
            "volume": [1000.0] * len(bars),
        }
    )


class TestCandlePatterns(unittest.TestCase):
    def test_bullish_engulfing(self):
        # Düşen mum (100 → 95), ardından onu saran yükselen mum (94 → 101).
        df = make_df([(100, 101, 94, 95), (94, 102, 93, 101)])
        result = calc_bullish_engulfing(df)

        self.assertEqual(result.iloc[1], 1.0)
        # İlk barın gerisi yok — formasyon olamaz.
        self.assertEqual(result.iloc[0], 0.0)

    def test_bullish_engulfing_requires_full_cover(self):
        # Yükselen mum dünkü gövdeyi tam sarmıyor (98 < 100): formasyon yok.
        df = make_df([(100, 101, 94, 95), (94, 99, 93, 98)])
        self.assertEqual(calc_bullish_engulfing(df).iloc[1], 0.0)

    def test_bullish_engulfing_rejects_doji_predecessor(self):
        # Gövdesiz bir mumu "sarmak" anlamsız; formasyon sayılmamalı.
        df = make_df([(100, 101, 99, 100), (99, 103, 98, 102)])
        self.assertEqual(calc_bullish_engulfing(df).iloc[1], 0.0)

    def test_bearish_engulfing(self):
        # Yükselen mum (95 → 100), ardından onu saran düşen mum (101 → 94).
        df = make_df([(95, 101, 94, 100), (101, 102, 93, 94)])
        result = calc_bearish_engulfing(df)

        self.assertEqual(result.iloc[1], 1.0)
        # Aynı veride ters formasyon çıkmamalı.
        self.assertEqual(calc_bullish_engulfing(df).iloc[1], 0.0)

    def test_hammer(self):
        # Gövde 1 (100→101), alt fitil 5, üst fitil 0.2, aralık 6.2.
        df = make_df([(100, 101.2, 95, 101)])
        self.assertEqual(calc_hammer(df).iloc[0], 1.0)

    def test_hammer_rejects_long_upper_wick(self):
        # Alt fitil yeterli ama üst fitil de uzun: çekiç değil.
        df = make_df([(100, 106, 95, 101)])
        self.assertEqual(calc_hammer(df).iloc[0], 0.0)

    def test_shooting_star(self):
        # Çekicin dikey aynası: uzun üst fitil, kısa alt fitil.
        df = make_df([(101, 107, 100.8, 100)])
        result = calc_shooting_star(df)

        self.assertEqual(result.iloc[0], 1.0)
        self.assertEqual(calc_hammer(df).iloc[0], 0.0)

    def test_doji(self):
        # Gövde 0.05, aralık 2 → oran 0.025, eşik 0.08.
        df = make_df([(100, 101, 99, 100.05)])
        self.assertEqual(calc_doji(df).iloc[0], 1.0)

    def test_doji_rejects_real_body(self):
        # Gövde 1.5, aralık 2 → oran 0.75.
        df = make_df([(100, 101, 99, 101.5)])
        self.assertEqual(calc_doji(df).iloc[0], 0.0)

    def test_doji_is_relative_not_absolute(self):
        # Aynı 20 birimlik gövde: 60.000'lik barda doji, 100'lük barda değil.
        big = make_df([(60000, 60500, 59500, 60020)])
        small = make_df([(100, 101, 99, 120)])

        self.assertEqual(calc_doji(big).iloc[0], 1.0)
        self.assertEqual(calc_doji(small).iloc[0], 0.0)

    def test_morning_star(self):
        # Güçlü düşüş → küçük gövdeli kararsızlık → ilk gövdenin yarısını geri alan yükseliş.
        df = make_df([(100, 101, 89, 90), (89, 90, 88, 88.5), (89, 97, 88, 96)])
        self.assertEqual(calc_morning_star(df).iloc[2], 1.0)

    def test_morning_star_requires_half_recovery(self):
        # Üçüncü mum yükseliyor ama ilk gövdenin ortasına (95) ulaşamıyor.
        df = make_df([(100, 101, 89, 90), (89, 90, 88, 88.5), (89, 92, 88, 91)])
        self.assertEqual(calc_morning_star(df).iloc[2], 0.0)

    def test_evening_star(self):
        df = make_df([(90, 101, 89, 100), (100.5, 102, 100, 101), (100, 101, 92, 93)])
        result = calc_evening_star(df)

        self.assertEqual(result.iloc[2], 1.0)
        self.assertEqual(calc_morning_star(df).iloc[2], 0.0)

    def test_flat_bar_does_not_crash(self):
        # high == low: gerçek veride oluyor (işlem görmemiş seans).
        # Sıfıra bölme NaN üretip sessizce yayılmamalı.
        df = make_df([(100, 100, 100, 100), (100, 100, 100, 100)])

        for calc in (calc_doji, calc_hammer, calc_shooting_star, calc_bullish_engulfing):
            result = calc(df)
            self.assertFalse(result.isna().any(), f"{calc.__name__} NaN üretti")

    def test_no_lookahead(self):
        """Bir bardaki değer, SONRAKİ barlardan etkilenmemeli.

        Veriyi i. bardan kesip yeniden hesaplamak aynı sonucu vermeli; vermezse
        formülde `shift(-n)` benzeri ileri bakış var demektir (RULES.md §19-23).
        """
        df = make_df(
            [
                (100, 101, 94, 95),
                (94, 102, 93, 101),
                (101, 107, 100.8, 100),
                (100, 101, 99, 100.05),
                (99, 105, 98, 104),
            ]
        )

        for calc in (
            calc_bullish_engulfing,
            calc_bearish_engulfing,
            calc_hammer,
            calc_shooting_star,
            calc_doji,
            calc_morning_star,
            calc_evening_star,
        ):
            full = calc(df)
            for cut in range(1, len(df) + 1):
                truncated = calc(df.iloc[:cut])
                self.assertEqual(
                    truncated.iloc[cut - 1],
                    full.iloc[cut - 1],
                    f"{calc.__name__}: {cut - 1}. bar sonraki barlara bağlı",
                )


class TestPatternRegistry(unittest.TestCase):
    def test_patterns_are_registered(self):
        names = {i["name"] for i in IndicatorRegistry.list_indicators()}
        for expected in (
            "BullishEngulfing",
            "BearishEngulfing",
            "Hammer",
            "ShootingStar",
            "Doji",
            "MorningStar",
            "EveningStar",
        ):
            self.assertIn(expected, names)

    def test_patterns_declare_no_period(self):
        for info in IndicatorRegistry.list_indicators():
            if info["category"] == "pattern":
                self.assertFalse(
                    info["uses_period"],
                    f"{info['name']} periyot kullanıyor göründü",
                )

    def test_other_indicators_still_use_period(self):
        # `uses_period` varsayılanı True kalmalı — bayrak eklemek eskileri bozmasın.
        by_name = {i["name"]: i for i in IndicatorRegistry.list_indicators()}
        self.assertTrue(by_name["EMA"]["uses_period"])
        self.assertTrue(by_name["RSI"]["uses_period"])

    def test_get_value_reads_pattern_through_registry(self):
        # Kural motorunun gördüğü yol: isimle çağır, bar indeksinde değer al.
        df = make_df([(100, 101, 94, 95), (94, 102, 93, 101)])
        value = IndicatorRegistry.get_value("BullishEngulfing", df, period=1, bar_index=1)
        self.assertEqual(value, 1.0)


if __name__ == "__main__":
    unittest.main()
