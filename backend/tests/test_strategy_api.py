"""
Strategy API Engine Unit Tests using standard unittest.
"""

import unittest
from app.engines.strategy_engine import StrategyEngine
from app.indicators.registry import IndicatorRegistry
from app.rules.strategy_models import (
    StrategyCreateRequest,
    StrategyUpdateRequest,
)


class TestStrategyAPI(unittest.TestCase):
    def setUp(self):
        self.engine = StrategyEngine()

    def test_list_indicators(self):
        indicators = IndicatorRegistry.list_indicators()
        self.assertIsInstance(indicators, list)
        self.assertGreater(len(indicators), 0)

    def test_strategy_crud_flow(self):
        payload = StrategyCreateRequest(
            name="Unittest Strategy",
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
                        "right": {"type": "indicator", "name": "EMA", "period": 20}
                    }
                ]
            },
            exit_rules={
                "logic": "AND",
                "conditions": []
            },
            timeframe_filters=[]
        )

        # 1. Create strategy
        created = self.engine.create_strategy(payload)
        strat_id = created["id"]
        self.assertEqual(created["name"], "Unittest Strategy")

        # 2. List strategies
        strategies = self.engine.list_strategies()
        self.assertTrue(any(s["id"] == strat_id for s in strategies))

        # 3. Get strategy
        fetched = self.engine.get_strategy(strat_id)
        self.assertIsNotNone(fetched)
        self.assertEqual(fetched["id"], strat_id)

        # 4. Update strategy
        update_req = StrategyUpdateRequest(name="Updated Unittest Strategy")
        updated = self.engine.update_strategy(strat_id, update_req)
        self.assertIsNotNone(updated)
        self.assertEqual(updated["name"], "Updated Unittest Strategy")

        # 5. Delete strategy
        deleted = self.engine.delete_strategy(strat_id)
        self.assertTrue(deleted)

        # 6. Verify deletion
        fetched_after = self.engine.get_strategy(strat_id)
        self.assertIsNone(fetched_after)


if __name__ == "__main__":
    unittest.main()
