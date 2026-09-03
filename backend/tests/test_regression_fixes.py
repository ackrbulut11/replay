from __future__ import annotations

import os
import tempfile
import unittest
from datetime import datetime, timedelta
from unittest.mock import Mock

import pandas as pd
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.data.loader import DataLoader
from app.database.models import Base, JournalTrade, ReplaySession, User
from app.engines.execution import PositionSizing, SizingMode, simulate_portfolio
from app.engines.strategy_engine import StrategyEngine
from app.journal.models import (
    ExitReason,
    TradeCloseRequest,
    TradeOpenRequest,
    TradeSide,
)
from app.journal.trade_journal import TradeJournal
from app.rules.evaluator import RuleEvaluator, _get_multi_tf_bar_index
from app.rules.validation import validate_condition_group


class TestFinansalRegresyonlar(unittest.TestCase):
    def test_kucuk_fiyat_sifira_yuvarlanmaz(self):
        df = pd.DataFrame(
            {
                "timestamp": pd.date_range("2024-01-01", periods=4, freq="h"),
                "open": [1e-7, 1e-7, 1.1e-7, 1.1e-7],
                "high": [1e-7, 1e-7, 1.1e-7, 1.1e-7],
                "low": [1e-7, 1e-7, 1.1e-7, 1.1e-7],
                "close": [1e-7, 1e-7, 1.1e-7, 1.1e-7],
                "volume": [1] * 4,
            }
        )
        strategy = {
            "parameters": [],
            "bar_delay": 0,
            "entry_rules": {
                "logic": "AND",
                "conditions": [
                    {
                        "left": {"type": "price", "field": "close"},
                        "operator": "==",
                        "right": {"type": "value", "value": 1e-7},
                    }
                ],
            },
            "exit_rules": {
                "logic": "AND",
                "conditions": [
                    {
                        "left": {"type": "price", "field": "close"},
                        "operator": ">=",
                        "right": {"type": "value", "value": 1.1e-7},
                    }
                ],
            },
        }
        result = StrategyEngine().evaluate(strategy, df)
        self.assertEqual(result["total_trades"], 1)
        self.assertGreater(result["signals"][0]["price"], 0)

    def test_portfoy_acik_pozisyon_sermayesini_ayirir(self):
        result = simulate_portfolio(
            {
                "A": [{"entry_timestamp": 1, "entry_price": 100}],
                "B": [
                    {
                        "entry_timestamp": 2,
                        "exit_timestamp": 3,
                        "entry_price": 100,
                        "pnl_percent": 10,
                    }
                ],
            },
            sizing=PositionSizing(SizingMode.PERCENT_EQUITY, 100),
        )
        self.assertEqual(len(result["open_positions"]), 1)
        self.assertEqual(result["skipped_trades"], 1)
        self.assertEqual(result["ending_balance"], 10000)

    def test_es_zamanli_sinyal_sirasi_gelecek_cikisa_baglanmaz(self):
        trades = {
            "B": [
                {
                    "entry_timestamp": 1,
                    "exit_timestamp": 2,
                    "entry_price": 100,
                    "pnl_percent": 10,
                }
            ],
            "A": [
                {
                    "entry_timestamp": 1,
                    "exit_timestamp": 99,
                    "entry_price": 100,
                    "pnl_percent": 50,
                }
            ],
        }
        result = simulate_portfolio(trades, max_concurrent_positions=1)
        self.assertEqual(result["trades"][0]["symbol"], "A")


