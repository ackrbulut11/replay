"""
Kalıcı pencere deposu (DataLoader._read/_write_window_store) ve Twelve Data
sayfalama/throttle bütçesi testleri (unittest, pytest değil).

Buradaki asıl regresyon replay'de zaman dilimi değiştirmenin maliyetiydi:
yüksek dilimler ana parquet'ten anında geliyor, düşük dilimler ise (Yahoo'nun
intraday tavanının gerisi) Twelve Data'ya düşüyor ve o kaynak istek başına
saniyeler sürüyordu. Depo olmadan aynı pencere her süreç yeniden başladığında
baştan indiriliyordu.

Testler ağa çıkmaz: sahte sağlayıcı ve geçici bir depo dizini kullanılır.
"""

from __future__ import annotations

import os
import tempfile
import unittest
from datetime import datetime, timedelta

import pandas as pd

from app.data.loader import DataLoader
from app.data.providers import twelvedata


class CountingProvider:
    """Çağrı sayan sahte sağlayıcı: günlük mumlarla istenen aralığı doldurur."""

    def __init__(self, history_start: datetime | None = None):
        self.history_start = history_start
        self.calls = 0

    def fetch_ohlcv(self, symbol, timeframe, start_time, end_time, **kwargs):
        self.calls += 1
        if self.history_start and start_time < self.history_start:
            start_time = self.history_start

        rows = []
        cursor = start_time.replace(hour=0, minute=0, second=0, microsecond=0)
        while cursor <= end_time:
            rows.append(
                {
                    "timestamp": cursor,
                    "open": 1.0,
                    "high": 2.0,
                    "low": 0.5,
                    "close": 1.5,
                    "volume": 10.0,
                }
            )
            cursor += timedelta(days=1)
        return pd.DataFrame(rows)


class StoreTestCase(unittest.TestCase):
    """Deposu geçici dizine bakan, ana parquet önbelleği kapalı bir loader."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = self._tmp.name
        self.provider = CountingProvider()
        self.loader = DataLoader()
        self.loader.providers = {"binance": self.provider}
        # Ana parquet önbelleği geçici dizine bakar; yan depo `_window_store_path`
        # tarafından bunun yanındaki `windows/` alt dizininde türetilir.
        self.loader._get_cache_path = lambda p, s, tf: os.path.join(
            self.root, p.lower(), f"{s.upper()}_{tf}.parquet"
        )
        self.addCleanup(self._tmp.cleanup)

    def _clear_ram_caches(self):
        """Süreç yeniden başlamış gibi: yalnızca disk deposu kalsın."""
        self.loader._window_cache.clear()
        self.loader._mem_cache.clear()


class TestWindowStoreRoundTrip(StoreTestCase):
    def test_ikinci_istek_saglayiciya_gitmez(self):
        """Depo, süreç içi LRU boşalsa bile pencereyi karşılamalı."""
        anchor = datetime(2024, 3, 1)
        first = self.loader.get_window("binance", "TEST", "1d", anchor, 50, 10)
        self.assertFalse(first.empty)
        self.assertEqual(self.provider.calls, 1)

        self._clear_ram_caches()

        second = self.loader.get_window("binance", "TEST", "1d", anchor, 50, 10)
        self.assertEqual(
            self.provider.calls, 1, "depo isabet etmeliydi, sağlayıcı yeniden çağrıldı"
        )
        pd.testing.assert_frame_equal(
            first.reset_index(drop=True), second.reset_index(drop=True)
        )

    def test_kaymis_capa_da_depodan_karsilanir(self):
        """Replay ilerledikçe çapa kayar; depo aralık farkındalıklı olduğu için
        tam ölçü eşleşmesi gerektiren RAM LRU'nun aksine yine isabet etmeli."""
        self.loader.get_window("binance", "TEST", "1d", datetime(2024, 3, 1), 50, 10)
        self.assertEqual(self.provider.calls, 1)
        self._clear_ram_caches()

        shifted = self.loader.get_window(
            "binance", "TEST", "1d", datetime(2024, 3, 3), 50, 5
        )
        self.assertFalse(shifted.empty)
        self.assertEqual(self.provider.calls, 1)

    def test_depoda_olmayan_capa_saglayiciya_gider(self):
        self.loader.get_window("binance", "TEST", "1d", datetime(2024, 3, 1), 50, 10)
        self._clear_ram_caches()

        # Çok uzak bir çapa: depodaki aralığın dışında.
        self.loader.get_window("binance", "TEST", "1d", datetime(2019, 1, 1), 50, 10)
        self.assertEqual(self.provider.calls, 2)


