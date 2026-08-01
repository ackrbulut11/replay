"""
Replay yürütme motoru unit testleri (unittest, pytest değil).
"""

import unittest

from app.engines.replay_engine import (
    LONG,
    REASON_MANUAL,
    REASON_STOP_LOSS,
    REASON_TAKE_PROFIT,
    SHORT,
    advance_bar,
    calculate_pnl,
    calculate_pnl_percent,
    check_exit,
    close_position,
    levels_from_percent,
    open_position,
    unrealized_pnl,
    validate_levels,
)


def bar(high, low, close=None, timestamp=None):
    """Test mumu — check_exit yalnızca high/low'a bakar."""
    return {"high": high, "low": low, "close": close if close is not None else low, "timestamp": timestamp}


class TestPnl(unittest.TestCase):
    def test_long_kar_ve_zarar(self):
        self.assertAlmostEqual(calculate_pnl(LONG, 100.0, 110.0, 2.0), 20.0)
        self.assertAlmostEqual(calculate_pnl(LONG, 100.0, 90.0, 2.0), -20.0)

    def test_short_ters_yonde_kazanir(self):
        self.assertAlmostEqual(calculate_pnl(SHORT, 100.0, 90.0, 2.0), 20.0)
        self.assertAlmostEqual(calculate_pnl(SHORT, 100.0, 110.0, 2.0), -20.0)

    def test_yuzde_miktardan_bagimsiz(self):
        self.assertAlmostEqual(calculate_pnl_percent(LONG, 100.0, 110.0), 10.0)
        self.assertAlmostEqual(calculate_pnl_percent(SHORT, 100.0, 90.0), 10.0)

    def test_gecersiz_yon_hata_verir(self):
        with self.assertRaises(ValueError):
            calculate_pnl("sideways", 100.0, 110.0)


class TestValidateLevels(unittest.TestCase):
    def test_long_dogru_seviyeler(self):
        validate_levels(LONG, 100.0, stop_loss=95.0, take_profit=110.0)

    def test_short_dogru_seviyeler(self):
        validate_levels(SHORT, 100.0, stop_loss=105.0, take_profit=90.0)

    def test_long_ters_stop_reddedilir(self):
        # Girişin üstünde stop-loss ilk mumda tetiklenirdi.
        with self.assertRaises(ValueError):
            validate_levels(LONG, 100.0, stop_loss=105.0, take_profit=None)

    def test_long_ters_takeprofit_reddedilir(self):
        with self.assertRaises(ValueError):
            validate_levels(LONG, 100.0, stop_loss=None, take_profit=95.0)

    def test_short_ters_seviyeler_reddedilir(self):
        with self.assertRaises(ValueError):
            validate_levels(SHORT, 100.0, stop_loss=95.0, take_profit=None)
        with self.assertRaises(ValueError):
            validate_levels(SHORT, 100.0, stop_loss=None, take_profit=110.0)

    def test_seviyeler_opsiyonel(self):
        validate_levels(LONG, 100.0, stop_loss=None, take_profit=None)


class TestOpenPosition(unittest.TestCase):
    def test_pozisyon_alanlari(self):
        pos = open_position(LONG, entry_price=100.0, bar_index=5, quantity=3.0, stop_loss=95.0)
        self.assertEqual(pos["side"], LONG)
        self.assertAlmostEqual(pos["entry_price"], 100.0)
        self.assertAlmostEqual(pos["quantity"], 3.0)
        self.assertAlmostEqual(pos["stop_loss"], 95.0)
        self.assertIsNone(pos["take_profit"])
        self.assertEqual(pos["entry_bar_index"], 5)

    def test_sifir_miktar_reddedilir(self):
        with self.assertRaises(ValueError):
            open_position(LONG, entry_price=100.0, bar_index=0, quantity=0)


