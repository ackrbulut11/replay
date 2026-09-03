"""
Emir gerceklesme maliyetleri ve pozisyon boyutlandirma (unittest).

Maliyetler eklenmeden once her islem sifir maliyetle gerceklesiyordu; bu,
islem sayisi arttikca sonucun ISARETINI degistiren bir hataydi.
"""

from __future__ import annotations

import unittest

from app.engines.execution import (
    ExecutionCosts,
    PositionSizing,
    SizingMode,
    fill_price,
    level_fill_price,
    net_pnl_percent,
    position_quantity,
    round_trip_commission_pct,
    simulate_account,
    simulate_portfolio,
)


class TestExecutionCosts(unittest.TestCase):
    def test_zero_costs_leave_price_untouched(self):
        costs = ExecutionCosts()
        self.assertTrue(costs.is_zero)
        self.assertEqual(fill_price(100.0, is_buy=True, costs=costs), 100.0)
        self.assertEqual(fill_price(100.0, is_buy=False, costs=costs), 100.0)

    def test_slippage_is_always_adverse(self):
        costs = ExecutionCosts(slippage_bps=10)  # %0,1
        # Alis daha PAHALI dolar
        self.assertAlmostEqual(fill_price(100.0, is_buy=True, costs=costs), 100.10, places=9)
        # Satis daha UCUZ dolar
        self.assertAlmostEqual(fill_price(100.0, is_buy=False, costs=costs), 99.90, places=9)

    def test_commission_is_charged_on_both_legs(self):
        # 10 bps = %0,1 -> gidis-donus %0,2
        self.assertAlmostEqual(round_trip_commission_pct(ExecutionCosts(commission_bps=10)), 0.2, places=9)

    def test_net_pnl_subtracts_commission(self):
        costs = ExecutionCosts(commission_bps=10)
        # Brut %10 kar, komisyon %0,2 -> net %9,8
        self.assertAlmostEqual(net_pnl_percent("long", 100.0, 110.0, costs), 9.8, places=9)
        # Short: fiyat duserse kar
        self.assertAlmostEqual(net_pnl_percent("short", 100.0, 90.0, costs), 9.8, places=9)

    def test_costs_turn_a_thin_winner_into_a_loser(self):
        """Asil mesele bu: kucuk kazanclar maliyetin altinda kalir."""
        costs = ExecutionCosts(commission_bps=10, slippage_bps=5)
        entry = fill_price(100.0, is_buy=True, costs=costs)
        exit_ = fill_price(100.15, is_buy=False, costs=costs)
        self.assertLess(net_pnl_percent("long", entry, exit_, costs), 0.0)

    def test_reads_from_strategy_dict(self):
        costs = ExecutionCosts.from_strategy({"commission_bps": 7.5, "slippage_bps": 2})
        self.assertEqual(costs.commission_bps, 7.5)
        self.assertEqual(costs.slippage_bps, 2)

    def test_param_override_wins_over_strategy(self):
        costs = ExecutionCosts.from_strategy(
            {"commission_bps": 10}, {"commission_bps": 0, "slippage_bps": 3}
        )
        self.assertEqual(costs.commission_bps, 0)
        self.assertEqual(costs.slippage_bps, 3)


class TestPositionSizing(unittest.TestCase):
    def test_fixed_units(self):
        sizing = PositionSizing(SizingMode.FIXED_UNITS, 3)
        self.assertEqual(position_quantity(sizing, equity=10_000, entry_price=250), 3)

    def test_fixed_cash(self):
        sizing = PositionSizing(SizingMode.FIXED_CASH, 1_000)
        self.assertAlmostEqual(position_quantity(sizing, 10_000, 250), 4.0)

    def test_percent_equity(self):
        sizing = PositionSizing(SizingMode.PERCENT_EQUITY, 50)
        self.assertAlmostEqual(position_quantity(sizing, 10_000, 100), 50.0)

    def test_risk_percent_uses_stop_distance(self):
        """%1 risk, 100'den girip 95'te stop -> 5 birim risk, 100 TL risk bütçesi."""
        sizing = PositionSizing(SizingMode.RISK_PERCENT, 1)
        qty = position_quantity(sizing, equity=10_000, entry_price=100, stop_price=95)
        self.assertAlmostEqual(qty, 20.0)  # 100 TL / 5 TL = 20 birim

    def test_risk_percent_is_capped_by_equity(self):
        """Cok yakin stop sonsuz miktar uretmemeli: kaldirac yok."""
        sizing = PositionSizing(SizingMode.RISK_PERCENT, 1)
        qty = position_quantity(sizing, equity=10_000, entry_price=100, stop_price=99.999)
        self.assertLessEqual(qty * 100, 10_000 + 1e-6)

    def test_risk_percent_without_stop_is_rejected(self):
        sizing = PositionSizing(SizingMode.RISK_PERCENT, 1)
        with self.assertRaises(ValueError):
            position_quantity(sizing, equity=10_000, entry_price=100, stop_price=None)

    def test_unknown_mode_is_rejected(self):
        with self.assertRaises(ValueError):
            PositionSizing.from_dict({"mode": "her_seyi_bas"})


