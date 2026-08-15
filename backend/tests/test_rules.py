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
from app.rules.engine import RuleEngine, SignalType
from app.rules.strategy_models import ConditionGroupModel, ConditionModel
from app.rules.evaluator import RuleEvaluator, _get_multi_tf_bar_index, resolve_operand
from app.engines.strategy_engine import StrategyEngine


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


class TestBarDelay(unittest.TestCase):
    """RULES.md #22: sinyal kapanan mumdan, islem bir sonraki mumun acilisindan."""

    @staticmethod
    def _df():
        # Acilis ve kapanis bilerek FARKLI: gecikmeli emrin sonraki mumun
        # ACILISINDAN gerceklestigini fiyattan dogrulayabilmek icin.
        closes = [10.0] * 30 + [12.0, 15.0, 18.0, 22.0, 25.0, 30.0, 35.0, 40.0, 45.0, 50.0]
        return pd.DataFrame({
            "timestamp": pd.date_range(start="2024-01-01", periods=len(closes), freq="1D"),
            "open": [c + 0.5 for c in closes],
            "high": [c + 1 for c in closes],
            "low": [c - 1 for c in closes],
            "close": closes,
            "volume": [1000] * len(closes),
        })

    @staticmethod
    def _strategy(**overrides):
        strategy = {
            "id": "delay_strat",
            "name": "Delay Strategy",
            "parameters": [],
            "entry_rules": {
                "logic": "AND",
                "conditions": [{
                    "left": {"type": "indicator", "name": "EMA", "period": 5},
                    "operator": ">",
                    "right": {"type": "indicator", "name": "EMA", "period": 20},
                }],
            },
            "exit_rules": {"logic": "AND", "conditions": []},
        }
        strategy.update(overrides)
        return strategy

    def test_default_is_one_bar_delay(self):
        """Alan verilmezse varsayilan kural uyumludur: 1 bar gecikme."""
        signals = RuleEngine.evaluate_range(self._strategy(), self._df())
        self.assertTrue(signals, "En az bir sinyal beklenirdi")

        first = signals[0]
        # Sinyal bar i'de uretilir, emir bar i+1'de gerceklesir.
        self.assertEqual(first["bar_index"], first["signal_bar_index"] + 1)
        # ...ve fiyat, gerceklesme mumunun ACILISIDIR (kapanis degil).
        df = self._df()
        self.assertAlmostEqual(first["price"], float(df.iloc[first["bar_index"]]["open"]), places=4)
        self.assertNotAlmostEqual(first["price"], float(df.iloc[first["signal_bar_index"]]["close"]), places=4)

    def test_intrabar_opt_in(self):
        """bar_delay=0 acikca secilirse eski (intrabar) davranis korunur."""
        signals = RuleEngine.evaluate_range(self._strategy(bar_delay=0), self._df())
        self.assertTrue(signals)

        first = signals[0]
        self.assertEqual(first["bar_index"], first["signal_bar_index"])
        df = self._df()
        self.assertAlmostEqual(first["price"], float(df.iloc[first["bar_index"]]["close"]), places=4)

    def test_delay_shifts_signal_later(self):
        """Gecikmeli emir, intrabar esdegerinden en az bir mum sonra gerceklesir."""
        delayed = RuleEngine.evaluate_range(self._strategy(), self._df())
        intrabar = RuleEngine.evaluate_range(self._strategy(bar_delay=0), self._df())
        self.assertGreater(delayed[0]["bar_index"], intrabar[0]["bar_index"])

    def test_stop_loss_is_not_delayed(self):
        """TP/SL piyasada duran emirdir; gecikmeye tabi degildir."""
        strategy = self._strategy(stop_loss_pct=5.0)
        signals = RuleEngine.evaluate_range(strategy, self._df())
        stops = [s for s in signals if s["signal_bar_index"] == s["bar_index"] and "Zarar Durdur" in " ".join(s["conditions_met"])]
        for stop in stops:
            self.assertEqual(stop["bar_index"], stop["signal_bar_index"])


