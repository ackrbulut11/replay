"""
Alarm motoru birim testleri (unittest).

Alarmlar kullanıcıya bağlı olarak veritabanında saklandığı için testler
geçici, bellek içi bir SQLite veritabanı kullanır.
"""

import unittest
from datetime import timedelta

import pandas as pd

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.alerts.engine import AlertEngine
from app.database.models import Alert
from app.utils.time import utc_now
from app.alerts.models import (
    AlertCondition,
    AlertCreateRequest,
    AlertStatus,
    AlertTargetType,
    AlertUpdateRequest,
)
from app.database.models import User
from app.database.postgres import Base


class FakeLoader:
    """Sabit bir OHLCV serisi donduren sahte loader.

    Alarm motoru artik gosterge degerlerini kendisi hesapliyor; testler bunun
    icin gercek saglayiciya cikmadan kontrollu bir seri veriyor.
    """

    def __init__(self, closes, timeframes=("1d",)):
        self.closes = list(closes)
        self.timeframes = set(timeframes)
        self.calls = []

    def load_data(self, provider_name, symbol, timeframe, start_time, end_time):
        self.calls.append((provider_name, symbol.upper(), timeframe))
        if timeframe not in self.timeframes:
            return pd.DataFrame()
        n = len(self.closes)
        return pd.DataFrame({
            "timestamp": pd.date_range(start="2024-01-01", periods=n, freq="1D"),
            "open": self.closes,
            "high": [c + 1 for c in self.closes],
            "low": [c - 1 for c in self.closes],
            "close": self.closes,
            "volume": [1000] * n,
        })


def flat_then(value, n=300):
    """n bar sabit `value`; gosterge isinmasini doldurmak icin."""
    return [float(value)] * n


def _price_alert(threshold: float = 70000.0) -> AlertCreateRequest:
    return AlertCreateRequest(
        symbol="BTCUSDT",
        provider="binance",
        target_type=AlertTargetType.PRICE,
        condition=AlertCondition.RISES_ABOVE,
        threshold_value=threshold,
        note="Direnc alarmi",
    )


