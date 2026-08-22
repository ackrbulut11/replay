"""
Manuel backtest ile otomatik strateji karsilastirmasi (unittest).

Platformun asil iddiasi bu (roadmap.md "TradingView klonu degil"): iki motor
da vardi ama hicbir yerde yan yana konmuyordu.
"""

from __future__ import annotations

import unittest
from datetime import datetime

from app.engines.comparison import (
    ComparisonWindowError,
    build_comparison,
    manual_trades_payload,
    session_window,
)
from app.engines.execution import ExecutionCosts


class FakeTrade:
    """JournalTrade'in karsilastirma icin kullanilan alanlarini tasir."""

    def __init__(self, entry_time, exit_time, pnl=0.0, entry_price=100.0, quantity=1.0):
        self.entry_time = entry_time
        self.exit_time = exit_time
        self.closed_at = exit_time
        self.pnl = pnl
        self.pnl_percent = None
        self.entry_price = entry_price
        self.quantity = quantity
        self.side = "long"
        self.symbol = "BTCUSDT"
        self.provider = "binance"
        self.timeframe = "1h"
        self.exit_reason = "manual"


class TestSessionWindow(unittest.TestCase):
    def test_window_spans_first_entry_to_last_exit(self):
        trades = [
            FakeTrade(datetime(2024, 3, 5), datetime(2024, 3, 6)),
            FakeTrade(datetime(2024, 3, 1), datetime(2024, 3, 2)),
            FakeTrade(datetime(2024, 3, 3), datetime(2024, 3, 9)),
        ]
        start, end = session_window(trades)
        self.assertEqual(start, datetime(2024, 3, 1))
        self.assertEqual(end, datetime(2024, 3, 9))

    def test_falls_back_to_closed_at_when_exit_time_missing(self):
        trade = FakeTrade(datetime(2024, 3, 1), None)
        trade.closed_at = datetime(2024, 3, 4)
        start, end = session_window([trade])
        self.assertEqual(end, datetime(2024, 3, 4))

    def test_single_instant_trade_gets_a_usable_window(self):
        """Ayni anda acilip kapanmis islem sifir uzunlukta pencere uretmemeli."""
        moment = datetime(2024, 3, 1, 10, 0)
        start, end = session_window([FakeTrade(moment, moment)])
        self.assertGreater(end, start)

    def test_no_timed_trades_raises(self):
        with self.assertRaises(ComparisonWindowError):
            session_window([FakeTrade(None, None)])

    def test_empty_list_raises(self):
        with self.assertRaises(ComparisonWindowError):
            session_window([])


class TestManualTradesPayload(unittest.TestCase):
    def test_payload_has_report_fields(self):
        payload = manual_trades_payload([FakeTrade(datetime(2024, 1, 1), datetime(2024, 1, 2), pnl=50)])
        for key in ("pnl", "entry_price", "quantity"):
            self.assertIn(key, payload[0])

    def test_times_are_iso_strings(self):
        payload = manual_trades_payload([FakeTrade(datetime(2024, 1, 1), datetime(2024, 1, 2))])
        self.assertTrue(payload[0]["entry_time"].endswith("Z"))


class TestBuildComparison(unittest.TestCase):
    WINDOW = (datetime(2024, 1, 1), datetime(2024, 2, 1))

    def _build(self, manual_profit, strategy_profit, **extra):
        manual = {"net_profit": manual_profit, "win_rate": 50.0, "total_trades": 10,
                  "profit_factor": 1.5, "max_drawdown_pct": 12.0}
        strategy_result = {
            "performance": {"net_profit": strategy_profit, "win_rate": 60.0, "total_trades": 7,
                            "profit_factor": 2.0, "max_drawdown_pct": 8.0, **extra},
            "total_trades": 7, "total_pnl_percent": 14.0, "signals": [],
        }
        return build_comparison(manual, strategy_result, "BTCUSDT", "1h", self.WINDOW)

    def test_strategy_wins(self):
        result = self._build(manual_profit=800.0, strategy_profit=1400.0)
        self.assertEqual(result["verdict"], "strateji")
        self.assertAlmostEqual(result["delta"]["net_profit"], 600.0)

    def test_manual_wins(self):
        result = self._build(manual_profit=1400.0, strategy_profit=800.0)
        self.assertEqual(result["verdict"], "manuel")
        self.assertAlmostEqual(result["delta"]["net_profit"], -600.0)

    def test_tie(self):
        self.assertEqual(self._build(1000.0, 1000.0)["verdict"], "berabere")

    def test_missing_metric_is_undecided(self):
        self.assertEqual(self._build(None, 1000.0)["verdict"], "belirsiz")

    def test_deltas_are_strategy_minus_manual(self):
        result = self._build(800.0, 1400.0)
        # Strateji daha az islemle daha az dususte kalmis
        self.assertAlmostEqual(result["delta"]["win_rate"], 10.0)
        self.assertAlmostEqual(result["delta"]["max_drawdown_pct"], -4.0)
        self.assertAlmostEqual(result["delta"]["total_trades"], -3.0)

    def test_window_is_reported(self):
        result = self._build(800.0, 1400.0)
        self.assertTrue(result["window"]["start"].startswith("2024-01-01"))
        self.assertTrue(result["window"]["end"].startswith("2024-02-01"))

    def test_missing_delta_metric_is_none(self):
        manual = {"net_profit": 100.0}
        strategy_result = {"performance": {"net_profit": 200.0}, "total_trades": 1}
        result = build_comparison(manual, strategy_result, "X", "1h", self.WINDOW)
        self.assertIsNone(result["delta"]["win_rate"])


