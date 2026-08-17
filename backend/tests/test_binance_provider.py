"""
BinanceProvider sayfalama davranisi (unittest).

Buradaki asil regresyon hiz: sayfalar SIRAYLA cekiliyordu ve her sayfanin
baslangici bir oncekinin son mumundan hesaplandigi icin paralellesemiyordu
(182 gunluk 15dk = 18 sayfa = 6,9 s). Mum suresi sabit oldugundan sayfa
sinirlari baştan hesaplanabilir; testler bunun DOGRU hesaplandigini ve
sonucun bitisik/tekrarsiz kaldigini kontrol eder.

Ikinci regresyon dogruluk: paralel yolda basarisiz bir sayfa araligin
ORTASINDA delik birakir. Sirali yolda sonuc yalnizca kisaliyordu, delik
olmuyordu; parquet onbellegi bitisik varsayildigi icin delik kalici olurdu.

Testler aga cikmaz: sayfa cekici sahtelenir.
"""

from __future__ import annotations

import unittest

from app.data.providers import binance as binance_module
from app.data.providers.binance import BinanceProvider


BAR_MS = 60_000  # 1m


def _kline(open_ms: int) -> list:
    return [open_ms, "1.0", "2.0", "0.5", "1.5", "10.0"]


class FakePages:
    """Istenen araligi mumla dolduran, cagrilari kaydeden sahte sayfa cekici."""

    def __init__(self, history_start_ms: int = 0, fail_pages: set[int] | None = None):
        self.history_start_ms = history_start_ms
        self.fail_pages = fail_pages or set()
        self.calls: list[dict] = []
        self._seen_starts: list[int] = []

    def __call__(self, params: dict) -> list | None:
        self.calls.append(params)
        start = params["startTime"]
        if start not in self._seen_starts:
            self._seen_starts.append(start)
        index = self._seen_starts.index(start)
        if index in self.fail_pages:
            return None

        rows = []
        cursor = max(start, self.history_start_ms)
        # Binance kapali aralik dondurur: [startTime, endTime]
        cursor += (-cursor) % BAR_MS  # mum sinirina hizala
        while cursor <= params["endTime"] and len(rows) < params["limit"]:
            rows.append(_kline(cursor))
            cursor += BAR_MS
        return rows


