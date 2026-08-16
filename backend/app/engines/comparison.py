"""
Manuel backtest ile otomatik strateji sonucunun karşılaştırılması.

Platformun asıl iddiası bu: "TradingView klonu değil; manuel backtest ve
strateji araştırması odaklı" (roadmap.md). İki motor da vardı, aynı veriyi
işliyorlardı, aynı sinyal biçimini üretiyorlardı — ama hiçbir yerde yan yana
konmuyorlardı.

Karşılaştırmanın adil olması iki şeye bağlı ve ikisi de artık sağlanıyor:

  1. **Aynı pencere.** Strateji, manuel oturumun ilk girişinden son çıkışına
     kadar olan aralıkta çalıştırılır. Farklı aralık, farklı piyasa demektir.
  2. **Aynı ölçü.** İki taraf da `reports/performance_report.calculate_performance`
     fonksiyonundan geçer ve aynı başlangıç bakiyesini kullanır. Manuel taraf
     `pnl`'i gerçek miktardan, strateji tarafı nakit simülasyonundan alır.

Emir gerçekleşme konvansiyonu da ortaktır (`bar_delay`, TP/SL'nin gecikmeye
tabi olmaması, komisyon/slipaj) — aksi halde fark stratejiden değil
varsayımlardan gelirdi.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Optional, Sequence

from app.database.models import JournalTrade


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


def manual_trades_payload(trades: Sequence[JournalTrade]) -> list[dict]:
    """Manuel işlemleri rapor fonksiyonunun beklediği biçime çevirir."""
    return [
        {
            "pnl": t.pnl,
            "entry_price": t.entry_price,
            "quantity": t.quantity,
            "side": t.side,
            "symbol": t.symbol,
            "entry_time": t.entry_time.isoformat() + "Z" if t.entry_time else None,
            "exit_time": t.exit_time.isoformat() + "Z" if t.exit_time else None,
            "exit_reason": t.exit_reason,
            "pnl_percent": t.pnl_percent,
        }
        for t in trades
    ]


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

    `verdict` kullanıcının tek bakışta okuyacağı özet: aynı pencerede kim
    daha iyi yaptı. Kâr karşılaştırması net kâr üzerinden yapılır — win rate
    yanıltıcıdır (çok sayıda küçük kazanç, az sayıda büyük kaybı gizler).
    """
    strategy_report = strategy_result.get("performance") or {}

    manual_profit = manual_report.get("net_profit")
    strategy_profit = strategy_report.get("net_profit")

    verdict = "belirsiz"
    if manual_profit is not None and strategy_profit is not None:
        if abs(strategy_profit - manual_profit) < 1e-9:
            verdict = "berabere"
        elif strategy_profit > manual_profit:
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
            "net_profit": _delta(manual_profit, strategy_profit),
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