class TestSimulateAccount(unittest.TestCase):
    @staticmethod
    def _trade(entry, exit_, side="long"):
        return {"side": side, "entry_price": entry, "exit_price": exit_}

    def test_percent_equity_compounds(self):
        result = simulate_account(
            [self._trade(100, 110), self._trade(100, 110)],
            starting_balance=1_000,
            sizing=PositionSizing(SizingMode.PERCENT_EQUITY, 100),
        )
        # 1000 -> 1100 -> 1210 (bilesik)
        self.assertAlmostEqual(result["ending_balance"], 1210.0, places=6)

    def test_fixed_cash_does_not_compound(self):
        result = simulate_account(
            [self._trade(100, 110), self._trade(100, 110)],
            starting_balance=1_000,
            sizing=PositionSizing(SizingMode.FIXED_CASH, 500),
        )
        # Her islemde 500 TL -> %10 -> +50, iki kez
        self.assertAlmostEqual(result["ending_balance"], 1100.0, places=6)

    def test_output_feeds_performance_report(self):
        """Cikti calculate_performance'in bekledigi alanlari tasimali."""
        result = simulate_account([self._trade(100, 110)], 1_000)
        trade = result["trades"][0]
        for key in ("pnl", "quantity", "entry_price"):
            self.assertIn(key, trade)

    def test_wipeout_stops_further_trades(self):
        """Bakiye sifirlandiginda sonraki islemler acilamaz."""
        result = simulate_account(
            [self._trade(100, 0.0), self._trade(100, 200)],
            starting_balance=1_000,
            sizing=PositionSizing(SizingMode.PERCENT_EQUITY, 100),
        )
        self.assertEqual(result["ending_balance"], 0.0)
        self.assertEqual(len(result["trades"]), 1, "bakiye bitince sonraki islem acilmamali")

    def test_precomputed_pnl_percent_is_respected(self):
        """Maliyet dusulmus yuzde verilmisse fiyatlardan yeniden hesaplanmaz."""
        result = simulate_account(
            [{"side": "long", "entry_price": 100, "exit_price": 110, "pnl_percent": 9.8}],
            starting_balance=1_000,
            sizing=PositionSizing(SizingMode.PERCENT_EQUITY, 100),
        )
        self.assertAlmostEqual(result["ending_balance"], 1098.0, places=6)