class TestVerdictUsesWeightedReturn(unittest.TestCase):
    """Kiyas olcusu net kar DEGIL, baglanan sermayeye gore getiridir.

    Iki taraf ayni tutari riske atmiyor: manuel islemin miktari kullanicinin
    girdigi adet (arayuz varsayilani 1), strateji ise bakiyenin tamamini
    kullanir. BTCUSDT'de '1 adet' 60.000 $, THYAO'da 300 TL demek; bu iki
    net_profit'i karsilastirmak elmayla armut toplamakti.
    """

    WINDOW = (datetime(2024, 1, 1), datetime(2024, 2, 1))

    def _build(self, manual_ret, strategy_ret, manual_profit, strategy_profit):
        manual = {
            "net_profit": manual_profit,
            "weighted_return_pct": manual_ret,
            "win_rate": 50.0,
            "total_trades": 10,
        }
        strategy_result = {
            "performance": {
                "net_profit": strategy_profit,
                "weighted_return_pct": strategy_ret,
                "win_rate": 60.0,
                "total_trades": 7,
            },
            "total_trades": 7,
            "signals": [],
        }
        return build_comparison(manual, strategy_result, "BTCUSDT", "1h", self.WINDOW)

    def test_kucuk_pozisyonlu_manuel_yuzdede_kazanabilir(self):
        # Manuel 300 TL baglayip %20, strateji 10.000 TL baglayip %5 kazanmis.
        # Net karda strateji onde (500 > 60) ama getiride manuel onde.
        result = self._build(
            manual_ret=20.0, strategy_ret=5.0, manual_profit=60.0, strategy_profit=500.0
        )
        self.assertEqual(result["verdict"], "manuel")
        self.assertAlmostEqual(result["delta"]["weighted_return_pct"], -15.0)
        # Net kar bilgi olarak duruyor ama karari o vermiyor.
        self.assertAlmostEqual(result["delta"]["net_profit"], 440.0)

    def test_strateji_yuzdede_ondeyse_strateji_kazanir(self):
        result = self._build(
            manual_ret=4.0, strategy_ret=11.0, manual_profit=900.0, strategy_profit=110.0
        )
        self.assertEqual(result["verdict"], "strateji")

    def test_agirlikli_getiri_yoksa_net_kara_dusulur(self):
        # Fiyat/miktar eksikse weighted_return_pct None gelir; kiyas yine yapilir.
        result = self._build(
            manual_ret=None, strategy_ret=None, manual_profit=100.0, strategy_profit=250.0
        )
        self.assertEqual(result["verdict"], "strateji")
        self.assertIsNone(result["delta"]["weighted_return_pct"])


class TestManualSideCarriesStrategyCosts(unittest.TestCase):
    """Stratejinin komisyon/slipaji manuel tarafa da uygulanir.

    Manuel gunluk maliyetsiz tutuluyor, strateji sablonlari 10 bps komisyon +
    5 bps slipajla geliyordu; ayni maliyet iki tarafa uygulanmadan fark
    stratejiden degil varsayimdan geliyordu.
    """

    def _trade(self):
        t = FakeTrade(datetime(2024, 1, 1), datetime(2024, 1, 2), pnl=100.0,
                      entry_price=1000.0, quantity=2.0)
        t.pnl_percent = 5.0
        return t

    def test_maliyetsiz_cagri_kayitlari_degistirmez(self):
        payload = manual_trades_payload([self._trade()])
        self.assertAlmostEqual(payload[0]["pnl"], 100.0)
        self.assertAlmostEqual(payload[0]["pnl_percent"], 5.0)

    def test_komisyon_ve_slipaj_dusulur(self):
        costs = ExecutionCosts(commission_bps=10.0, slippage_bps=5.0)
        payload = manual_trades_payload([self._trade()], costs)
        # Gidis-donus toplam maliyet: komisyon %0,2 + slipaj %0,1 = %0,3
        self.assertAlmostEqual(payload[0]["pnl_percent"], 4.7, places=6)
        # Baglanan sermaye 1000 x 2 = 2000; %0,3'u 6 TL.
        self.assertAlmostEqual(payload[0]["pnl"], 94.0, places=6)

    def test_gunluk_kaydinin_kendisi_degismez(self):
        trade = self._trade()
        manual_trades_payload([trade], ExecutionCosts(commission_bps=10.0))
        # Gecmisi geriye donuk yeniden yazmak gunlugun guvenilirligini bitirirdi.
        self.assertAlmostEqual(trade.pnl, 100.0)
        self.assertAlmostEqual(trade.pnl_percent, 5.0)


if __name__ == "__main__":
    unittest.main()