class TestAlerts(unittest.TestCase):
    def setUp(self):
        self.db_engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.db_engine)
        self.db = sessionmaker(bind=self.db_engine)()

        self.alice = User(id="user-alice", email="alice@example.com", name="Alice")
        self.bob = User(id="user-bob", email="bob@example.com", name="Bob")
        self.db.add_all([self.alice, self.bob])
        self.db.commit()

        self.engine = AlertEngine()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(bind=self.db_engine)

    def test_alert_crud(self):
        alert = self.engine.create_alert(self.db, _price_alert(), user_id=self.alice.id)
        self.assertEqual(alert["symbol"], "BTCUSDT")
        self.assertEqual(alert["threshold_value"], 70000.0)
        self.assertEqual(alert["status"], "ACTIVE")

        alerts = self.engine.list_alerts(self.db, self.alice.id, symbol="BTCUSDT")
        self.assertEqual(len(alerts), 1)
        self.assertEqual(alerts[0]["id"], alert["id"])

        updated = self.engine.update_alert(
            self.db, alert["id"], AlertUpdateRequest(status=AlertStatus.DISABLED), self.alice.id
        )
        self.assertEqual(updated["status"], "DISABLED")

        self.assertTrue(self.engine.delete_alert(self.db, alert["id"], self.alice.id))
        self.assertEqual(self.engine.list_alerts(self.db, self.alice.id), [])

    def test_alert_is_isolated_per_user(self):
        """Bir kullanıcı başkasının alarmına hiçbir işlemle erişememeli."""
        alert = self.engine.create_alert(self.db, _price_alert(), user_id=self.alice.id)
        alert_id = alert["id"]

        self.assertEqual(self.engine.list_alerts(self.db, self.bob.id), [])
        self.assertIsNone(self.engine.get_alert(self.db, alert_id, self.bob.id))
        self.assertIsNone(
            self.engine.update_alert(
                self.db, alert_id, AlertUpdateRequest(threshold_value=1.0), self.bob.id
            )
        )
        self.assertFalse(self.engine.delete_alert(self.db, alert_id, self.bob.id))

        # Alice'in alarmi bozulmadan duruyor
        still_there = self.engine.get_alert(self.db, alert_id, self.alice.id)
        self.assertIsNotNone(still_there)
        self.assertEqual(still_there["threshold_value"], 70000.0)

    def test_check_only_evaluates_own_alerts(self):
        """check_alerts baskasinin alarmini tetiklememeli."""
        self.engine.create_alert(self.db, _price_alert(65000.0), user_id=self.alice.id)

        # Bob ayni sembolu kontrol ediyor; Alice'in alarmi tetiklenmemeli
        loader = FakeLoader(flat_then(66000.0))
        triggered_for_bob = self.engine.check_alerts(
            self.db, symbol="BTCUSDT", provider="binance", user_id=self.bob.id, loader=loader
        )
        self.assertEqual(triggered_for_bob, [])

        triggered_for_alice = self.engine.check_alerts(
            self.db, symbol="BTCUSDT", provider="binance", user_id=self.alice.id, loader=loader
        )
        self.assertEqual(len(triggered_for_alice), 1)
        self.assertEqual(triggered_for_alice[0]["status"], "TRIGGERED")

    def test_check_trigger_price_and_indicator(self):
        self.engine.create_alert(self.db, _price_alert(65000.0), user_id=self.alice.id)
        self.engine.create_alert(
            self.db,
            AlertCreateRequest(
                symbol="BTCUSDT",
                provider="binance",
                target_type=AlertTargetType.RSI,
                indicator_period=14,
                condition=AlertCondition.FALLS_BELOW,
                threshold_value=30.0,
            ),
            user_id=self.alice.id,
        )

        # Uzun sureli dusus: RSI 30'un altina iner, fiyat da 65000 esigini asar.
        closes = [80000.0] * 200 + [80000.0 - i * 100 for i in range(1, 60)]
        triggered = self.engine.check_alerts(
            self.db,
            symbol="BTCUSDT",
            provider="binance",
            user_id=self.alice.id,
            loader=FakeLoader(closes),
        )

        self.assertEqual(len(triggered), 2)
        for t in triggered:
            self.assertEqual(t["status"], "TRIGGERED")

    def test_trigger_flag_does_not_leak_between_alerts(self):
        """
        Tetiklenme bayragi alarmlar arasinda sizmamali.

        Onceki surumde `is_triggered` dongu icinde sifirlanmadigi icin
        tetiklenen bir alarmdan sonraki alarm da yanlislikla tetikleniyordu.
        """
        # 1. alarm kesin tetiklenir (fiyat 66000 >= 65000)
        self.engine.create_alert(self.db, _price_alert(65000.0), user_id=self.alice.id)
        # 2. alarm kesinlikle tetiklenmemeli (fiyat 66000, esik 99999)
        self.engine.create_alert(self.db, _price_alert(99999.0), user_id=self.alice.id)

        triggered = self.engine.check_alerts(
            self.db, symbol="BTCUSDT", provider="binance", user_id=self.alice.id,
            loader=FakeLoader(flat_then(66000.0)),
        )

        self.assertEqual(len(triggered), 1, "yalnizca esigi asan alarm tetiklenmeli")
        self.assertEqual(triggered[0]["threshold_value"], 65000.0)

        # Tetiklenmeyen alarm hala ACTIVE olmali
        active = self.engine.list_alerts(self.db, self.alice.id, status="ACTIVE")
        self.assertEqual(len(active), 1)
        self.assertEqual(active[0]["threshold_value"], 99999.0)


class _AlertTestBase(unittest.TestCase):
    def setUp(self):
        self.db_engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        Base.metadata.create_all(bind=self.db_engine)
        self.db = sessionmaker(bind=self.db_engine)()
        self.db.add(User(id="u1", email="u1@example.com", name="U1"))
        self.db.commit()
        self.engine = AlertEngine()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(bind=self.db_engine)

    def check(self, closes, timeframes=("1d",)):
        return self.engine.check_alerts(
            self.db, symbol="BTCUSDT", provider="binance", user_id="u1",
            loader=FakeLoader(closes, timeframes),
        )