class TestWindowStoreGaps(StoreTestCase):
    def test_iki_aralik_arasindaki_bosluk_veri_sayilmaz(self):
        """
        Deponun tek dosyada birden çok aralık tutması, aradaki boşluğun "veri
        var" sanılmasına yol açmamalı. Bitişiklik varsayımı tam olarak bu yüzden
        yok: manifest hangi aralıkların gerçekten indirildiğini söyler.
        """
        self.loader.get_window("binance", "TEST", "1d", datetime(2024, 3, 1), 30, 5)
        self.loader.get_window("binance", "TEST", "1d", datetime(2019, 1, 1), 30, 5)
        self._clear_ram_caches()
        calls_before = self.provider.calls

        # Çapa iki aralığın ARASINDA: depo bunu karşılayamaz, sağlayıcıya gitmeli.
        self.loader.get_window("binance", "TEST", "1d", datetime(2021, 6, 1), 30, 5)
        self.assertGreater(
            self.provider.calls,
            calls_before,
            "boşluktaki çapa depodan karşılanmamalıydı",
        )

    def test_merge_ranges_bitisikleri_birlestirir(self):
        loader = self.loader
        ranges = [
            {"start": datetime(2024, 1, 1), "end": datetime(2024, 1, 10), "used": 1.0},
            # Bir mum (1 gün) boşluk: aynı sürekli geçmişin devamı sayılmalı.
            {"start": datetime(2024, 1, 11), "end": datetime(2024, 1, 20), "used": 2.0},
            {"start": datetime(2023, 1, 1), "end": datetime(2023, 1, 5), "used": 3.0},
        ]
        merged = loader._merge_ranges(ranges, "1d")
        self.assertEqual(len(merged), 2)
        self.assertEqual(merged[0]["start"], datetime(2023, 1, 1))
        self.assertEqual(merged[1]["start"], datetime(2024, 1, 1))
        self.assertEqual(merged[1]["end"], datetime(2024, 1, 20))
        # Birleşen aralığın damgası en tazesi olmalı: budama onu erken atmasın.
        self.assertEqual(merged[1]["used"], 2.0)

    def test_bozuk_manifest_veri_yok_sayilir(self):
        """Manifest okunamıyorsa depo sessizce devre dışı kalmalı, patlamamalı."""
        anchor = datetime(2024, 3, 1)
        self.loader.get_window("binance", "TEST", "1d", anchor, 30, 5)
        store = self.loader._window_store_path("binance", "TEST", "1d")
        with open(self.loader._window_store_meta_path(store), "w", encoding="utf-8") as fh:
            fh.write("{bozuk json")
        self._clear_ram_caches()

        result = self.loader._read_window_store(
            "binance", "TEST", "1d", anchor, 30, 5, anchor - timedelta(days=60)
        )
        self.assertIsNone(result)


class TestWindowStoreRetention(StoreTestCase):
    def test_satir_tavani_asilmaz(self):
        """RULES.md #24: depo sınırsız büyümemeli."""
        from app.data import loader as loader_module

        original = loader_module.WINDOW_STORE_ROW_LIMIT.get("1d")
        loader_module.WINDOW_STORE_ROW_LIMIT["1d"] = 120
        try:
            for year in (2019, 2020, 2021, 2022, 2023, 2024):
                self.loader.get_window(
                    "binance", "TEST", "1d", datetime(year, 6, 1), 60, 10
                )
                self._clear_ram_caches()

            store = self.loader._window_store_path("binance", "TEST", "1d")
            rows = len(pd.read_parquet(store))
            self.assertLessEqual(rows, 120, "depo retention tavanını aştı")
            # Manifest ile dosya tutarlı kalmalı: atılan aralık manifestte de yok.
            ranges = self.loader._read_window_store_meta(store)
            self.assertGreaterEqual(len(ranges), 1)
        finally:
            if original is None:
                loader_module.WINDOW_STORE_ROW_LIMIT.pop("1d", None)
            else:
                loader_module.WINDOW_STORE_ROW_LIMIT["1d"] = original

    def test_en_son_kullanilan_aralik_korunur(self):
        """Budama en ESKİ aralığı değil en az KULLANILANI atmalı: replay'de
        2019'da çalışan biri için en eski aralık tam da tutulması gerekendir."""
        from app.data import loader as loader_module

        original = loader_module.WINDOW_STORE_ROW_LIMIT.get("1d")
        loader_module.WINDOW_STORE_ROW_LIMIT["1d"] = 150
        try:
            old_anchor = datetime(2019, 6, 1)
            self.loader.get_window("binance", "TEST", "1d", old_anchor, 60, 10)
            self._clear_ram_caches()
            # Eski aralığı "kullan": damgası tazelensin.
            store = self.loader._window_store_path("binance", "TEST", "1d")
            ranges = self.loader._read_window_store_meta(store)
            for r in ranges:
                r["used"] = 0.0
            self.loader._write_window_store_meta(store, ranges)

            self.loader.get_window("binance", "TEST", "1d", old_anchor, 60, 10)
            self._clear_ram_caches()

            # Sonra başka aralıklar ekle; tavan zorlanacak.
            for year in (2021, 2022, 2023):
                self.loader.get_window(
                    "binance", "TEST", "1d", datetime(year, 6, 1), 60, 10
                )
                self._clear_ram_caches()

            rows = len(pd.read_parquet(store))
            self.assertLessEqual(rows, 150)
        finally:
            if original is None:
                loader_module.WINDOW_STORE_ROW_LIMIT.pop("1d", None)
            else:
                loader_module.WINDOW_STORE_ROW_LIMIT["1d"] = original


