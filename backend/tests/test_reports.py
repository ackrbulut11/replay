"""
Performans raporu motoru unit testleri (unittest, pytest değil).
"""

import unittest

from app.reports.performance_report import (
    compound_return_pct,
    build_equity_curve,
    calculate_performance,
    expectancy,
    extract_pnls,
    gross_loss,
    gross_profit,
    loss_rate,
    max_drawdown,
    net_profit,
    profit_factor,
    sharpe_ratio,
    trade_returns,
    weighted_return_pct,
    win_rate,
)


def trades(*pnls):
    """Testlerde okunabilirlik için: trades(100, -50) -> [{"pnl": 100}, ...]"""
    return [{"pnl": p} for p in pnls]


class TestExtractPnls(unittest.TestCase):
    def test_bozuk_kayitlar_atlanir(self):
        raw = [
            {"pnl": 100},
            {"pnl": None},          # eksik
            {"symbol": "BTCUSDT"},  # pnl alanı hiç yok
            {"pnl": "abc"},         # sayıya çevrilemez
            {"pnl": float("nan")},
            {"pnl": float("inf")},
            {"pnl": "-25.5"},       # sayısal string kabul edilir
        ]
        self.assertEqual(extract_pnls(raw), [100.0, -25.5])


class TestTemelMetrikler(unittest.TestCase):
    def test_kar_zarar_toplamlari(self):
        pnls = [100.0, -40.0, 60.0, -20.0]
        self.assertAlmostEqual(net_profit(pnls), 100.0)
        self.assertAlmostEqual(gross_profit(pnls), 160.0)
        self.assertAlmostEqual(gross_loss(pnls), 60.0)
        self.assertAlmostEqual(profit_factor(pnls), 160.0 / 60.0)

    def test_oranlar(self):
        pnls = [10.0, -5.0, 20.0, -5.0]
        self.assertAlmostEqual(win_rate(pnls), 50.0)
        self.assertAlmostEqual(loss_rate(pnls), 50.0)
        self.assertAlmostEqual(expectancy(pnls), 5.0)

    def test_basabas_islem_iki_orana_da_girmez(self):
        # 0 pnl ne kazanç ne kayıp; ama paydada olduğu için toplam 100 etmez.
        pnls = [10.0, -10.0, 0.0, 0.0]
        self.assertAlmostEqual(win_rate(pnls), 25.0)
        self.assertAlmostEqual(loss_rate(pnls), 25.0)

    def test_bos_liste_none_dondurur(self):
        self.assertIsNone(win_rate([]))
        self.assertIsNone(loss_rate([]))
        self.assertIsNone(expectancy([]))
        self.assertAlmostEqual(net_profit([]), 0.0)

    def test_zarar_yoksa_profit_factor_none(self):
        # Sonsuz yerine None: float('inf') JSON'a serialize edilemez.
        self.assertIsNone(profit_factor([10.0, 20.0]))
        self.assertIsNone(profit_factor([]))


class TestEquityVeDrawdown(unittest.TestCase):
    def test_equity_curve_baslangic_bakiyesiyle_baslar(self):
        curve = build_equity_curve([100.0, -50.0], starting_balance=1000.0)
        self.assertEqual(curve, [1000.0, 1100.0, 1050.0])

    def test_max_drawdown_zirveden_dibe_olcer(self):
        # 1000 -> 1200 (zirve) -> 900 (dip): düşüş 300, zirveye göre %25
        curve = [1000.0, 1200.0, 900.0, 1100.0]
        amount, percent = max_drawdown(curve)
        self.assertAlmostEqual(amount, 300.0)
        self.assertAlmostEqual(percent, 25.0)

    def test_ilk_islemin_dususu_de_sayilir(self):
        # Eğri başlangıç bakiyesini içermeseydi bu drawdown kaçardı.
        curve = build_equity_curve([-100.0], starting_balance=1000.0)
        amount, percent = max_drawdown(curve)
        self.assertAlmostEqual(amount, 100.0)
        self.assertAlmostEqual(percent, 10.0)

    def test_hic_dusus_yoksa_sifir(self):
        amount, percent = max_drawdown([1000.0, 1100.0, 1200.0])
        self.assertAlmostEqual(amount, 0.0)
        self.assertIsNone(percent)

    def test_bos_egri(self):
        self.assertEqual(max_drawdown([]), (0.0, None))


class TestSharpe(unittest.TestCase):
    def test_getiriler_onceki_bakiyeye_gore_hesaplanir(self):
        # 1000 bakiyede +100 -> 0.10; bakiye 1100 olur, +110 -> 0.10
        returns = trade_returns([100.0, 110.0], starting_balance=1000.0)
        self.assertAlmostEqual(returns[0], 0.1)
        self.assertAlmostEqual(returns[1], 0.1)

    def test_iki_getiriden_az_ise_none(self):
        self.assertIsNone(sharpe_ratio([]))
        self.assertIsNone(sharpe_ratio([0.05]))

    def test_sapma_sifirsa_none(self):
        # Tüm getiriler aynı -> standart sapma 0 -> oran tanımsız.
        self.assertIsNone(sharpe_ratio([0.1, 0.1, 0.1]))

    def test_bilinen_deger(self):
        # returns = [0.1, 0.2, 0.3] -> ortalama 0.2, örneklem std 0.1 -> 2.0
        self.assertAlmostEqual(sharpe_ratio([0.1, 0.2, 0.3]), 2.0)

    def test_yilliklandirma_opsiyoneldir(self):
        base = sharpe_ratio([0.1, 0.2, 0.3])
        annualized = sharpe_ratio([0.1, 0.2, 0.3], periods_per_year=4)
        self.assertAlmostEqual(annualized, base * 2.0)  # sqrt(4) = 2