class TestMultiTimeframeAlignment(unittest.TestCase):
    """Ust zaman diliminden yalnizca KAPANMIS mum okunmali (RULES.md #19-21)."""

    @staticmethod
    def _frames():
        # 15dk grafik: 08:00'dan itibaren 32 mum (08:00 -> 15:45)
        fine_ts = pd.date_range(start="2024-01-01 08:00", periods=32, freq="15min")
        fine = pd.DataFrame({
            "timestamp": fine_ts,
            "open": 100.0, "high": 101.0, "low": 99.0, "close": 100.0, "volume": 1000,
        })
        # 4s ust dilim: 00:00, 04:00, 08:00, 12:00
        coarse_ts = pd.date_range(start="2024-01-01 00:00", periods=4, freq="4h")
        coarse = pd.DataFrame({
            "timestamp": coarse_ts,
            "open": 100.0, "high": 101.0, "low": 99.0, "close": 100.0, "volume": 1000,
        })
        return fine, coarse

    def test_forming_coarse_bar_is_not_used(self):
        fine, coarse = self._frames()
        # 10:15'teki 15dk mumu (index 9); kapanisi 10:30.
        # 08:00 baslayan 4s mumu 12:00'de kapanacak -> KULLANILAMAZ.
        # Kullanilabilecek en son mum 04:00 (08:00'de kapandi) = index 1.
        idx = _get_multi_tf_bar_index(fine, 9, coarse)
        self.assertEqual(idx, 1)

    def test_coarse_bar_becomes_available_exactly_at_its_close(self):
        fine, coarse = self._frames()
        # 11:45'teki 15dk mumu (index 15) 12:00'de kapanir; 08:00 4s mumu da
        # tam 12:00'de kapanir -> artik kullanilabilir (index 2).
        idx = _get_multi_tf_bar_index(fine, 15, coarse)
        self.assertEqual(idx, 2)
        # Bir onceki 15dk mumu (11:30, kapanis 11:45) icin henuz kullanilamaz.
        self.assertEqual(_get_multi_tf_bar_index(fine, 14, coarse), 1)

    def test_same_timeframe_uses_the_bar_itself(self):
        """Ayni dilim verilirse mumun kendisi kapanmistir; geri kaydirilmaz."""
        fine, _ = self._frames()
        self.assertEqual(_get_multi_tf_bar_index(fine, 9, fine), 9)

    def test_no_closed_coarse_bar_returns_minus_one(self):
        fine, coarse = self._frames()
        # Ilk 15dk mumu (08:00, kapanis 08:15): 04:00 mumu 08:00'de kapandi,
        # yani kullanilabilir; 00:00 da oyle. Index 1 beklenir.
        self.assertEqual(_get_multi_tf_bar_index(fine, 0, coarse), 1)
        # Ust dilim tamamen ileride ise -1.
        future = coarse.copy()
        future["timestamp"] = future["timestamp"] + pd.Timedelta(days=5)
        self.assertEqual(_get_multi_tf_bar_index(fine, 0, future), -1)


class TestMultiTimeframeNoSilentFallback(unittest.TestCase):
    """Ust dilim verisi yoksa ana dilime DUSULMEZ (sessiz yanlis sonuc yerine NaN)."""

    @staticmethod
    def _df():
        n = 60
        return pd.DataFrame({
            "timestamp": pd.date_range(start="2024-01-01", periods=n, freq="15min"),
            "open": np.linspace(100, 160, n),
            "high": np.linspace(101, 161, n),
            "low": np.linspace(99, 159, n),
            "close": np.linspace(100, 160, n),
            "volume": [1000] * n,
        })

    def test_indicator_operand_returns_nan_when_timeframe_missing(self):
        df = self._df()
        operand = {"type": "indicator", "name": "EMA", "period": 5, "timeframe": "4h"}
        # multi_tf_data hic verilmemis
        self.assertTrue(np.isnan(resolve_operand(operand, df, 40, {}, None)))
        # verilmis ama istenen dilim yok
        self.assertTrue(np.isnan(resolve_operand(operand, df, 40, {}, {"1d": df})))

    def test_price_operand_returns_nan_when_timeframe_missing(self):
        df = self._df()
        operand = {"type": "price", "field": "close", "timeframe": "4h"}
        self.assertTrue(np.isnan(resolve_operand(operand, df, 40, {}, None)))

    def test_condition_with_missing_timeframe_is_not_met(self):
        """NaN -> kosul saglanmaz; yanlislikla sinyal uretilmez."""
        df = self._df()
        condition = {
            "left": {"type": "price", "field": "close", "timeframe": "4h"},
            "operator": ">",
            "right": {"type": "value", "value": 0},
        }
        result, desc = RuleEvaluator.evaluate_condition(condition, df, 40, {}, None)
        self.assertFalse(result)
        self.assertIn("Yetersiz veri", desc)