class TestSimulatePortfolio(unittest.TestCase):
    """Coklu sembol TEK hesabi paylasmali."""

    @staticmethod
    def _trade(entry_ts, exit_ts, pnl_pct, entry=100.0):
        return {
            "side": "long", "entry_price": entry, "exit_price": entry * (1 + pnl_pct / 100),
            "pnl_percent": pnl_pct, "entry_timestamp": entry_ts, "exit_timestamp": exit_ts,
        }

    def test_sequential_trades_share_one_account(self):
        """Ust uste binmeyen islemler sirayla ayni bakiyeyi kullanir."""
        result = simulate_portfolio(
            {"A": [self._trade(1, 2, 10.0)], "B": [self._trade(3, 4, 10.0)]},
            starting_balance=1_000,
            sizing=PositionSizing(SizingMode.PERCENT_EQUITY, 100),
        )
        # 1000 -> 1100 -> 1210 (bilesik, cunku ikinci islem birincinin ardindan)
        self.assertAlmostEqual(result["ending_balance"], 1210.0, places=6)
        self.assertEqual(result["skipped_trades"], 0)

    def test_concurrent_positions_split_the_capital(self):
        """Ayni anda acik iki pozisyon ayni parayi paylasir."""
        overlapping = {
            "A": [self._trade(1, 10, 10.0)],
            "B": [self._trade(2, 10, 10.0)],
        }
        result = simulate_portfolio(
            overlapping, starting_balance=1_000,
            sizing=PositionSizing(SizingMode.PERCENT_EQUITY, 100),
        )
        # A tum sermayeyi baglar; B'ye serbest nakit kalmaz -> atlanir.
        self.assertEqual(result["skipped_trades"], 1)
        self.assertAlmostEqual(result["ending_balance"], 1100.0, places=6)

    def test_max_concurrent_limit_skips_signals(self):
        trades = {f"S{i}": [self._trade(1, 100, 5.0)] for i in range(8)}
        result = simulate_portfolio(
            trades, starting_balance=100_000,
            sizing=PositionSizing(SizingMode.FIXED_CASH, 1_000),
            max_concurrent_positions=3,
        )
        self.assertEqual(len(result["trades"]), 3)
        self.assertEqual(result["skipped_trades"], 5)

    def test_trades_without_timestamps_are_ignored(self):
        result = simulate_portfolio(
            {"A": [{"side": "long", "entry_price": 100, "exit_price": 110, "pnl_percent": 10}]},
            starting_balance=1_000,
        )
        self.assertEqual(result["total_signals"], 0)
        self.assertEqual(result["ending_balance"], 1_000)

    def test_result_differs_from_independent_sum(self):
        """Portfoy testinin varlik sebebi: bagimsiz toplamla ayni cikmamali."""
        overlapping = {
            "A": [self._trade(1, 10, 20.0)],
            "B": [self._trade(2, 10, 20.0)],
            "C": [self._trade(3, 10, 20.0)],
        }
        portfolio = simulate_portfolio(
            overlapping, starting_balance=1_000,
            sizing=PositionSizing(SizingMode.PERCENT_EQUITY, 100),
        )
        # Bagimsiz test her sembole 1000 verirdi -> 3 x %20 = +600
        self.assertLess(portfolio["ending_balance"] - 1_000, 600)

    def test_closed_trades_carry_running_equity(self):
        result = simulate_portfolio(
            {"A": [self._trade(1, 2, 10.0)], "B": [self._trade(3, 4, 10.0)]},
            starting_balance=1_000,
            sizing=PositionSizing(SizingMode.PERCENT_EQUITY, 100),
        )
        equities = [t["equity_after"] for t in result["trades"]]
        self.assertEqual(equities, sorted(equities), "bakiye kronolojik ilerlemeli")

if __name__ == "__main__":
    unittest.main()


class TestLevelFillPrice(unittest.TestCase):
    """Bosluklu (gap) acilista TP/SL seviyeden degil ACILISTAN dolar.

    Eskiden cikis her zaman tam seviyeden yaziliyordu: giris 100, stop 95,
    sonraki mum 60'tan aciyorsa zarar -%5 gorunuyordu (gercekte -%40).
    Bu, her kaybeden isleme yapay bir taban koyuyordu.
    """

    def test_long_stop_gap_asagi_acilista_dolar(self):
        # Mum stop'un (95) cok altinda actiysa emir 60'tan dolar.
        self.assertEqual(level_fill_price("long", 95.0, 60.0, is_stop=True), 60.0)

    def test_long_stop_mum_ici_tetiklenirse_seviyeden_dolar(self):
        # Acilis stop'un ustunde: seviye mum icinde delinmis, tam 95'ten dolar.
        self.assertEqual(level_fill_price("long", 95.0, 99.0, is_stop=True), 95.0)

    def test_long_take_profit_gap_yukari_acilista_dolar(self):
        # Lehe bosluk da hakkiyla verilir: hedef 110 iken mum 130'dan actiysa 130.
        self.assertEqual(level_fill_price("long", 110.0, 130.0, is_stop=False), 130.0)

    def test_long_take_profit_mum_ici_tetiklenirse_seviyeden_dolar(self):
        self.assertEqual(level_fill_price("long", 110.0, 101.0, is_stop=False), 110.0)

    def test_short_stop_gap_yukari_acilista_dolar(self):
        # Short'ta zarar YUKARI: stop 105 iken mum 140'tan actiysa 140.
        self.assertEqual(level_fill_price("short", 105.0, 140.0, is_stop=True), 140.0)

    def test_short_stop_mum_ici_tetiklenirse_seviyeden_dolar(self):
        self.assertEqual(level_fill_price("short", 105.0, 101.0, is_stop=True), 105.0)

    def test_short_take_profit_gap_asagi_acilista_dolar(self):
        self.assertEqual(level_fill_price("short", 90.0, 70.0, is_stop=False), 70.0)

    def test_acilis_bilinmiyorsa_seviyeye_dusulur(self):
        # Acilis yoksa bosluk tespit edilemez; eski davranis korunur.
        self.assertEqual(level_fill_price("long", 95.0, 0.0, is_stop=True), 95.0)
        self.assertEqual(level_fill_price("long", 95.0, None, is_stop=True), 95.0)
