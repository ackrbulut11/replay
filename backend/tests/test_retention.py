"""
Olay tablolarinin budanmasi (unittest).

RULES.md §24-27 ham veri icin 'sinirsiz biriktirmek yasak' diyor; ayni gerekce
telemetri tablolari icin de gecerliydi ama orada hicbir sinir yoktu.
/api/analytics/events kimlik dogrulamasi gerektirmiyor ve IP basina dakikada
30 kayit sinirlariyla tek bir IP gunde 43.200 satir ekleyebiliyordu.
"""

from __future__ import annotations

import unittest
import unittest.mock
from datetime import datetime, timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.models import DrawingUsageEvent, User, UserEvent, generate_uuid
from app.database.postgres import Base
from app.database import retention


class RetentionTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        Base.metadata.create_all(bind=self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.user = User(id="user-1", email="a@example.com", name="A")
        self.db.add(self.user)
        self.db.commit()

    def tearDown(self) -> None:
        self.db.close()

    def _add_user_events(self, count: int) -> None:
        base = datetime(2024, 1, 1)
        for i in range(count):
            self.db.add(
                UserEvent(
                    id=generate_uuid(),
                    user_id=self.user.id,
                    event_type="frontend_error",
                    level="error",
                    created_at=base + timedelta(minutes=i),
                )
            )
        self.db.commit()

    def _add_drawing_events(self, count: int) -> None:
        base = datetime(2024, 1, 1)
        for i in range(count):
            self.db.add(
                DrawingUsageEvent(
                    id=generate_uuid(),
                    user_id=self.user.id,
                    symbol="BTCUSDT",
                    provider="binance",
                    tool="trendline",
                    created_at=base + timedelta(minutes=i),
                )
            )
        self.db.commit()


class TestPruneEventTables(RetentionTestCase):
    def test_sinirin_altindaysa_hicbir_sey_silinmez(self):
        self._add_user_events(5)
        with unittest.mock.patch.object(retention, "MAX_USER_EVENTS", 10):
            result = retention.prune_event_tables(self.db)
        self.assertEqual(result["user_events"], 0)
        self.assertEqual(self.db.query(UserEvent).count(), 5)

    def test_sinir_asilinca_en_eskiler_silinir(self):
        self._add_user_events(20)
        with unittest.mock.patch.object(retention, "MAX_USER_EVENTS", 5):
            result = retention.prune_event_tables(self.db)
        self.assertEqual(result["user_events"], 15)
        self.assertEqual(self.db.query(UserEvent).count(), 5)

    def test_kalanlar_en_YENI_kayitlardir(self):
        self._add_user_events(20)
        with unittest.mock.patch.object(retention, "MAX_USER_EVENTS", 5):
            retention.prune_event_tables(self.db)
        remaining = self.db.query(UserEvent).order_by(UserEvent.created_at).all()
        # 20 kayit dakika dakika eklendi; en yeni 5'i kalmali.
        self.assertEqual(remaining[0].created_at, datetime(2024, 1, 1, 0, 15))
        self.assertEqual(remaining[-1].created_at, datetime(2024, 1, 1, 0, 19))

    def test_cizim_tablosu_da_budanir(self):
        self._add_drawing_events(12)
        with unittest.mock.patch.object(retention, "MAX_DRAWING_USAGE_EVENTS", 4):
            result = retention.prune_event_tables(self.db)
        self.assertEqual(result["drawing_usage_events"], 8)
        self.assertEqual(self.db.query(DrawingUsageEvent).count(), 4)

    def test_bos_tablo_patlamaz(self):
        result = retention.prune_event_tables(self.db)
        self.assertEqual(result, {"user_events": 0, "drawing_usage_events": 0})


if __name__ == "__main__":
    unittest.main()