class TestParallelPaging(unittest.TestCase):
    def setUp(self) -> None:
        self.provider = BinanceProvider()
        # Yansı olcumu aga cikar; sahte cekici zaten onu atliyor ama
        # get_ordered_endpoints hic cagrilmasin diye onceden sabitlenir.
        binance_module._preferred_endpoint = binance_module.KLINE_ENDPOINTS[0]

    def _fetch(self, pages: FakePages, start_ms: int, end_ms: int):
        self.provider._fetch_page = pages
        return self.provider._fetch_pages("BTCUSDT", "1m", "1m", start_ms, end_ms)

    def test_pages_cover_the_range_without_gaps_or_duplicates(self):
        # 2500 mum -> 3 sayfa
        start_ms, end_ms = 0, 2500 * BAR_MS
        pages = FakePages()
        rows, reachable = self._fetch(pages, start_ms, end_ms)

        self.assertTrue(reachable)
        self.assertEqual(len(pages.calls), 3)

        stamps = [row[0] for row in rows]
        self.assertEqual(len(stamps), len(set(stamps)), "tekrarli mum")
        ordered = sorted(stamps)
        diffs = {b - a for a, b in zip(ordered, ordered[1:])}
        self.assertEqual(diffs, {BAR_MS}, "sayfa sinirinda bosluk")

    def test_page_windows_are_contiguous_and_non_overlapping(self):
        start_ms, end_ms = 0, 2500 * BAR_MS
        pages = FakePages()
        self._fetch(pages, start_ms, end_ms)

        windows = sorted((c["startTime"], c["endTime"]) for c in pages.calls)
        self.assertEqual(windows[0][0], start_ms)
        for (_, prev_end), (next_start, _) in zip(windows, windows[1:]):
            self.assertEqual(next_start, prev_end + 1)
        self.assertLessEqual(windows[-1][1], end_ms)

    def test_missing_page_is_retried(self):
        pages = FakePages(fail_pages=set())
        # Ilk turda ikinci sayfa duser, sonraki turda duzelir.
        original = pages.__call__

        state = {"failed_once": False}

        def flaky(params):
            if params["startTime"] == 1000 * BAR_MS and not state["failed_once"]:
                state["failed_once"] = True
                pages.calls.append(params)
                return None
            return original(params)

        self.provider._fetch_page = flaky
        rows, reachable = self.provider._fetch_pages(
            "BTCUSDT", "1m", "1m", 0, 2500 * BAR_MS
        )
        self.assertTrue(reachable)
        self.assertTrue(state["failed_once"])
        # Aralik kapali: [0, 2500*BAR_MS] 2501 mum icerir.
        self.assertEqual(len(rows), 2501)

    def test_permanently_missing_page_yields_no_rows(self):
        """Delikli sonuc dondurmektense hic dondurmemek: onbellek bozulmasin."""
        pages = FakePages(fail_pages={1})
        rows, reachable = self._fetch(pages, 0, 2500 * BAR_MS)
        self.assertEqual(rows, [])
        # Diger sayfalar geldi: saglayiciya ULASILIYOR, KuCoin yedegi
        # devreye girmemeli.
        self.assertTrue(reachable)

    def test_total_outage_is_reported_as_unreachable(self):
        pages = FakePages(fail_pages={0, 1, 2})
        rows, reachable = self._fetch(pages, 0, 2500 * BAR_MS)
        self.assertEqual(rows, [])
        self.assertFalse(reachable, "hicbir sayfa gelmedi ama ulasilabilir sayildi")

    def test_single_page_range_uses_sequential_path(self):
        pages = FakePages()
        rows, reachable = self._fetch(pages, 0, 500 * BAR_MS)
        self.assertTrue(reachable)
        self.assertEqual(len(pages.calls), 1)
        self.assertEqual(len(rows), 501)

    def test_empty_history_is_reachable_not_a_failure(self):
        """
        Sembolun listelenmesinden onceki tarihler bos doner. Bu gecerli bir
        cevaptir; KuCoin yedegini tetiklememeli (yedek, istenen aralikla
        ilgisi olmayan mumlari o araligin verisi sanip onbellege yazardi).
        """
        pages = FakePages(history_start_ms=10_000 * BAR_MS)
        rows, reachable = self._fetch(pages, 0, 2500 * BAR_MS)
        self.assertEqual(rows, [])
        self.assertTrue(reachable)

    def test_month_timeframe_falls_back_to_sequential(self):
        """Ay uzunlugu sabit olmadigi icin sayfa sinirlari hesaplanamaz."""
        self.assertNotIn("1M", binance_module.INTERVAL_MS)

        calls: list[dict] = []

        def one_short_page(params):
            calls.append(params)
            return [_kline(params["startTime"])]

        self.provider._fetch_page = one_short_page
        rows, reachable = self.provider._fetch_pages(
            "BTCUSDT", "1M", "1mo", 0, 100 * 30 * 86_400_000
        )
        self.assertTrue(reachable)
        self.assertEqual(len(calls), 1, "sirali yol tek kisa sayfada durmali")
        self.assertEqual(len(rows), 1)


class TestFetchOhlcvFrame(unittest.TestCase):
    def setUp(self) -> None:
        self.provider = BinanceProvider()
        binance_module._preferred_endpoint = binance_module.KLINE_ENDPOINTS[0]

    def test_frame_is_sorted_and_deduped(self):
        # Sayfalar paralel geldigi icin sirasiz ve sinirlarda ust uste binebilir.
        def out_of_order(params):
            base = params["startTime"]
            return [_kline(base + 2 * BAR_MS), _kline(base), _kline(base + BAR_MS)]

        self.provider._fetch_page = out_of_order
        from datetime import datetime

        df = self.provider.fetch_ohlcv(
            "BTCUSDT", "1m", datetime(2024, 1, 1), datetime(2024, 1, 1, 0, 10)
        )
        self.assertTrue(df["timestamp"].is_monotonic_increasing)
        self.assertFalse(df["timestamp"].duplicated().any())
        self.assertEqual(list(df.columns), ["timestamp", "open", "high", "low", "close", "volume"])

    def test_unsupported_timeframe_raises(self):
        from datetime import datetime

        with self.assertRaises(ValueError):
            self.provider.fetch_ohlcv(
                "BTCUSDT", "3s", datetime(2024, 1, 1), datetime(2024, 1, 2)
            )


if __name__ == "__main__":
    unittest.main()