class TestIndicatorAlerts(_AlertTestBase):
    """Gosterge alarmlari sunucuda hesaplanip gercekten tetiklenmeli."""

    def create(self, **kwargs):
        payload = dict(
            symbol="BTCUSDT", provider="binance", timeframe="1d",
            condition=AlertCondition.RISES_ABOVE, threshold_value=0.0,
        )
        payload.update(kwargs)
        return self.engine.create_alert(self.db, AlertCreateRequest(**payload), user_id="u1")

    def test_rsi_alert_triggers_without_client_supplied_values(self):
        """Onceki surumde istemci deger gondermedigi icin bu alarm HIC tetiklenmiyordu."""
        self.create(
            target_type=AlertTargetType.RSI, indicator_period=14,
            condition=AlertCondition.RISES_ABOVE, threshold_value=60.0,
        )
        rising = [100.0] * 100 + [100.0 + i for i in range(1, 60)]
        triggered = self.check(rising)
        self.assertEqual(len(triggered), 1)
        self.assertGreater(triggered[0]["last_value"], 60.0)

    def test_ema_alert_triggers(self):
        self.create(
            target_type=AlertTargetType.EMA, indicator_period=20,
            condition=AlertCondition.RISES_ABOVE, threshold_value=50.0,
        )
        self.assertEqual(len(self.check(flat_then(100.0))), 1)

    def test_percent_change_fall_alert(self):
        self.create(
            target_type=AlertTargetType.PERCENT_CHANGE,
            condition=AlertCondition.FALLS_BELOW, threshold_value=5.0,
        )
        self.assertEqual(len(self.check([100.0] * 50 + [90.0])), 1)

    def test_percent_change_below_threshold_does_not_trigger(self):
        self.create(
            target_type=AlertTargetType.PERCENT_CHANGE,
            condition=AlertCondition.FALLS_BELOW, threshold_value=5.0,
        )
        self.assertEqual(self.check([100.0] * 50 + [99.0]), [])

    def test_alert_is_skipped_when_data_unavailable(self):
        """Veri yoksa alarm tetiklenmez; istemcinin gonderdigi fiyata dusulmez."""
        self.create(
            target_type=AlertTargetType.PRICE,
            condition=AlertCondition.RISES_ABOVE, threshold_value=1.0,
        )
        self.assertEqual(self.check(flat_then(100.0), timeframes=("1h",)), [])

    def test_data_is_loaded_once_per_timeframe(self):
        self.create(target_type=AlertTargetType.PRICE, timeframe="1d", threshold_value=999999.0)
        self.create(target_type=AlertTargetType.PRICE, timeframe="1d", threshold_value=999998.0)
        self.create(target_type=AlertTargetType.PRICE, timeframe="1h", threshold_value=999997.0)

        loader = FakeLoader(flat_then(100.0), timeframes=("1d", "1h"))
        self.engine.check_alerts(
            self.db, symbol="BTCUSDT", provider="binance", user_id="u1", loader=loader
        )
        self.assertEqual(len(loader.calls), 2, f"dilim basina bir yukleme beklenirdi: {loader.calls}")

    def test_other_providers_alerts_are_not_checked(self):
        self.create(target_type=AlertTargetType.PRICE, provider="bist", threshold_value=1.0)
        self.assertEqual(self.check(flat_then(100.0)), [])


