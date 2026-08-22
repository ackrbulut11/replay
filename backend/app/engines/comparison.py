"""
Manuel backtest ile otomatik strateji sonucunun karşılaştırılması.

Platformun asıl iddiası bu: "TradingView klonu değil; manuel backtest ve
strateji araştırması odaklı" (roadmap.md). İki motor da vardı, aynı veriyi
işliyorlardı, aynı sinyal biçimini üretiyorlardı — ama hiçbir yerde yan yana
konmuyorlardı.

Karşılaştırmanın adil olması üç şeye bağlı ve üçü de artık sağlanıyor:

  1. **Aynı pencere.** Strateji, manuel oturumun ilk girişinden son çıkışına
     kadar olan aralıkta çalıştırılır. Farklı aralık, farklı piyasa demektir.
  2. **Aynı ölçü.** İki taraf da `reports/performance_report.calculate_performance`
     fonksiyonundan geçer ve aynı başlangıç bakiyesini kullanır. Manuel taraf
     `pnl`'i gerçek miktardan, strateji tarafı nakit simülasyonundan alır.
  3. **Aynı maliyet.** Stratejinin komisyon/slipajı manuel tarafa da uygulanır
     (bkz. `manual_trades_payload`). Manuel işlem günlüğü maliyetsiz tutuluyor;
     strateji şablonları ise 10 bps komisyon + 5 bps slipajla geliyor. Bu, farkı
     stratejiden değil varsayımdan doğuruyordu.

**Kıyas ölçüsü NET KÂR DEĞİL, ağırlıklı yüzdesel getiridir.** İki taraf aynı
tutarı riske atmıyor: manuel işlemin miktarı kullanıcının girdiği adettir
(arayüz varsayılanı 1), strateji tarafı ise bakiyenin tamamını kullanır.
BTCUSDT'de "1 adet" 60.000 $, THYAO'da 300 ₺ demek — bu iki `net_profit`'i
karşılaştırmak elmayla armudu toplamaktı. `weighted_return_pct` bağlanan
sermayeye böldüğü için pozisyon büyüklüğünden bağımsızdır.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Optional, Sequence

from app.database.models import JournalTrade
from app.engines.execution import ExecutionCosts, round_trip_commission_pct


class ComparisonWindowError(ValueError):
    """Karşılaştırma penceresi kurulamadı (oturumda kapanmış işlem yok)."""


def session_window(trades: Sequence[JournalTrade]) -> tuple[datetime, datetime]:
    """Manuel işlemlerin kapsadığı zaman aralığı.

    İlk girişten son çıkışa. Zaman bilgisi taşımayan işlemler yok sayılır;
    hiçbiri taşımıyorsa pencere kurulamaz ve karşılaştırma anlamsız olur.
    """
    starts = [t.entry_time for t in trades if t.entry_time]
    ends = [t.exit_time or t.closed_at for t in trades if (t.exit_time or t.closed_at)]

    if not starts or not ends:
        raise ComparisonWindowError(
            "Oturumda zaman bilgisi taşıyan kapanmış işlem yok; "
            "karşılaştırma penceresi kurulamıyor."
        )

    start, end = min(starts), max(ends)
    if end <= start:
        # Tek bir mumda açılıp kapanmış tek işlem: stratejinin ısınması için
        # yine de bir aralık gerekir.
        end = start + timedelta(days=1)
    return start, end


def manual_trades_payload(
    trades: Sequence[JournalTrade],
    costs: ExecutionCosts | None = None,
) -> list[dict]:
    """Manuel işlemleri rapor fonksiyonunun beklediği biçime çevirir.

    `costs` verilirse (karşılaştırmada stratejinin kendi maliyetleri) manuel
    tarafa da AYNI komisyon ve slipaj uygulanır. Günlükteki kayıtlar
    DEĞİŞTİRİLMEZ — burada yalnızca karşılaştırma için bir kopya üretilir;
    geçmişi geriye dönük yeniden yazmak günlüğün güvenilirliğini bitirirdi.

    Uygulanmazsa manuel taraf sıfır maliyetle, strateji tarafı şablon
    varsayılanı olan 10+5 bps ile hesaplanıyor ve fark stratejiden değil
    varsayımdan geliyordu.
    """
    costs = costs or ExecutionCosts()
    commission_pct = round_trip_commission_pct(costs)
    slippage_pct = costs.slippage_rate * 2.0 * 100.0
    # Slipaj iki bacakta da aleyhe: giriş daha pahalı, çıkış daha ucuz dolar.
    # Yüzdesel karşılığı yaklaşık olarak iki bacağın toplamıdır (aynı
    # yaklaşımın gerekçesi için bkz. execution.round_trip_commission_pct).
    total_cost_pct = commission_pct + slippage_pct

    payload: list[dict] = []
    for t in trades:
        pnl = t.pnl
        pnl_percent = t.pnl_percent
        if total_cost_pct > 0:
            capital = (t.entry_price or 0.0) * (t.quantity or 1.0)
            if pnl is not None:
                pnl = pnl - capital * total_cost_pct / 100.0
            if pnl_percent is not None:
                pnl_percent = pnl_percent - total_cost_pct

        payload.append(
            {
                "pnl": pnl,
                "entry_price": t.entry_price,
                "quantity": t.quantity,
                "side": t.side,
                "symbol": t.symbol,
                "entry_time": t.entry_time.isoformat() + "Z" if t.entry_time else None,
                "exit_time": t.exit_time.isoformat() + "Z" if t.exit_time else None,
                "exit_reason": t.exit_reason,
                "pnl_percent": pnl_percent,
            }
        )
    return payload


def _delta(manual: Optional[float], strategy: Optional[float]) -> Optional[float]:
    """İki metriğin farkı (strateji − manuel). Biri yoksa `None`."""
    if manual is None or strategy is None:
        return None
    return round(strategy - manual, 4)


def build_comparison(
    manual_report: dict[str, Any],
    strategy_result: dict[str, Any],
    symbol: str,
    timeframe: str,
    window: tuple[datetime, datetime],
) -> dict[str, Any]:
    """İki tarafın raporunu ve aralarındaki farkı tek bir yanıta toplar.

    `verdict` kullanıcının tek bakışta okuyacağı özet: aynı pencerede kim daha
    iyi yaptı. Ölçü AĞIRLIKLI YÜZDESEL GETİRİdir, net kâr değil — iki taraf
    aynı tutarı riske atmıyor (modül başlığındaki gerekçe). Win rate de
    kullanılmaz: çok sayıda küçük kazanç, az sayıda büyük kaybı gizler.

    Ağırlıklı getiri hesaplanamıyorsa (fiyat/miktar eksik) net kâra düşülür;
    o durumda karşılaştırma yine de gösterilir ama ölçü zayıftır.
    """
    strategy_report = strategy_result.get("performance") or {}

    manual_return = manual_report.get("weighted_return_pct")
    strategy_return = strategy_report.get("weighted_return_pct")

    # Ağırlıklı getiri yoksa (miktar/fiyat eksik) net kâra düş.
    if manual_return is None or strategy_return is None:
        manual_return = manual_report.get("net_profit")
        strategy_return = strategy_report.get("net_profit")

    verdict = "belirsiz"
    if manual_return is not None and strategy_return is not None:
        if abs(strategy_return - manual_return) < 1e-9:
            verdict = "berabere"
        elif strategy_return > manual_return:
            verdict = "strateji"
        else:
            verdict = "manuel"

    return {
        "symbol": symbol,
        "timeframe": timeframe,
        "window": {
            "start": window[0].isoformat() + "Z",
            "end": window[1].isoformat() + "Z",
        },
        "manual": manual_report,
        "strategy": {
            "performance": strategy_report,
            "total_trades": strategy_result.get("total_trades", 0),
            "total_pnl_percent": strategy_result.get("total_pnl_percent", 0.0),
            "signals": strategy_result.get("signals", []),
            "buy_and_hold": strategy_result.get("buy_and_hold"),
        },
        # Pozitif = strateji önde.
        "delta": {
            # Asıl kıyas ölçüsü: pozisyon büyüklüğünden bağımsız getiri.
            "weighted_return_pct": _delta(
                manual_report.get("weighted_return_pct"),
                strategy_report.get("weighted_return_pct"),
            ),
            # Net kâr bilgi olarak kalıyor ama TEK BAŞINA okunmamalı: iki taraf
            # aynı sermayeyi bağlamıyor (bkz. modül başlığı).
            "net_profit": _delta(
                manual_report.get("net_profit"), strategy_report.get("net_profit")
            ),
            "win_rate": _delta(manual_report.get("win_rate"), strategy_report.get("win_rate")),
            "profit_factor": _delta(
                manual_report.get("profit_factor"), strategy_report.get("profit_factor")
            ),
            "max_drawdown_pct": _delta(
                manual_report.get("max_drawdown_pct"), strategy_report.get("max_drawdown_pct")
            ),
            "total_trades": _delta(
                manual_report.get("total_trades"), strategy_report.get("total_trades")
            ),
        },
        "verdict": verdict,
    }