class TestRequiredTimeframes(unittest.TestCase):
    def test_collects_filters_and_operands_without_duplicates(self):
        strategy = {
            "timeframe_filters": [{
                "timeframe": "1d",
                "logic": "AND",
                "conditions": [{
                    "left": {"type": "indicator", "name": "EMA", "period": 200, "timeframe": "1d"},
                    "operator": ">",
                    "right": {"type": "value", "value": 1},
                }],
            }],
            "entry_rules": {"logic": "AND", "conditions": [{
                "left": {"type": "price", "field": "close", "timeframe": "4h"},
                "operator": ">",
                "right": {"type": "indicator", "name": "EMA", "period": 20},
            }]},
            "exit_rules": {"logic": "AND", "conditions": []},
        }
        self.assertEqual(StrategyEngine.required_timeframes(strategy), ["1d", "4h"])


class TestWilderSmoothing(unittest.TestCase):
    """ATR/ADX Wilder yumusatmasi kullanmali (alpha = 1/period)."""

    @staticmethod
    def _df(n=200):
        np.random.seed(11)
        close = 100 + np.random.randn(n).cumsum()
        return pd.DataFrame({
            "timestamp": pd.date_range(start="2024-01-01", periods=n, freq="1D"),
            "open": close,
            "high": close + np.abs(np.random.randn(n)),
            "low": close - np.abs(np.random.randn(n)),
            "close": close,
            "volume": [1000] * n,
        })

    def test_atr_matches_wilder_reference(self):
        df = self._df()
        period = 14
        prev_close = df["close"].shift()
        tr = pd.concat([
            df["high"] - df["low"],
            (df["high"] - prev_close).abs(),
            (df["low"] - prev_close).abs(),
        ], axis=1).max(axis=1)
        expected = tr.ewm(alpha=1.0 / period, adjust=False).mean()

        got = IndicatorRegistry.get_value("ATR", df, period, 150)
        self.assertAlmostEqual(got, float(expected.iloc[150]), places=9)

        # ...ve span tabanli (yanlis) surumden farkli olmali
        wrong = tr.ewm(span=period, adjust=False).mean()
        self.assertNotAlmostEqual(got, float(wrong.iloc[150]), places=4)

    def test_adx_stays_in_range(self):
        df = self._df()
        for idx in (60, 120, 199):
            adx = IndicatorRegistry.get_value("ADX", df, 14, idx, field="ADX")
            self.assertFalse(np.isnan(adx))
            self.assertTrue(0 <= adx <= 100, f"ADX 0-100 disinda: {adx}")

    def test_adx_on_flat_series_is_directionless_not_nan(self):
        """Tamamen yatay seri: +DI = -DI = 0, DX sifira bolme uretmemeli."""
        n = 80
        flat = pd.DataFrame({
            "timestamp": pd.date_range(start="2024-01-01", periods=n, freq="1D"),
            "open": 100.0, "high": 100.0, "low": 100.0, "close": 100.0, "volume": 1000,
        })
        adx = IndicatorRegistry.get_value("ADX", flat, 14, 60, field="ADX")
        self.assertFalse(np.isnan(adx), "Yatay seride ADX NaN olmamali")
        self.assertAlmostEqual(adx, 0.0, places=6)

    def test_rsi_still_matches_wilder(self):
        """RSI zaten dogruydu; yardimciya tasinirken degismedigini dogrula."""
        df = self._df()
        delta = df["close"].diff()
        gain = delta.where(delta > 0, 0.0)
        loss = (-delta).where(delta < 0, 0.0)
        avg_gain = gain.ewm(alpha=1.0 / 14, adjust=False).mean()
        avg_loss = loss.ewm(alpha=1.0 / 14, adjust=False).mean()
        rs = avg_gain / avg_loss.replace(0.0, float("nan"))
        expected = 100 - (100 / (1 + rs))
        self.assertAlmostEqual(
            IndicatorRegistry.get_value("RSI", df, 14, 150), float(expected.iloc[150]), places=9
        )