class TestEmaCross(_AlertTestBase):
    """EMA kesisimi bir DURUM degil, gercek bir kesisim olmali."""

    def create_cross(self, condition=AlertCondition.RISES_ABOVE):
        return self.engine.create_alert(self.db, AlertCreateRequest(
            symbol="BTCUSDT", provider="binance", timeframe="1d",
            target_type=AlertTargetType.EMA_CROSS,
            indicator_period_fast=5, indicator_period_slow=20,
            condition=condition, threshold_value=0.0,
        ), user_id="u1")

    def test_already_above_does_not_trigger(self):
        """Kesisim coktan olmus: alarm kurulur kurulmaz tetiklenmemeli."""
        self.create_cross()
        rising = [100.0 + i for i in range(200)]
        self.assertEqual(self.check(rising), [])

    def test_actual_golden_cross_triggers(self):
        """Son barda fast, slow'un uzerine gecerse tetiklenmeli."""
        self.create_cross()
        # Dusus boyunca fast < slow; son bardaki siçrama kesisimi tam orada yapar.
        falling = [400.0 - i for i in range(150)]
        triggered = self.check(falling + [falling[-1] + 60.0])
        self.assertEqual(len(triggered), 1)
        self.assertGreater(triggered[0]["last_value"], 0.0)

    def test_death_cross_direction(self):
        self.create_cross(condition=AlertCondition.FALLS_BELOW)
        rising = [100.0 + i for i in range(150)]
        triggered = self.check(rising + [rising[-1] - 60.0])
        self.assertEqual(len(triggered), 1)
        self.assertLess(triggered[0]["last_value"], 0.0)

    def test_cross_one_bar_later_does_not_retrigger(self):
        """Kesisim gecmiste kaldiysa (son barda degil) tetiklenmez."""
        self.create_cross()
        falling = [400.0 - i for i in range(150)]
        crossed = falling + [falling[-1] + 60.0]
        # Kesisimden SONRAKI bir bar: fast zaten slow'un ustunde, kesisim yok.
        self.assertEqual(self.check(crossed + [crossed[-1] + 1.0]), [])


if __name__ == "__main__":
    unittest.main()


class TestOlusanMumKullanilmaz(unittest.TestCase):
    """Gosterge alarmlari KAPANMIS mumla degerlendirilir.

    Serinin son bari genellikle hala olusmakta olan mumdur: 1g'lik bir alarm
    saat 14:00'te bugunun yarim mumunu goruyordu. Gun icinde bir esik gecilip
    geri donse bile alarm tetikleniyor ve tetiklenme kalici oldugu icin geri
    alinamiyordu.
    """

    def setUp(self):
        self.alice = User(id="user-alice", email="alice@example.com", name="Alice")

    @staticmethod
    def _frame(last_open, periods=60, freq="D"):
        stamps = pd.date_range(end=last_open, periods=periods, freq=freq)
        close = [100.0 + i for i in range(periods)]
        return pd.DataFrame({
            "timestamp": stamps,
            "open": close,
            "high": [c + 1 for c in close],
            "low": [c - 1 for c in close],
            "close": close,
            "volume": [1.0] * periods,
        })

    def _alert(self, target_type="RSI", timeframe="1d"):
        row = Alert(
            user_id=self.alice.id, symbol="BTCUSDT", provider="binance",
            timeframe=timeframe, target_type=target_type,
            indicator_period=14, condition="rises_above", threshold_value=70.0,
            status="ACTIVE",
        )
        return row

    def test_kapanmamis_son_bar_gosterge_icin_atlanir(self):
        # Son mum bugun acilmis, henuz kapanmamis.
        now = utc_now()
        df = self._frame(last_open=now.replace(hour=0, minute=0, second=0, microsecond=0))
        engine = AlertEngine()
        last = engine._last_usable_index(self._alert(), df)
        self.assertEqual(last, len(df) - 2)

    def test_kapanmis_son_bar_kullanilir(self):
        # Son mum 3 gun once acilmis: coktan kapandi.
        df = self._frame(last_open=utc_now() - timedelta(days=3))
        engine = AlertEngine()
        last = engine._last_usable_index(self._alert(), df)
        self.assertEqual(last, len(df) - 1)

    def test_fiyat_alarmi_olusan_mumu_kullanir(self):
        # "BTC 100.000'i gecerse" diyen biri gun sonunu degil O ANI kastediyor.
        now = utc_now()
        df = self._frame(last_open=now.replace(hour=0, minute=0, second=0, microsecond=0))
        engine = AlertEngine()
        last = engine._last_usable_index(self._alert(target_type="price"), df)
        self.assertEqual(last, len(df) - 1)

    def test_bilinmeyen_dilimde_son_bara_dusulur(self):
        df = self._frame(last_open=utc_now())
        engine = AlertEngine()
        last = engine._last_usable_index(self._alert(timeframe="3h"), df)
        self.assertEqual(last, len(df) - 1)