class TestTwelveDataPaging(unittest.TestCase):
    def test_page_size_istenen_araliga_gore_kuculur(self):
        """`outputsize` eskiden koşulsuz 5000'di; fazlası indirilip atılıyordu."""
        small = twelvedata._page_size(
            "15min", datetime(2024, 1, 1), datetime(2024, 1, 2), "stock"
        )
        self.assertLess(small, twelvedata.MAX_OUTPUTSIZE)
        self.assertGreaterEqual(small, twelvedata.MIN_OUTPUTSIZE)

    def test_page_size_genis_aralikta_tavanda_kalir(self):
        wide = twelvedata._page_size(
            "15min", datetime(2020, 1, 1), datetime(2024, 1, 1), "stock"
        )
        self.assertEqual(wide, twelvedata.MAX_OUTPUTSIZE)

    def test_page_size_taban_altina_inmez(self):
        """Küçük sayfa daha çok SAYFA, yani daha çok throttle slotu demek."""
        tiny = twelvedata._page_size(
            "1day", datetime(2024, 1, 1), datetime(2024, 1, 2), "stock"
        )
        self.assertEqual(tiny, twelvedata.MIN_OUTPUTSIZE)

    def test_bilinmeyen_interval_tavana_duser(self):
        self.assertEqual(
            twelvedata._page_size(
                "7min", datetime(2024, 1, 1), datetime(2024, 1, 2), "stock"
            ),
            twelvedata.MAX_OUTPUTSIZE,
        )

    def test_hisse_gun_ici_forexten_az_mum_ister(self):
        """
        Asıl regresyon: takvim süresinden yapılan ham hesap kapalı piyasada mum
        sayısını abartıyor ve `outputsize` daima tavana yapışıyordu. NASDAQ
        seansı 6,5/24 saat ve 5/7 gün; forex ise gün içinde kesintisiz.
        """
        start, end = datetime(2024, 1, 1), datetime(2024, 2, 1)
        stock = twelvedata._page_size("5min", start, end, "stock")
        forex = twelvedata._page_size("5min", start, end, "forex")
        self.assertLess(stock, forex)
        # Ham takvim hesabı (yoğunluk düzeltmesiz) tavana dayanırdı.
        self.assertLess(stock, twelvedata.MAX_OUTPUTSIZE)

    def test_pay_gercek_mum_sayisinin_altina_inmez(self):
        """Kestirim cömert olmalı: eksik tahmin fazladan bir sayfa demek."""
        start, end = datetime(2024, 1, 1), datetime(2024, 2, 1)
        # 31 takvim gününde ~78 adet 5dk mumu/gün x ~22 işlem günü ≈ 1716.
        self.assertGreater(twelvedata._page_size("5min", start, end, "stock"), 1716)


class TestTwelveDataThrottle(unittest.TestCase):
    def setUp(self):
        self._saved = twelvedata._last_request_at
        self.addCleanup(self._restore)

    def _restore(self):
        twelvedata._last_request_at = self._saved

    def test_bos_throttle_beklemez(self):
        twelvedata._last_request_at = 0.0
        waited = twelvedata._throttle(max_wait=0.0)
        self.assertEqual(waited, 0.0)

    def test_butce_yetmezse_slot_ayrilmaz(self):
        """Bütçe tavanı: ön plandaki bir istek 8 sn'lik kuyruğa takılmamalı."""
        import time as _time

        twelvedata._last_request_at = _time.monotonic()
        before = twelvedata._last_request_at

        result = twelvedata._throttle(max_wait=0.1)
        self.assertIsNone(result, "bütçe aşılmasına rağmen slot ayrıldı")
        self.assertEqual(
            twelvedata._last_request_at,
            before,
            "vazgeçilen istek throttle slotunu tüketmemeli",
        )


if __name__ == "__main__":
    unittest.main()
