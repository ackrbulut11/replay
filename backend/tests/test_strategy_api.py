"""
Strateji motoru birim testleri (unittest).

Stratejiler kullanıcıya bağlı olarak veritabanında saklandığı için testler
geçici, bellek içi bir SQLite veritabanı kullanır; gerçek uygulama
veritabanına dokunulmaz.
"""

import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.models import User
from app.database.postgres import Base
from app.engines.strategy_engine import StrategyEngine
from app.indicators.registry import IndicatorRegistry
from app.rules.strategy_models import (
    StrategyCreateRequest,
    StrategyUpdateRequest,
)


def _make_payload(name: str = "Unittest Strategy") -> StrategyCreateRequest:
    return StrategyCreateRequest(
        name=name,
        description="Created during unittest execution",
        parameters=[
            {"name": "fast_ema", "type": "int", "default": 10, "min": 2, "max": 50}
        ],
        entry_rules={
            "logic": "AND",
            "conditions": [
                {
                    "left": {"type": "indicator", "name": "EMA", "period": "$fast_ema"},
                    "operator": ">",
                    "right": {"type": "indicator", "name": "EMA", "period": 20},
                }
            ],
        },
        exit_rules={"logic": "AND", "conditions": []},
        timeframe_filters=[],
    )


class TestStrategyAPI(unittest.TestCase):
    def setUp(self):
        # Bellek içi SQLite; StaticPool sayesinde tüm oturumlar aynı veritabanını görür.
        self.db_engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.db_engine)
        self.Session = sessionmaker(bind=self.db_engine)
        self.db = self.Session()

        self.alice = User(id="user-alice", email="alice@example.com", name="Alice")
        self.bob = User(id="user-bob", email="bob@example.com", name="Bob")
        self.db.add_all([self.alice, self.bob])
        self.db.commit()

        self.engine = StrategyEngine()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(bind=self.db_engine)

    def test_list_indicators(self):
        indicators = IndicatorRegistry.list_indicators()
        self.assertIsInstance(indicators, list)
        self.assertGreater(len(indicators), 0)

    def test_strategy_crud_flow(self):
        # 1. Oluştur
        created = self.engine.create_strategy(self.db, _make_payload(), user_id=self.alice.id)
        strat_id = created["id"]
        self.assertEqual(created["name"], "Unittest Strategy")
        self.assertEqual(created["user_id"], self.alice.id)

        # 2. Listele
        strategies = self.engine.list_strategies(self.db, self.alice.id)
        self.assertTrue(any(s["id"] == strat_id for s in strategies))

        # 3. Getir
        fetched = self.engine.get_strategy(self.db, strat_id, self.alice.id)
        self.assertIsNotNone(fetched)
        self.assertEqual(fetched["id"], strat_id)
        # Kural ağacı korunmuş olmalı
        self.assertEqual(len(fetched["entry_rules"]["conditions"]), 1)

        # 4. Güncelle
        updated = self.engine.update_strategy(
            self.db, strat_id, StrategyUpdateRequest(name="Updated Unittest Strategy"), self.alice.id
        )
        self.assertIsNotNone(updated)
        self.assertEqual(updated["name"], "Updated Unittest Strategy")
        self.assertEqual(updated["version"], 2)

        # 5. Sil
        self.assertTrue(self.engine.delete_strategy(self.db, strat_id, self.alice.id))

        # 6. Silindiğini doğrula
        self.assertIsNone(self.engine.get_strategy(self.db, strat_id, self.alice.id))

    def test_strategy_is_isolated_per_user(self):
        """Bir kullanıcı başkasının stratejisine hiçbir işlemle erişememeli."""
        alice_strat = self.engine.create_strategy(
            self.db, _make_payload("Alice Stratejisi"), user_id=self.alice.id
        )
        strat_id = alice_strat["id"]

        # Bob listede göremez
        self.assertEqual(self.engine.list_strategies(self.db, self.bob.id), [])

        # Bob ID'yi bilse bile okuyamaz
        self.assertIsNone(self.engine.get_strategy(self.db, strat_id, self.bob.id))

        # Bob güncelleyemez
        self.assertIsNone(
            self.engine.update_strategy(
                self.db, strat_id, StrategyUpdateRequest(name="Ele geçirildi"), self.bob.id
            )
        )

        # Bob silemez
        self.assertFalse(self.engine.delete_strategy(self.db, strat_id, self.bob.id))

        # Alice'in stratejisi bozulmadan duruyor
        still_there = self.engine.get_strategy(self.db, strat_id, self.alice.id)
        self.assertIsNotNone(still_there)
        self.assertEqual(still_there["name"], "Alice Stratejisi")

    def test_create_ignores_client_supplied_user_id(self):
        """İstek gövdesindeki user_id sahiplik belirleyemez (taklit engellenir)."""
        payload = _make_payload("Sahiplik Testi")
        payload.user_id = self.bob.id  # istemci Bob'un kimliğini iddia ediyor

        created = self.engine.create_strategy(self.db, payload, user_id=self.alice.id)

        self.assertEqual(created["user_id"], self.alice.id)
        self.assertEqual(self.engine.list_strategies(self.db, self.bob.id), [])


if __name__ == "__main__":
    unittest.main()