class TestArkaPlanTaramasi(unittest.TestCase):
    """Alarmlar artik TUM kullanicilar ve TUM semboller icin arka planda taranir.

    Eskiden check_alerts yalnizca istemci sordugunda ve yalnizca O AN BAKILAN
    sembol icin calisiyordu: THYAO'ya kurulmus bir alarm, kullanici uygulamayi
    acip THYAO'ya bakmadigi surece hic tetiklenmiyordu.
    """

    def setUp(self):
        self.db_engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        Base.metadata.create_all(bind=self.db_engine)
        self.db = sessionmaker(bind=self.db_engine)()
        self.alice = User(id="user-alice", email="alice@example.com", name="Alice")
        self.bob = User(id="user-bob", email="bob@example.com", name="Bob")
        self.db.add_all([self.alice, self.bob])
        self.db.commit()
        self.engine = AlertEngine()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(bind=self.db_engine)

    def _add_alert(self, user_id, symbol, threshold, status="ACTIVE"):
        row = Alert(
            user_id=user_id, symbol=symbol, provider="binance", timeframe="1d",
            target_type="price", condition="rises_above",
            threshold_value=threshold, status=status,
        )
        self.db.add(row)
        self.db.commit()
        return row

    class _Loader:
        """Her sembol icin sabit fiyatli seri dondurur ve cagrilari sayar."""

        def __init__(self, prices):
            self.prices = prices
            self.calls = []

        def load_data(self, provider_name, symbol, timeframe, start_time, end_time):
            self.calls.append((provider_name, symbol, timeframe))
            price = self.prices.get(symbol)
            if price is None:
                raise RuntimeError("veri yok")
            stamps = pd.date_range(end=utc_now() - timedelta(days=1), periods=30, freq="D")
            return pd.DataFrame({
                "timestamp": stamps,
                "open": [price] * 30, "high": [price] * 30,
                "low": [price] * 30, "close": [price] * 30,
                "volume": [1.0] * 30,
            })

    def test_bakilmayan_sembolun_alarmi_da_tetiklenir(self):
        self._add_alert(self.alice.id, "THYAO", threshold=50.0)
        loader = self._Loader({"THYAO": 100.0})
        triggered = self.engine.check_all_active_alerts(self.db, loader)
        self.assertEqual(triggered, 1)
        self.assertEqual(self.db.query(Alert).first().status, "TRIGGERED")

    def test_esik_asilmadiysa_tetiklenmez(self):
        self._add_alert(self.alice.id, "THYAO", threshold=500.0)
        loader = self._Loader({"THYAO": 100.0})
        self.assertEqual(self.engine.check_all_active_alerts(self.db, loader), 0)
        self.assertEqual(self.db.query(Alert).first().status, "ACTIVE")

    def test_ayni_sembol_icin_veri_bir_kez_yuklenir(self):
        # Iki farkli kullanici ayni sembole alarm kurmus: tek istek yeter.
        self._add_alert(self.alice.id, "THYAO", threshold=50.0)
        self._add_alert(self.bob.id, "THYAO", threshold=60.0)
        loader = self._Loader({"THYAO": 100.0})
        self.engine.check_all_active_alerts(self.db, loader)
        self.assertEqual(len(loader.calls), 1)

    def test_bir_sembolun_hatasi_taramayi_durdurmaz(self):
        self._add_alert(self.alice.id, "BOZUK", threshold=50.0)
        self._add_alert(self.alice.id, "THYAO", threshold=50.0)
        loader = self._Loader({"THYAO": 100.0})  # BOZUK yok -> hata
        triggered = self.engine.check_all_active_alerts(self.db, loader)
        self.assertEqual(triggered, 1)

    def test_tetiklenmis_alarm_yeniden_degerlendirilmez(self):
        self._add_alert(self.alice.id, "THYAO", threshold=50.0, status="TRIGGERED")
        loader = self._Loader({"THYAO": 100.0})
        self.assertEqual(self.engine.check_all_active_alerts(self.db, loader), 0)
        # Veri bile yuklenmemeli.
        self.assertEqual(loader.calls, [])

    def test_hic_alarm_yoksa_saglayiciya_gidilmez(self):
        loader = self._Loader({})
        self.assertEqual(self.engine.check_all_active_alerts(self.db, loader), 0)
        self.assertEqual(loader.calls, [])