class TestWeightedReturnPct(unittest.TestCase):
    """Toplam getiri, pozisyon büyüklüğüne göre ağırlıklandırılır."""

    def test_buyuk_pozisyon_sonuca_hakim_olur(self):
        # 10 birimlik %10 kâr ile 1 birimlik %10 zarar birbirini GÖTÜRMEZ:
        # düz ortalama %0 verirdi, oysa bağlanan sermaye çok farklı.
        trades = [
            {"pnl": 100.0, "entry_price": 100.0, "quantity": 10.0},   # +%10
            {"pnl": -10.0, "entry_price": 100.0, "quantity": 1.0},    # -%10
        ]
        # 90 / 1100 = %8,18
        self.assertAlmostEqual(weighted_return_pct(trades), 8.181818, places=4)

    def test_esit_buyuklukte_ters_islemler_sifirlanir(self):
        trades = [
            {"pnl": 10.0, "entry_price": 100.0, "quantity": 1.0},
            {"pnl": -10.0, "entry_price": 100.0, "quantity": 1.0},
        ]
        self.assertAlmostEqual(weighted_return_pct(trades), 0.0)

    def test_islem_yoksa_none(self):
        # None, "başabaş" ile "hesaplanamıyor"u ayırır; 0.0 dönmek yanıltırdı.
        self.assertIsNone(weighted_return_pct([]))

    def test_miktar_yoksa_bir_varsayilir(self):
        trades = [{"pnl": 10.0, "entry_price": 100.0, "quantity": None}]
        self.assertAlmostEqual(weighted_return_pct(trades), 10.0)

    def test_bozuk_kayitlar_atlanir(self):
        trades = [
            {"pnl": 10.0, "entry_price": 100.0, "quantity": 1.0},
            {"pnl": None, "entry_price": 100.0, "quantity": 1.0},   # pnl yok
            {"pnl": 5.0, "entry_price": None, "quantity": 1.0},     # fiyat yok
            {"pnl": 5.0, "entry_price": 0.0, "quantity": 1.0},      # sermaye sıfır
        ]
        self.assertAlmostEqual(weighted_return_pct(trades), 10.0)


class TestCalculatePerformance(unittest.TestCase):
    def test_tam_rapor(self):
        report = calculate_performance(trades(100, -40, 60, -20), starting_balance=1000.0)

        self.assertEqual(report["total_trades"], 4)
        self.assertEqual(report["winning_trades"], 2)
        self.assertEqual(report["losing_trades"], 2)
        self.assertAlmostEqual(report["win_rate"], 50.0)
        self.assertAlmostEqual(report["net_profit"], 100.0)
        self.assertAlmostEqual(report["net_profit_pct"], 10.0)
        self.assertAlmostEqual(report["ending_balance"], 1100.0)
        self.assertAlmostEqual(report["largest_win"], 100.0)
        self.assertAlmostEqual(report["largest_loss"], -40.0)
        self.assertEqual(len(report["equity_curve"]), 5)  # N+1 nokta

    def test_islem_yokken_patlamaz(self):
        report = calculate_performance([], starting_balance=5000.0)

        self.assertEqual(report["total_trades"], 0)
        self.assertIsNone(report["win_rate"])
        self.assertIsNone(report["profit_factor"])
        self.assertIsNone(report["sharpe_ratio"])
        self.assertIsNone(report["largest_win"])
        self.assertAlmostEqual(report["net_profit"], 0.0)
        self.assertAlmostEqual(report["ending_balance"], 5000.0)
        self.assertEqual(report["equity_curve"], [5000.0])

    def test_rapor_json_guvenli(self):
        # inf/nan JSON'a serialize edilemez; hiçbir metrik bunları döndürmemeli.
        import json
        import math

        report = calculate_performance(trades(10, 20, 30), starting_balance=1000.0)
        for key, value in report.items():
            if isinstance(value, float):
                self.assertFalse(math.isinf(value), f"{key} sonsuz")
                self.assertFalse(math.isnan(value), f"{key} NaN")
        json.dumps(report)  # patlamamalı


class TestCompoundReturn(unittest.TestCase):
    """Yuzdesel getiriler bilesik toplanmali (duz toplam degil)."""

    def test_gain_then_equal_loss_is_negative(self):
        # +%50 sonra -%50 -> 1.5 * 0.5 = 0.75 -> -%25 (duz toplamda %0 gorunurdu)
        self.assertAlmostEqual(compound_return_pct([50.0, -50.0]), -25.0, places=9)

    def test_empty_is_zero(self):
        self.assertEqual(compound_return_pct([]), 0.0)

    def test_single_value_passes_through(self):
        self.assertAlmostEqual(compound_return_pct([12.5]), 12.5, places=9)

    def test_sequence_compounds(self):
        # 1.10 * 1.10 = 1.21 -> %21 (duz toplam %20 derdi)
        self.assertAlmostEqual(compound_return_pct([10.0, 10.0]), 21.0, places=9)

    def test_total_wipeout_floors_at_minus_100(self):
        # Sermaye tamamen eridiginde sonraki kazanc telafi edemez.
        self.assertEqual(compound_return_pct([-100.0, 500.0]), -100.0)

    def test_repeated_losses_shrink_but_do_not_wipe_out(self):
        # 0.4^3 = 0.064 -> -%93,6. Duz toplam -%180 gibi imkansiz bir sayi verirdi.
        self.assertAlmostEqual(compound_return_pct([-60.0, -60.0, -60.0]), -93.6, places=9)

    def test_invalid_values_are_skipped(self):
        self.assertAlmostEqual(compound_return_pct([10.0, None, float("nan"), 10.0]), 21.0, places=9)


if __name__ == "__main__":
    unittest.main()
