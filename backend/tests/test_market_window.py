"""
Replay penceresi (DataLoader.get_window) unit testleri (unittest, pytest değil).

Buradaki asıl regresyon: `bars_before` MUM sayısıdır, takvim süresi değil.
`anchor - delta * bars_before` yalnızca 7/24 açık bir piyasada doğru; hafta sonu
ve seans saatleri olan piyasalarda aynı hesap istenen mumun küçük bir kısmını
getiriyordu (1g'de 500 istek -> 345 mum, 1s'de 500 -> ~145 mum).

Testler ağa çıkmaz: sahte bir sağlayıcı ve var olmayan bir önbellek yolu kullanılır.
"""

from __future__ import annotations

import unittest
from datetime import datetime, timedelta

import pandas as pd

from app.data.loader import DataLoader, calendar_stretch


class FakeProvider:
    """İstenen aralığı, verilen takvime göre üretilmiş mumlarla doldurur."""

    def __init__(self, weekdays_only: bool = False, history_start: datetime | None = None):
        self.weekdays_only = weekdays_only
        self.history_start = history_start
        self.calls = 0

    def fetch_ohlcv(self, symbol, timeframe, start_time, end_time):
        self.calls += 1
        if self.history_start and start_time < self.history_start:
            start_time = self.history_start

        rows = []
        cursor = start_time.replace(hour=0, minute=0, second=0, microsecond=0)
        while cursor <= end_time:
            if not (self.weekdays_only and cursor.weekday() >= 5):
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


def make_loader(provider: FakeProvider, provider_name: str) -> DataLoader:
    loader = DataLoader()
    loader.providers = {provider_name: provider}
    # Parquet önbelleğini devre dışı bırak: test yalnızca sağlayıcı yolunu ölçsün.
    loader._get_cache_path = lambda *args, **kwargs: "__yok__.parquet"
    return loader


class TestCalendarStretch(unittest.TestCase):
    def test_kripto_icin_pay_yok(self):
        self.assertEqual(calendar_stretch("binance", "1d"), 1.0)
        self.assertEqual(calendar_stretch("binance", "15m"), 1.0)

    def test_kapali_piyasalarda_pay_var(self):
        self.assertGreater(calendar_stretch("bist", "1d"), 1.0)
        self.assertGreater(calendar_stretch("forex", "1h"), 1.0)
        # Gün içi hisse en dar durum: seans saatleri + hafta sonu.
        self.assertGreater(calendar_stretch("nasdaq", "1h"), calendar_stretch("nasdaq", "1d"))


class TestGetWindow(unittest.TestCase):
    def test_kesintisiz_piyasada_istenen_sayi(self):
        loader = make_loader(FakeProvider(), "binance")
        anchor = datetime(2024, 1, 1)
        df = loader.get_window("binance", "TEST", "1d", anchor, bars_before=300, bars_after=100)

        self.assertEqual(int((df["timestamp"] <= anchor).sum()), 300)
        self.assertEqual(int((df["timestamp"] > anchor).sum()), 100)

    def test_hafta_sonu_kapali_piyasada_da_istenen_sayi(self):
        """Asıl regresyon: takvim payı olmadan 300 yerine ~215 mum dönüyordu."""
        loader = make_loader(FakeProvider(weekdays_only=True), "bist")
        anchor = datetime(2024, 1, 3)
        df = loader.get_window("bist", "TEST", "1d", anchor, bars_before=300, bars_after=100)

        self.assertEqual(int((df["timestamp"] <= anchor).sum()), 300)
        self.assertEqual(int((df["timestamp"] > anchor).sum()), 100)
        # Dönen mumların hepsi gerçekten iş günü olmalı (sahte takvim korunuyor).
        self.assertTrue(all(ts.weekday() < 5 for ts in df["timestamp"]))

    def test_capa_mumu_geride_sayilir(self):
        loader = make_loader(FakeProvider(), "binance")
        anchor = datetime(2024, 1, 1)
        df = loader.get_window("binance", "TEST", "1d", anchor, bars_before=10, bars_after=5)

        self.assertEqual(df["timestamp"].iloc[9], anchor)
        self.assertEqual(len(df), 15)

    def test_gecmis_bittiginde_eldekiyle_yetinir(self):
        """Sağlayıcının geçmişi bitmişse boşuna genişletme isteği atılmamalı."""
        provider = FakeProvider(history_start=datetime(2023, 12, 1))
        loader = make_loader(provider, "binance")
        anchor = datetime(2024, 1, 1)
        df = loader.get_window("binance", "TEST", "1d", anchor, bars_before=500, bars_after=10)

        self.assertEqual(df["timestamp"].min(), datetime(2023, 12, 1))
        self.assertEqual(provider.calls, 1)

    def test_ayni_istek_onbellekten_doner(self):
        provider = FakeProvider()
        loader = make_loader(provider, "binance")
        anchor = datetime(2024, 1, 1)

        first = loader.get_window("binance", "TEST", "1d", anchor, bars_before=50, bars_after=10)
        second = loader.get_window("binance", "TEST", "1d", anchor, bars_before=50, bars_after=10)

        self.assertEqual(provider.calls, 1)
        self.assertEqual(len(first), len(second))

    def test_capa_gecmisin_gerisindeyse_en_eski_muma_cekilir(self):
        """
        Replay konumu, sağlayıcının o zaman dilimindeki geçmişinden eskiyse
        (1g'de 2019'a kesip 15dk'ya geçmek) pencere boş dönüyordu ve kullanıcı
        "Veri Yüklenemedi" ekranında kalıyordu. Artık en eski muma çekilir.
        """
        history_start = datetime.now() - timedelta(days=40)
        loader = make_loader(FakeProvider(history_start=history_start), "binance")
        anchor = datetime(2019, 1, 1)

        df = loader.get_window("binance", "TEST", "1d", anchor, bars_before=300, bars_after=100)

        self.assertFalse(df.empty)
        # Pencerenin TAMAMI çapanın ilerisinde: istemci bunu "konum bu dilimde
        # yok, en eski muma taşındı" olarak okuyup uyarı gösterir.
        self.assertTrue(bool((df["timestamp"] > anchor).all()))
        self.assertEqual(df["timestamp"].min().date(), history_start.date())

    def test_veri_hic_yoksa_bos_doner(self):
        """Geri çekilme yolu, gerçek bir "veri yok" durumunu maskelememeli."""

        class BosProvider:
            def fetch_ohlcv(self, symbol, timeframe, start_time, end_time):
                return pd.DataFrame(
                    columns=["timestamp", "open", "high", "low", "close", "volume"]
                )

        loader = make_loader(BosProvider(), "binance")
        df = loader.get_window("binance", "TEST", "1d", datetime(2019, 1, 1))

        self.assertTrue(df.empty)

    def test_taban_1970_oncesine_inmez(self):
        """5000 haftalık ~96 yıl geriye düşüyordu; timestamp() orada patlıyor."""
        provider = FakeProvider()
        loader = make_loader(provider, "binance")
        anchor = datetime(1990, 1, 1)

        df = loader.get_window("binance", "TEST", "1w", anchor, bars_before=5000, bars_after=10)
        self.assertGreaterEqual(df["timestamp"].min(), datetime(1971, 1, 1))


if __name__ == "__main__":
    unittest.main()