class TestWarmup(unittest.TestCase):
    """Isinma, ham period degil indikatorun GERCEK gereksinimi olmali."""

    @staticmethod
    def _df(n=200):
        np.random.seed(3)
        close = 100 + np.random.randn(n).cumsum()
        return pd.DataFrame({
            "timestamp": pd.date_range(start="2024-01-01", periods=n, freq="1D"),
            "open": close, "high": close + 1, "low": close - 1, "close": close,
            "volume": [1000] * n,
        })

    def test_warmup_bars_table(self):
        self.assertEqual(IndicatorRegistry.warmup_bars("EMA", 20), 20)
        self.assertEqual(IndicatorRegistry.warmup_bars("RSI", 14), 14)
        # MACD(12): slow=26, signal=9 -> 35 (12 degil)
        self.assertEqual(IndicatorRegistry.warmup_bars("MACD", 12), 35)
        # MACD(20): slow=max(42,26)=42, signal=9 -> 51
        self.assertEqual(IndicatorRegistry.warmup_bars("MACD", 20), 51)
        # Stochastic %D, %K uzerinde 3 barlik ortalama
        self.assertEqual(IndicatorRegistry.warmup_bars("Stochastic", 14), 17)
        # ADX: period ile yumusatilmis DI uzerine yine period
        self.assertEqual(IndicatorRegistry.warmup_bars("ADX", 14), 28)

    def test_macd_is_nan_before_real_warmup(self):
        df = self._df()
        # Eskiden bar 12'de deger donuyordu (yakinsamamis EMA26 uzerinden).
        self.assertTrue(np.isnan(IndicatorRegistry.get_value("MACD", df, 12, 20)))
        self.assertTrue(np.isnan(IndicatorRegistry.get_value("MACD", df, 12, 34)))
        self.assertFalse(np.isnan(IndicatorRegistry.get_value("MACD", df, 12, 35)))

    def test_adx_is_nan_before_real_warmup(self):
        df = self._df()
        self.assertTrue(np.isnan(IndicatorRegistry.get_value("ADX", df, 14, 20, field="ADX")))
        self.assertFalse(np.isnan(IndicatorRegistry.get_value("ADX", df, 14, 28, field="ADX")))

    def test_range_start_index_respects_indicator_warmup(self):
        """evaluate_range, MACD kullanan bir stratejide 35. bardan once baslamamali."""
        strategy = {
            "id": "warmup_strat", "name": "Warmup", "parameters": [],
            "entry_rules": {"logic": "AND", "conditions": [{
                "left": {"type": "indicator", "name": "MACD", "period": 12, "field": "MACD"},
                "operator": ">",
                "right": {"type": "indicator", "name": "MACD", "period": 12, "field": "MACD_signal"},
            }]},
            "exit_rules": {"logic": "AND", "conditions": []},
        }
        self.assertEqual(RuleEngine._get_warmup_period(strategy, {}), 35)


class TestStopLossDoesNotReverse(unittest.TestCase):
    """TP/SL risk yonetimi cikisidir; kendiliginden ters pozisyon acmaz."""

    @staticmethod
    def _df():
        # Once yukselis (long girisi tetiklensin), sonra sert dusus (stop).
        closes = [10.0] * 25 + [12.0, 15.0, 20.0, 26.0, 33.0] + [20.0, 14.0, 10.0, 8.0, 7.0] * 3
        return pd.DataFrame({
            "timestamp": pd.date_range(start="2024-01-01", periods=len(closes), freq="1D"),
            "open": closes,
            "high": [c + 0.5 for c in closes],
            "low": [c - 0.5 for c in closes],
            "close": closes,
            "volume": [1000] * len(closes),
        })

    @staticmethod
    def _strategy():
        return {
            "id": "sl_strat", "name": "SL", "parameters": [],
            "entry_rules": {"logic": "AND", "conditions": [{
                "left": {"type": "indicator", "name": "EMA", "period": 5},
                "operator": ">",
                "right": {"type": "indicator", "name": "EMA", "period": 20},
            }]},
            "exit_rules": {"logic": "AND", "conditions": []},
            "allow_short": True,
            "stop_loss_pct": 10.0,
        }

    def test_stop_loss_closes_flat_even_when_short_allowed(self):
        signals = RuleEngine.evaluate_range(self._strategy(), self._df())
        stops = [s for s in signals if any("Zarar Durdur" in c for c in s["conditions_met"])]
        self.assertTrue(stops, "Bu veri setinde bir stop bekleniyordu")

        for stop in stops:
            # Stop bir pozisyonu KAPATMALI...
            self.assertIn("position_closed", stop)
            # ...ve hemen ardindan ters pozisyon acilmamali: bir sonraki kayit
            # varsa o da bir kapanis olamaz (acik pozisyon yoktur).
            idx = signals.index(stop)
            if idx + 1 < len(signals):
                nxt = signals[idx + 1]
                if any("Zarar Durdur" in c or "Kar Al" in c for c in nxt["conditions_met"]):
                    self.fail("Stop sonrasi acilan ters pozisyon yeniden stop olmus")


