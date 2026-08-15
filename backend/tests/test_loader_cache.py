"""
DataLoader onbellek/retention etkilesimi (unittest).

Buradaki asil regresyon: retention limiti onbellegi kirpiyor, kapsama
kontrolu ise kirpilmis baslangica bakiyordu. Talep retention'i astiginda
kosul HICBIR ZAMAN saglanamiyor ve her istek eksik oneki yeniden
indiriyordu (indir -> birlestir -> kirp -> yine eksik).

Testler aga cikmaz: sahte saglayici ve gecici bir storage dizini kullanilir.
"""

from __future__ import annotations

import shutil
import tempfile
import unittest
from datetime import datetime, timedelta

import pandas as pd

from app.data.loader import DataLoader


class CountingProvider:
    """Istenen araligi gunluk mumlarla dolduran, cagri sayan sahte saglayici."""

    def __init__(self, history_start: datetime):
        self.history_start = history_start
        self.calls: list[tuple[datetime, datetime]] = []

    def fetch_ohlcv(self, symbol, timeframe, start_time, end_time):
        self.calls.append((start_time, end_time))
        start = max(start_time, self.history_start)

        rows = []
        cursor = start.replace(hour=0, minute=0, second=0, microsecond=0)
        while cursor <= end_time:
            rows.append({
                "timestamp": cursor, "open": 1.0, "high": 2.0,
                "low": 0.5, "close": 1.5, "volume": 10.0,
            })
            cursor += timedelta(days=1)
        return pd.DataFrame(rows)


class TestRetentionCacheCoverage(unittest.TestCase):
    RETENTION = 50

    def setUp(self) -> None:
        self.tmp = tempfile.mkdtemp()
        self.loader = DataLoader()
        self.loader.project_root = self.tmp
        # Her zaman dilimi icin kucuk ve ongorulebilir bir retention.
        self.loader._retention_limit = lambda timeframe: self.RETENTION

        self.end = datetime(2024, 6, 1)
        # Saglayicinin gecmisi taleplerden cok daha uzun: kisitlayan tek sey
        # retention limitidir.
        self.provider = CountingProvider(history_start=datetime(2000, 1, 1))
        self.loader.providers["binance"] = self.provider

    def tearDown(self) -> None:
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _load(self, days: int):
        return self.loader.load_data(
            provider_name="binance", symbol="TEST", timeframe="1d",
            start_time=self.end - timedelta(days=days), end_time=self.end,
        )

    def test_cache_is_pruned_to_retention(self):
        df = self._load(days=400)
        self.assertLessEqual(len(df), self.RETENTION)

    def test_repeated_request_beyond_retention_does_not_refetch(self):
        """Asil regresyon: retention'i asan istek her seferinde yeniden indiriyordu."""
        self._load(days=400)
        calls_after_first = len(self.provider.calls)
        self.assertGreater(calls_after_first, 0)

        # Ayni (retention'i asan) istek tekrar: onbellek yeterli sayilmali.
        self._load(days=400)
        self.assertEqual(
            len(self.provider.calls), calls_after_first,
            "retention tavanindaki onbellek icin yeniden indirme yapildi",
        )

        # Ucuncu kez de sabit kalmali.
        self._load(days=400)
        self.assertEqual(len(self.provider.calls), calls_after_first)

    def test_request_within_cache_is_served_from_cache(self):
        self._load(days=400)
        calls = len(self.provider.calls)
        result = self._load(days=10)
        self.assertEqual(len(self.provider.calls), calls)
        self.assertFalse(result.empty)

    def test_result_is_clipped_to_requested_range(self):
        """Ilk (onbelleksiz) yol da istenen araliga kirpmali."""
        df = self._load(days=10)
        self.assertFalse(df.empty)
        self.assertGreaterEqual(df["timestamp"].min(), self.end - timedelta(days=10))
        self.assertLessEqual(df["timestamp"].max(), self.end)


class TestCachedFrameNormalization(unittest.TestCase):
    """load_data ve /window ayni parquet'ten AYNI mumlari uretmeli."""

    def setUp(self) -> None:
        self.loader = DataLoader()

    def test_daily_timestamps_are_normalized_and_deduped(self):
        raw = pd.DataFrame({
            "timestamp": [
                pd.Timestamp("2024-01-01 09:30"),
                pd.Timestamp("2024-01-01 17:00"),
                pd.Timestamp("2024-01-02 09:30"),
            ],
            "open": [1.0, 1.1, 1.2], "high": [2.0, 2.1, 2.2],
            "low": [0.5, 0.6, 0.7], "close": [1.5, 1.6, 1.7], "volume": [10.0, 11.0, 12.0],
        })
        out = self.loader._normalize_cached_frame(raw, "bist", "1d")
        self.assertEqual(len(out), 2)
        self.assertTrue((out["timestamp"] == out["timestamp"].dt.normalize()).all())
        self.assertAlmostEqual(float(out.iloc[0]["close"]), 1.6)

    def test_forex_zero_volume_is_synthesized(self):
        n = 20
        raw = pd.DataFrame({
            "timestamp": pd.date_range("2024-01-01", periods=n, freq="1D"),
            "open": [1.1] * n, "high": [1.2] * n, "low": [1.0] * n,
            "close": [1.15] * n, "volume": [0.0] * n,
        })
        out = self.loader._normalize_cached_frame(raw, "forex", "1d")
        self.assertGreater(out["volume"].sum(), 0.0)

    def test_non_forex_is_left_alone(self):
        n = 5
        raw = pd.DataFrame({
            "timestamp": pd.date_range("2024-01-01", periods=n, freq="1h"),
            "open": [1.0] * n, "high": [2.0] * n, "low": [0.5] * n,
            "close": [1.0] * n, "volume": [0.0] * n,
        })
        out = self.loader._normalize_cached_frame(raw, "binance", "1h")
        self.assertEqual(out["volume"].sum(), 0.0)

    def test_input_frame_is_not_mutated(self):
        raw = pd.DataFrame({
            "timestamp": [pd.Timestamp("2024-01-01 09:30")],
            "open": [1.0], "high": [2.0], "low": [0.5], "close": [1.5], "volume": [10.0],
        })
        before = raw["timestamp"].iloc[0]
        self.loader._normalize_cached_frame(raw, "bist", "1d")
        self.assertEqual(raw["timestamp"].iloc[0], before)


if __name__ == "__main__":
    unittest.main()