class TestLevelsFromPercent(unittest.TestCase):
    def test_long_yuzdeler(self):
        sl, tp = levels_from_percent(LONG, 100.0, stop_loss_pct=5, take_profit_pct=10)
        self.assertAlmostEqual(sl, 95.0)
        self.assertAlmostEqual(tp, 110.0)

    def test_short_yuzdeler_ters_yonde(self):
        sl, tp = levels_from_percent(SHORT, 100.0, stop_loss_pct=5, take_profit_pct=10)
        self.assertAlmostEqual(sl, 105.0)
        self.assertAlmostEqual(tp, 90.0)

    def test_uretilen_seviyeler_dogrulamayi_gecer(self):
        # Strateji motoruyla aynı sayıyı üretmeli, aksi halde iki taraf ayrışır.
        for side in (LONG, SHORT):
            sl, tp = levels_from_percent(side, 100.0, stop_loss_pct=5, take_profit_pct=10)
            validate_levels(side, 100.0, sl, tp)

    def test_verilmeyen_yuzde_none_kalir(self):
        sl, tp = levels_from_percent(LONG, 100.0, stop_loss_pct=None, take_profit_pct=None)
        self.assertIsNone(sl)
        self.assertIsNone(tp)


class TestCheckExit(unittest.TestCase):
    def test_long_stop_tetiklenir(self):
        pos = open_position(LONG, 100.0, bar_index=0, stop_loss=95.0, take_profit=110.0)
        self.assertEqual(check_exit(pos, bar(high=102, low=94)), (95.0, REASON_STOP_LOSS))

    def test_long_takeprofit_tetiklenir(self):
        pos = open_position(LONG, 100.0, bar_index=0, stop_loss=95.0, take_profit=110.0)
        self.assertEqual(check_exit(pos, bar(high=112, low=99)), (110.0, REASON_TAKE_PROFIT))

    def test_short_seviyeleri_ters_yonde_tetiklenir(self):
        pos = open_position(SHORT, 100.0, bar_index=0, stop_loss=105.0, take_profit=90.0)
        self.assertEqual(check_exit(pos, bar(high=106, low=99)), (105.0, REASON_STOP_LOSS))
        self.assertEqual(check_exit(pos, bar(high=101, low=89)), (90.0, REASON_TAKE_PROFIT))

    def test_ayni_mumda_ikisi_de_tetiklenirse_stop_kazanir(self):
        # Mum içi fiyat sırası bilinmez; kötü senaryo varsayılır (RULES.md §19-22).
        pos = open_position(LONG, 100.0, bar_index=0, stop_loss=95.0, take_profit=110.0)
        exit_price, reason = check_exit(pos, bar(high=115, low=90))
        self.assertEqual(reason, REASON_STOP_LOSS)
        self.assertAlmostEqual(exit_price, 95.0)

        short_pos = open_position(SHORT, 100.0, bar_index=0, stop_loss=105.0, take_profit=90.0)
        exit_price, reason = check_exit(short_pos, bar(high=110, low=85))
        self.assertEqual(reason, REASON_STOP_LOSS)
        self.assertAlmostEqual(exit_price, 105.0)

    def test_cikis_fiyati_mumun_ucu_degil_seviyenin_kendisi(self):
        # Mum 90'a kadar düşse de çıkış 95'te (stop seviyesi) olmalı.
        pos = open_position(LONG, 100.0, bar_index=0, stop_loss=95.0)
        exit_price, _ = check_exit(pos, bar(high=101, low=90))
        self.assertAlmostEqual(exit_price, 95.0)

    def test_tetiklenmezse_none(self):
        pos = open_position(LONG, 100.0, bar_index=0, stop_loss=95.0, take_profit=110.0)
        self.assertIsNone(check_exit(pos, bar(high=105, low=97)))

    def test_seviyesiz_pozisyon_hic_tetiklenmez(self):
        pos = open_position(LONG, 100.0, bar_index=0)
        self.assertIsNone(check_exit(pos, bar(high=1000, low=1)))