class TestParameterOverrides(unittest.TestCase):
    STRATEGY = {
        "id": "p", "name": "P",
        "parameters": [{"name": "fast_ema", "type": "int", "default": 10, "min": 5, "max": 50}],
        "entry_rules": {"logic": "AND", "conditions": []},
        "exit_rules": {"logic": "AND", "conditions": []},
    }

    def test_default_is_used_when_no_override(self):
        self.assertEqual(RuleEngine._resolve_params(self.STRATEGY, {})["fast_ema"], 10)

    def test_override_is_clamped_to_declared_limits(self):
        self.assertEqual(RuleEngine._resolve_params(self.STRATEGY, {"fast_ema": 999})["fast_ema"], 50)
        self.assertEqual(RuleEngine._resolve_params(self.STRATEGY, {"fast_ema": 1})["fast_ema"], 5)

    def test_unknown_override_raises_instead_of_being_accepted(self):
        with self.assertRaises(ValueError) as ctx:
            RuleEngine._resolve_params(self.STRATEGY, {"fastEma": 20})
        self.assertIn("fastEma", str(ctx.exception))

    def test_engine_level_keys_are_allowed(self):
        params = RuleEngine._resolve_params(
            self.STRATEGY,
            {"allow_short": True, "take_profit_pct": 3.0, "stop_loss_pct": 2.0, "bar_delay": 0},
        )
        self.assertTrue(params["allow_short"])
        self.assertEqual(params["bar_delay"], 0)


class TestExecutionCostsInEngine(unittest.TestCase):
    """Kural motoru komisyon ve slipaji gercekten uygulamali."""

    @staticmethod
    def _df():
        # Uzun yatay + yukselis: EMA5 EMA20'yi yukari keser ve pozisyon acilir.
        closes = [10.0] * 30 + [11.0 + i * 0.6 for i in range(30)]
        return pd.DataFrame({
            "timestamp": pd.date_range(start="2024-01-01", periods=len(closes), freq="1D"),
            "open": closes, "high": [c + 1 for c in closes], "low": [c - 1 for c in closes],
            "close": closes, "volume": [1000] * len(closes),
        })

    @staticmethod
    def _strategy(**overrides):
        # take_profit ile kapanis DETERMINISTIK: brut kazanc tam %2.
        strategy = {
            "id": "cost", "name": "Cost", "parameters": [],
            "entry_rules": {"logic": "AND", "conditions": [{
                "left": {"type": "indicator", "name": "EMA", "period": 5},
                "operator": ">",
                "right": {"type": "indicator", "name": "EMA", "period": 20},
            }]},
            "exit_rules": {"logic": "AND", "conditions": []},
            "take_profit_pct": 2.0,
        }
        strategy.update(overrides)
        return strategy

    def _closed(self, strategy):
        signals = RuleEngine.evaluate_range(strategy, self._df())
        return [s for s in signals if s.get("pnl_percent") is not None]

    def test_gross_profit_without_costs(self):
        trades = self._closed(self._strategy())
        self.assertTrue(trades, "take_profit ile kapanan bir islem beklenirdi")
        self.assertAlmostEqual(trades[0]["pnl_percent"], 2.0, places=2)

    def test_commission_is_subtracted(self):
        # 50 bps/bacak -> gidis-donus %1 -> net %1
        trades = self._closed(self._strategy(commission_bps=50))
        self.assertAlmostEqual(trades[0]["pnl_percent"], 1.0, places=2)

    def test_commission_can_flip_a_winner(self):
        """Asil mesele: maliyet ince kazananlari zarara cevirir."""
        free = self._closed(self._strategy())
        expensive = self._closed(self._strategy(commission_bps=200))  # %2/bacak -> %4

        self.assertGreater(free[0]["pnl_percent"], 0.0)
        self.assertLess(expensive[0]["pnl_percent"], 0.0)

    def test_costs_do_not_change_trade_count(self):
        self.assertEqual(
            len(self._closed(self._strategy())),
            len(self._closed(self._strategy(commission_bps=50, slippage_bps=10))),
            "maliyet islem SAYISINI degistirmemeli",
        )

    def test_zero_costs_match_previous_behaviour(self):
        """Maliyet verilmezse sonuc eskisiyle ayni (kayitli testlerin anlami korunur)."""
        self.assertEqual(
            [t["pnl_percent"] for t in self._closed(self._strategy())],
            [t["pnl_percent"] for t in self._closed(self._strategy(commission_bps=0, slippage_bps=0))],
        )

    def test_slippage_moves_fill_price_adversely(self):
        signals = RuleEngine.evaluate_range(self._strategy(slippage_bps=100), self._df())
        buys = [s for s in signals if s["signal"] == "BUY"]
        self.assertTrue(buys)

        df = self._df()
        for buy in buys:
            # %1 slipajla alis, mumun acilisindan DAHA PAHALI dolmali
            self.assertGreater(buy["price"], float(df.iloc[buy["bar_index"]]["open"]))

    def test_slippage_reduces_pnl_even_without_commission(self):
        self.assertLess(
            self._closed(self._strategy(slippage_bps=50))[0]["pnl_percent"],
            self._closed(self._strategy())[0]["pnl_percent"],
        )