class TestKuralRegresyonlar(unittest.TestCase):
    def test_ifade_rising_gecmis_ifadeyi_okur(self):
        frame = pd.DataFrame({"close": [1.0, 2.0, 3.0]})
        condition = {
            "left": {
                "type": "expr",
                "op": "-",
                "left": {"type": "price", "field": "close"},
                "right": {"type": "value", "value": 0},
            },
            "operator": "rising",
            "right": {"type": "value", "value": 1},
        }
        self.assertTrue(RuleEvaluator.evaluate_condition(condition, frame, 2, {})[0])

    def test_aylik_hizalama_gelecek_satirlardan_etkilenmez(self):
        fine = pd.DataFrame(
            {"timestamp": pd.to_datetime(["2024-03-31 11:00", "2024-03-31 12:00"])}
        )
        fine.attrs["timeframe"] = "1h"
        monthly = pd.DataFrame(
            {
                "timestamp": pd.to_datetime(
                    ["2024-02-01", "2024-03-01", "2024-04-01", "2030-01-01"]
                )
            }
        )
        self.assertEqual(
            _get_multi_tf_bar_index(fine, 1, monthly, target_timeframe="1mo"), 0
        )
        changed = monthly.copy()
        changed.loc[3, "timestamp"] = pd.Timestamp("2050-01-01")
        self.assertEqual(
            _get_multi_tf_bar_index(fine, 1, changed, target_timeframe="1mo"), 0
        )

    def test_cok_genis_oruntu_agaci_reddedilir(self):
        condition = {
            "left": {"type": "price", "field": "close"},
            "operator": ">",
            "right": {"type": "value", "value": 1},
        }
        errors = validate_condition_group(
            {"logic": "AND", "conditions": [condition] * 101}
        )
        self.assertTrue(errors)


class TestVeriRegresyonlar(unittest.TestCase):
    def test_gecerli_forex_doji_fiyati_degistirilmez(self):
        frame = pd.DataFrame(
            {
                "timestamp": pd.date_range("2024-01-01", periods=3),
                "open": [1.0, 2.0, 3.0],
                "high": [2.0, 3.0, 4.0],
                "low": [0.5, 1.5, 2.5],
                "close": [1.0, 2.0, 3.0],
                "volume": [1, 1, 1],
            }
        )
        out = DataLoader._normalize_cached_frame(frame, "forex", "1d")
        self.assertEqual(out["open"].tolist(), [1.0, 2.0, 3.0])

    def test_taze_dosya_eksik_tarih_araligini_kapsamis_saymaz(self):
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, "cache.parquet")
            start = datetime(2020, 1, 1)
            cached_end = start + timedelta(hours=1)
            end = cached_end + timedelta(minutes=10)
            frame = pd.DataFrame(
                {
                    "timestamp": [start, cached_end],
                    "open": [1, 1],
                    "high": [1, 1],
                    "low": [1, 1],
                    "close": [1, 1],
                    "volume": [1, 1],
                }
            )
            frame.to_parquet(path, index=False)
            provider = Mock()
            provider.fetch_ohlcv.return_value = pd.DataFrame()
            loader = DataLoader()
            loader.providers["binance"] = provider
            loader._get_cache_path = lambda *args: path
            loader.load_data("binance", "X", "1m", start, end)
            provider.fetch_ohlcv.assert_called()


class TestGunlukEszamanlilik(unittest.TestCase):
    def test_eski_iki_istekten_yalniz_biri_kapatir_ve_silme_bakiyeyi_geri_alir(self):
        with tempfile.TemporaryDirectory() as folder:
            engine = create_engine("sqlite:///" + os.path.join(folder, "db.sqlite"))
            Base.metadata.create_all(engine)
            Session = sessionmaker(engine)
            first = Session()
            first.add(User(id="u", email="u@example.com"))
            first.commit()
            replay = TradeJournal.start_session(
                first,
                __import__(
                    "app.journal.models", fromlist=["ReplaySessionCreateRequest"]
                ).ReplaySessionCreateRequest(symbol="X", timeframe="1h"),
                "u",
            )
            trade = TradeJournal.open_trade(
                first,
                TradeOpenRequest(
                    symbol="X",
                    provider="binance",
                    timeframe="1h",
                    side=TradeSide.LONG,
                    entry_price=100,
                    quantity=1,
                    session_id=replay.id,
                ),
                "u",
            )
            second = Session()
            stale = second.query(JournalTrade).filter_by(id=trade.id).one()
            request = TradeCloseRequest(exit_price=110, exit_reason=ExitReason.MANUAL)
            TradeJournal.close_trade(first, trade, request)
            with self.assertRaises(ValueError):
                TradeJournal.close_trade(second, stale, request)
            second.rollback()
            current = first.query(ReplaySession).filter_by(id=replay.id).one()
            first.refresh(current)
            self.assertEqual(current.current_balance, 10010)
            TradeJournal.delete_trade(first, trade)
            first.refresh(current)
            self.assertEqual(current.current_balance, 10000)
            second.close()
            first.close()
            engine.dispose()


if __name__ == "__main__":
    unittest.main()