class TestClosePosition(unittest.TestCase):
    def test_kapanan_islem_rapor_icin_pnl_icerir(self):
        pos = open_position(LONG, 100.0, bar_index=2, quantity=2.0)
        trade = close_position(pos, exit_price=110.0, bar_index=7, reason=REASON_MANUAL)

        self.assertAlmostEqual(trade["pnl"], 20.0)
        self.assertAlmostEqual(trade["pnl_percent"], 10.0)
        self.assertEqual(trade["exit_reason"], REASON_MANUAL)
        self.assertEqual(trade["entry_bar_index"], 2)
        self.assertEqual(trade["exit_bar_index"], 7)

    def test_unrealized_pnl(self):
        pos = open_position(SHORT, 100.0, bar_index=0, quantity=2.0)
        snapshot = unrealized_pnl(pos, current_price=90.0)
        self.assertAlmostEqual(snapshot["pnl"], 20.0)
        self.assertAlmostEqual(snapshot["pnl_percent"], 10.0)


class TestAdvanceBar(unittest.TestCase):
    def test_pozisyon_yokken_sessiz(self):
        result = advance_bar(None, bar(high=100, low=90), bar_index=1)
        self.assertIsNone(result["position"])
        self.assertIsNone(result["closed_trade"])

    def test_tetiklenmeyen_mumda_pozisyon_acik_kalir(self):
        pos = open_position(LONG, 100.0, bar_index=0, stop_loss=95.0)
        result = advance_bar(pos, bar(high=104, low=98), bar_index=1)
        self.assertIsNotNone(result["position"])
        self.assertIsNone(result["closed_trade"])

    def test_stop_tetiklenince_pozisyon_kapanir(self):
        pos = open_position(LONG, 100.0, bar_index=0, quantity=2.0, stop_loss=95.0)
        result = advance_bar(pos, bar(high=101, low=90, timestamp="2024-01-02"), bar_index=4)

        self.assertIsNone(result["position"])
        trade = result["closed_trade"]
        self.assertEqual(trade["exit_reason"], REASON_STOP_LOSS)
        self.assertAlmostEqual(trade["exit_price"], 95.0)
        self.assertAlmostEqual(trade["pnl"], -10.0)  # (95-100) * 2
        self.assertEqual(trade["exit_bar_index"], 4)
        self.assertEqual(trade["exit_time"], "2024-01-02")

    def test_mum_mum_ilerleyen_akis(self):
        # Lookahead yok: her mum yalnızca kendi high/low'uyla değerlendirilir.
        pos = open_position(LONG, 100.0, bar_index=0, stop_loss=95.0, take_profit=110.0)
        bars = [bar(high=103, low=99), bar(high=105, low=101), bar(high=112, low=104)]

        closed = None
        for index, current in enumerate(bars, start=1):
            result = advance_bar(pos, current, bar_index=index)
            pos = result["position"]
            if result["closed_trade"]:
                closed = result["closed_trade"]
                break

        self.assertIsNotNone(closed)
        self.assertEqual(closed["exit_reason"], REASON_TAKE_PROFIT)
        self.assertEqual(closed["exit_bar_index"], 3)


class TestReportEntegrasyonu(unittest.TestCase):
    def test_kapanan_islemler_dogrudan_rapora_beslenebilir(self):
        from app.reports.performance_report import calculate_performance

        long_pos = open_position(LONG, 100.0, bar_index=0, quantity=1.0)
        short_pos = open_position(SHORT, 100.0, bar_index=0, quantity=1.0)
        closed = [
            close_position(long_pos, exit_price=110.0, bar_index=1),
            close_position(short_pos, exit_price=110.0, bar_index=2),
        ]

        report = calculate_performance(closed, starting_balance=1000.0)
        self.assertEqual(report["total_trades"], 2)
        self.assertEqual(report["winning_trades"], 1)
        self.assertEqual(report["losing_trades"], 1)
        self.assertAlmostEqual(report["net_profit"], 0.0)


if __name__ == "__main__":
    unittest.main()