class TestNestedConditionGroups(unittest.TestCase):
    """(A VE B) VEYA (C VE D) ifade edilebilmeli."""

    @staticmethod
    def _df(n=60):
        closes = [100.0 + i for i in range(n)]
        return pd.DataFrame({
            "timestamp": pd.date_range(start="2024-01-01", periods=n, freq="1D"),
            "open": closes, "high": [c + 1 for c in closes], "low": [c - 1 for c in closes],
            "close": closes, "volume": [1000] * n,
        })

    @staticmethod
    def _cond(value, operator=">"):
        return {
            "left": {"type": "price", "field": "close"},
            "operator": operator,
            "right": {"type": "value", "value": value},
        }

    def test_or_of_two_and_groups(self):
        """Ust seviye OR; alt gruplardan biri saglaninca sonuc dogru."""
        df = self._df()
        group = {
            "logic": "OR",
            "conditions": [
                # Yanlis grup: close hem >1000 hem <2000 olamaz (close ~150)
                {"logic": "AND", "conditions": [self._cond(1000, ">"), self._cond(2000, "<")]},
                # Dogru grup: close > 100 VE close < 1000
                {"logic": "AND", "conditions": [self._cond(100, ">"), self._cond(1000, "<")]},
            ],
        }
        result, met = RuleEvaluator.evaluate_group(group, df, 50, {})
        self.assertTrue(result)
        self.assertTrue(any("(" in m for m in met), "alt grup parantezle gosterilmeli")

    def test_and_of_groups_requires_all(self):
        df = self._df()
        group = {
            "logic": "AND",
            "conditions": [
                {"logic": "OR", "conditions": [self._cond(1000, ">"), self._cond(100, ">")]},
                {"logic": "AND", "conditions": [self._cond(9999, ">")]},  # saglanmaz
            ],
        }
        result, _ = RuleEvaluator.evaluate_group(group, df, 50, {})
        self.assertFalse(result)

    def test_flat_conditions_still_work(self):
        """Geriye donuk uyum: duz kosul listesi eskisi gibi calismali."""
        df = self._df()
        group = {"logic": "AND", "conditions": [self._cond(100, ">")]}
        result, met = RuleEvaluator.evaluate_group(group, df, 50, {})
        self.assertTrue(result)
        self.assertEqual(len(met), 1)

    def test_mixed_condition_and_group(self):
        df = self._df()
        group = {
            "logic": "AND",
            "conditions": [
                self._cond(100, ">"),
                {"logic": "OR", "conditions": [self._cond(9999, ">"), self._cond(120, ">")]},
            ],
        }
        self.assertTrue(RuleEvaluator.evaluate_group(group, df, 50, {})[0])

    def test_depth_limit_is_enforced(self):
        """Asiri derin agac anlasilir hata vermeli, yigini tasirmamali."""
        group = {"logic": "AND", "conditions": [self._cond(1)]}
        for _ in range(15):
            group = {"logic": "AND", "conditions": [group]}
        with self.assertRaises(ValueError):
            RuleEvaluator.evaluate_group(group, self._df(), 50, {})

    def test_warmup_sees_indicators_inside_nested_groups(self):
        """Ic ice gruptaki gosterge warmup hesabina girmeli."""
        strategy = {
            "entry_rules": {"logic": "OR", "conditions": [
                {"logic": "AND", "conditions": [{
                    "left": {"type": "indicator", "name": "EMA", "period": 200},
                    "operator": ">",
                    "right": {"type": "value", "value": 1},
                }]},
            ]},
            "exit_rules": {"logic": "AND", "conditions": []},
        }
        self.assertEqual(RuleEngine._get_warmup_period(strategy, {}), 200)

    def test_required_timeframes_sees_nested_groups(self):
        strategy = {
            "entry_rules": {"logic": "OR", "conditions": [
                {"logic": "AND", "conditions": [{
                    "left": {"type": "price", "field": "close", "timeframe": "4h"},
                    "operator": ">",
                    "right": {"type": "value", "value": 1},
                }]},
            ]},
            "exit_rules": {"logic": "AND", "conditions": []},
            "timeframe_filters": [],
        }
        self.assertEqual(StrategyEngine.required_timeframes(strategy), ["4h"])

    def test_nested_group_survives_pydantic_validation(self):
        """Sema ic ice grubu kabul etmeli ve duz kosulla karistirmamali."""
        model = ConditionGroupModel(**{
            "logic": "OR",
            "conditions": [
                self._cond(100, ">"),
                {"logic": "AND", "conditions": [self._cond(50, ">")]},
            ],
        })
        self.assertEqual(len(model.conditions), 2)
        self.assertIsInstance(model.conditions[0], ConditionModel)
        self.assertIsInstance(model.conditions[1], ConditionGroupModel)


class TestArithmeticOperand(unittest.TestCase):
    """close - 2*ATR gibi ifadeler yazilabilmeli."""

    @staticmethod
    def _df(n=80):
        np.random.seed(5)
        close = 100 + np.random.randn(n).cumsum()
        return pd.DataFrame({
            "timestamp": pd.date_range(start="2024-01-01", periods=n, freq="1D"),
            "open": close, "high": close + 2, "low": close - 2,
            "close": close, "volume": [1000] * n,
        })

    def test_addition_and_subtraction(self):
        df = self._df()
        expr = {"type": "expr", "op": "+",
                "left": {"type": "price", "field": "close"},
                "right": {"type": "value", "value": 10}}
        close = float(df.iloc[50]["close"])
        self.assertAlmostEqual(resolve_operand(expr, df, 50, {}), close + 10, places=9)

        expr["op"] = "-"
        self.assertAlmostEqual(resolve_operand(expr, df, 50, {}), close - 10, places=9)

    def test_atr_based_stop_expression(self):
        """Asil kullanim: giris - 2 x ATR."""
        df = self._df()
        expr = {
            "type": "expr", "op": "-",
            "left": {"type": "price", "field": "close"},
            "right": {"type": "expr", "op": "*",
                      "left": {"type": "value", "value": 2},
                      "right": {"type": "indicator", "name": "ATR", "period": 14}},
        }
        atr = IndicatorRegistry.get_value("ATR", df, 14, 50)
        close = float(df.iloc[50]["close"])
        self.assertAlmostEqual(resolve_operand(expr, df, 50, {}), close - 2 * atr, places=9)

    def test_parameter_reference_inside_expression(self):
        df = self._df()
        expr = {"type": "expr", "op": "*",
                "left": {"type": "price", "field": "close"},
                "right": {"type": "value", "value": "$carpan"}}
        self.assertAlmostEqual(
            resolve_operand(expr, df, 50, {"carpan": 1.02}),
            float(df.iloc[50]["close"]) * 1.02, places=9,
        )

    def test_division_by_zero_is_nan_not_crash(self):
        df = self._df()
        expr = {"type": "expr", "op": "/",
                "left": {"type": "price", "field": "close"},
                "right": {"type": "value", "value": 0}}
        self.assertTrue(np.isnan(resolve_operand(expr, df, 50, {})))

    def test_nan_propagates(self):
        """Isinmamis gosterge NaN ise ifade de NaN olmali (kosul saglanmaz)."""
        df = self._df()
        expr = {"type": "expr", "op": "+",
                "left": {"type": "price", "field": "close"},
                "right": {"type": "indicator", "name": "EMA", "period": 200}}
        self.assertTrue(np.isnan(resolve_operand(expr, df, 50, {})))

    def test_unknown_operation_is_rejected(self):
        df = self._df()
        expr = {"type": "expr", "op": "**",
                "left": {"type": "value", "value": 2},
                "right": {"type": "value", "value": 3}}
        with self.assertRaises(ValueError):
            resolve_operand(expr, df, 50, {})

    def test_indicator_inside_expression_counts_for_warmup(self):
        strategy = {
            "entry_rules": {"logic": "AND", "conditions": [{
                "left": {"type": "price", "field": "close"},
                "operator": "<",
                "right": {"type": "expr", "op": "-",
                          "left": {"type": "price", "field": "close"},
                          "right": {"type": "indicator", "name": "EMA", "period": 150}},
            }]},
            "exit_rules": {"logic": "AND", "conditions": []},
        }
        self.assertEqual(RuleEngine._get_warmup_period(strategy, {}), 150)

    def test_condition_using_expression_evaluates(self):
        df = self._df()
        condition = {
            "left": {"type": "price", "field": "close"},
            "operator": ">",
            "right": {"type": "expr", "op": "-",
                      "left": {"type": "price", "field": "close"},
                      "right": {"type": "value", "value": 1}},
        }
        result, desc = RuleEvaluator.evaluate_condition(condition, df, 50, {})
        self.assertTrue(result)
        self.assertIn("(", desc, "aritmetik ifade aciklamada parantezle gosterilmeli")


class TestOffsetAndTrendOperators(unittest.TestCase):
    """N bar onceki deger + yukseliyor/dusuyor operatorleri."""

    @staticmethod
    def _frame(closes):
        return pd.DataFrame({
            "timestamp": pd.date_range(start="2024-01-01", periods=len(closes), freq="1D"),
            "open": closes, "high": [c + 1 for c in closes], "low": [c - 1 for c in closes],
            "close": closes, "volume": [1000] * len(closes),
        })

    def _up(self, n=60):
        return self._frame([100.0 + i for i in range(n)])

    def _down(self, n=60):
        return self._frame([200.0 - i for i in range(n)])

    def test_offset_reads_an_earlier_bar(self):
        df = self._up()
        now = resolve_operand({"type": "price", "field": "close"}, df, 50, {})
        five_ago = resolve_operand({"type": "price", "field": "close", "offset": 5}, df, 50, {})
        self.assertAlmostEqual(now - five_ago, 5.0, places=9)

    def test_offset_before_series_start_is_nan(self):
        self.assertTrue(np.isnan(
            resolve_operand({"type": "price", "field": "close", "offset": 10}, self._up(), 3, {})
        ))

    def test_negative_offset_is_rejected(self):
        """Ileriye kaydirma lookahead'dir (RULES.md #20)."""
        with self.assertRaises(ValueError):
            resolve_operand({"type": "price", "field": "close", "offset": -1}, self._up(), 50, {})

    def test_offset_works_on_indicators(self):
        df = self._up()
        direct = IndicatorRegistry.get_value("EMA", df, 20, 45)
        shifted = resolve_operand(
            {"type": "indicator", "name": "EMA", "period": 20, "offset": 5}, df, 50, {}
        )
        self.assertAlmostEqual(direct, shifted, places=9)

    def test_rising_on_an_uptrend(self):
        condition = {
            "left": {"type": "indicator", "name": "EMA", "period": 20},
            "operator": "rising",
            "right": {"type": "value", "value": 3},
        }
        self.assertTrue(RuleEvaluator.evaluate_condition(condition, self._up(), 50, {})[0])

    def test_falling_on_an_uptrend_is_false(self):
        condition = {
            "left": {"type": "indicator", "name": "EMA", "period": 20},
            "operator": "falling",
            "right": {"type": "value", "value": 3},
        }
        self.assertFalse(RuleEvaluator.evaluate_condition(condition, self._up(), 50, {})[0])

    def test_falling_on_a_downtrend(self):
        condition = {
            "left": {"type": "indicator", "name": "EMA", "period": 20},
            "operator": "falling",
            "right": {"type": "value", "value": 3},
        }
        self.assertTrue(RuleEvaluator.evaluate_condition(condition, self._down(), 50, {})[0])

    def test_rising_without_enough_history_is_not_met(self):
        condition = {
            "left": {"type": "price", "field": "close"},
            "operator": "rising",
            "right": {"type": "value", "value": 100},
        }
        result, desc = RuleEvaluator.evaluate_condition(condition, self._up(), 50, {})
        self.assertFalse(result)
        self.assertIn("Yetersiz veri", desc)

    def test_rising_respects_an_existing_offset(self):
        """Operandin kendi offset'i varsa lookback onun uzerine eklenir."""
        df = self._up()
        condition = {
            "left": {"type": "price", "field": "close", "offset": 2},
            "operator": "rising",
            "right": {"type": "value", "value": 3},
        }
        self.assertTrue(RuleEvaluator.evaluate_condition(condition, df, 50, {})[0])


if __name__ == "__main__":
    unittest.main()
