"""
Emir gerçekleşme maliyetleri ve pozisyon boyutlandırma.

Bu modül tamamen saf (pure) fonksiyonlardan oluşur: veritabanı, HTTP ve grafik
bilgisi yoktur. Hem otomatik backtest (`rules/engine.py`) hem manuel backtest
(`engines/replay_engine.py` + `journal/`) aynı hesabı kullanır — iki tarafın
farklı sayı üretmesi karşılaştırmayı anlamsız kılardı (RULES.md #3, #8).

**Neden gerekli:** maliyetler eklenmeden önce her işlem sıfır maliyetle
gerçekleşiyordu. Bu, işlem sayısı arttıkça sonucun İŞARETİNİ değiştiren bir
hatadır: 200 işlem üreten bir strateji binde 1 komisyonla brüt %40 kârdan net
%0 civarına düşer. Az işlem yapan stratejilerde fark küçük, çok işlem
yapanlarda belirleyicidir — ve optimizer tam da çok işlem yapan parametreleri
seçmeye eğilimlidir.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from math import isfinite
from typing import Any, Mapping, Optional, Sequence

# Baz puan (basis point): 1 bps = %0,01. Komisyon oranları bu birimde tutulur,
# çünkü gerçek oranlar küçük (Binance spot taker %0,1 = 10 bps) ve yüzdeyle
# yazmak virgülden sonra sıfır saymaya dönüşüyor.
BPS = 10_000.0


@dataclass(frozen=True)
class ExecutionCosts:
    """İşlem başına maliyetler.

    `commission_bps`: her BACAK için alınan komisyon (giriş + çıkış = iki bacak).
    `slippage_bps`: emrin istenen fiyattan ne kadar kötü dolduğu. Alışta yukarı,
    satışta aşağı uygulanır — yani her zaman aleyhe.
    """

    commission_bps: float = 0.0
    slippage_bps: float = 0.0

    @property
    def commission_rate(self) -> float:
        return max(self.commission_bps, 0.0) / BPS

    @property
    def slippage_rate(self) -> float:
        return max(self.slippage_bps, 0.0) / BPS

    @property
    def is_zero(self) -> bool:
        return self.commission_bps <= 0 and self.slippage_bps <= 0

    @classmethod
    def from_strategy(cls, strategy: Mapping[str, Any], params: Mapping[str, Any] | None = None):
        """Strateji sözlüğünden (ve varsa parametre override'larından) okur."""
        params = params or {}
        commission = params.get("commission_bps", strategy.get("commission_bps"))
        slippage = params.get("slippage_bps", strategy.get("slippage_bps"))
        return cls(
            commission_bps=float(commission) if commission is not None else 0.0,
            slippage_bps=float(slippage) if slippage is not None else 0.0,
        )


def fill_price(price: float, is_buy: bool, costs: ExecutionCosts) -> float:
    """Slipaj uygulanmış gerçekleşme fiyatı.

    Alış emirleri istenen fiyatın ÜSTÜNDE, satış emirleri ALTINDA dolar.
    Slipajı fiyata gömmek, yüzdesel kâr/zarar hesabına kendiliğinden yansımasını
    sağlar; ayrıca grafikte gösterilen gerçekleşme fiyatı da doğru olur.
    """
    if costs.slippage_rate <= 0:
        return float(price)
    direction = 1.0 if is_buy else -1.0
    return float(price) * (1.0 + direction * costs.slippage_rate)


LONG_SIDE = "long"


def level_fill_price(side: str, level: float, bar_open: float, is_stop: bool) -> float:
    """Seviyeye dokunan koşullu emrin (TP/SL) GERÇEKLEŞME fiyatı.

    Eskiden hem otomatik hem manuel backtest, çıkışı her zaman TAM seviyeden
    yazıyordu. Mum seviyenin ötesinde AÇTIĞINDA bu imkânsız bir fiyattır:
    giriş 100, stop 95, sonraki mum 60'tan açıyorsa emir 95'ten değil 60'tan
    dolar. Sonuç, her kaybeden işleme `-stop_loss_pct` diye yapay bir taban
    koymaktı — stop kullanan hiçbir stratejinin gerçek kuyruk riski
    görünmüyordu ve backtest sistematik olarak iyimser çıkıyordu.

    Kural: emir mumun AÇILIŞINDA zaten tetiklenmişse açılıştan, mum içinde
    tetiklenmişse seviyeden dolar. Bu, aleyhe boşlukları (stop) cezalandırırken
    lehe boşlukları (kâr al) da hakkıyla verir — ikisi de gerçekte olan şeydir.

    `bar_open` verilmezse (0/None) seviyeye düşülür: açılış bilinmeden boşluk
    tespit edilemez ve eski davranış korunur.
    """
    if not bar_open or bar_open <= 0:
        return float(level)

    # long+stop ve short+kâr al aşağıdan, diğer ikisi yukarıdan tetiklenir.
    take_lower = (str(side).lower() == LONG_SIDE) == bool(is_stop)
    return float(min(level, bar_open) if take_lower else max(level, bar_open))


def round_trip_commission_pct(costs: ExecutionCosts) -> float:
    """Bir gidiş-dönüş işlemin komisyon yükü — giriş notional'ının yüzdesi olarak.

    İki bacak (giriş + çıkış) için alınır. Çıkış notional'ı girişten farklıdır
    ama komisyon oranları küçük olduğu için giriş üzerinden yaklaşık hesap,
    yüzde ikinci ondalığında bile fark üretmez; karşılığında hesap tek satır
    kalır ve iki motorda da aynı şekilde uygulanabilir.
    """
    return costs.commission_rate * 2.0 * 100.0


def net_pnl_percent(
    side: str,
    entry_price: float,
    exit_price: float,
    costs: ExecutionCosts,
) -> float:
    """Maliyetler düşülmüş yüzdesel kâr/zarar.

    `entry_price`/`exit_price` slipaj UYGULANMIŞ fiyatlardır (bkz. `fill_price`);
    burada yalnızca komisyon düşülür. İkisini tek fonksiyonda toplamak, çağıran
    tarafın slipajı iki kez uygulamasına yol açıyordu.
    """
    if entry_price <= 0:
        return 0.0
    if side == "short":
        gross = (entry_price - exit_price) / entry_price * 100.0
    else:
        gross = (exit_price - entry_price) / entry_price * 100.0
    return gross - round_trip_commission_pct(costs)


# ─── Pozisyon Boyutlandırma ───────────────────────────────────────────────────


class SizingMode(str, Enum):
    """Pozisyon büyüklüğünün nasıl belirleneceği."""

    # Her işlemde sabit adet/lot. En basit; bakiyeden bağımsızdır.
    FIXED_UNITS = "fixed_units"
    # Her işlemde sabit tutar (ör. her zaman 1.000 TL'lik al).
    FIXED_CASH = "fixed_cash"
    # Mevcut bakiyenin yüzdesi. Bileşik büyüme burada devreye girer.
    PERCENT_EQUITY = "percent_equity"
    # Bakiyenin yüzdesi kadar RİSK al; miktar stop mesafesinden hesaplanır.
    # Disiplinli test için en anlamlısı: her işlemde kaybedilecek tutar sabit.
    RISK_PERCENT = "risk_percent"


@dataclass(frozen=True)
class PositionSizing:
    """Boyutlandırma kuralı."""

    mode: SizingMode = SizingMode.PERCENT_EQUITY
    # Anlamı moda göre değişir: adet / tutar / yüzde / risk yüzdesi.
    value: float = 100.0

    def __post_init__(self):
        if not isfinite(self.value) or self.value <= 0:
            raise ValueError("Pozisyon büyüklüğü sonlu ve pozitif olmalıdır")

    @classmethod
    def from_dict(cls, data: Mapping[str, Any] | None):
        if not data:
            return cls()
        raw_mode = data.get("mode", SizingMode.PERCENT_EQUITY.value)
        try:
            mode = SizingMode(raw_mode)
        except ValueError:
            raise ValueError(
                f"Bilinmeyen pozisyon boyutlandırma modu: {raw_mode}. "
                f"Desteklenen: {[m.value for m in SizingMode]}"
            )
        return cls(mode=mode, value=float(data.get("value", 100.0)))


def position_quantity(
    sizing: PositionSizing,
    equity: float,
    entry_price: float,
    stop_price: Optional[float] = None,
) -> float:
    """Bir işlemde alınacak miktarı hesaplar.

    `RISK_PERCENT` modu stop seviyesi ister: miktar, stop'a kadar düşüldüğünde
    kaybedilecek tutar bakiyenin `value` yüzdesi olacak şekilde seçilir. Stop
    verilmemişse hata döner; başka bir boyutlandırma sessizce uygulanmaz.
    """
    if entry_price <= 0 or equity <= 0:
        return 0.0

    if sizing.mode == SizingMode.FIXED_UNITS:
        return min(sizing.value, equity / entry_price)

    if sizing.mode == SizingMode.FIXED_CASH:
        return min(sizing.value, equity) / entry_price

    if sizing.mode == SizingMode.PERCENT_EQUITY:
        cash = equity * max(sizing.value, 0.0) / 100.0
        return min(cash, equity) / entry_price

    # RISK_PERCENT
    if stop_price is None or not isfinite(stop_price) or stop_price <= 0:
        raise ValueError("Risk yüzdesiyle boyutlandırma için geçerli stop seviyesi zorunludur")

    risk_per_unit = abs(entry_price - stop_price)
    if risk_per_unit <= 0:
        raise ValueError("Stop seviyesi giriş fiyatından farklı olmalıdır")

    risk_cash = equity * max(sizing.value, 0.0) / 100.0
    quantity = risk_cash / risk_per_unit

    # Kaldıraç yok: pozisyon bakiyeyi aşamaz.
    max_quantity = equity / entry_price
    return min(quantity, max_quantity)


def simulate_account(
    trades: Sequence[Mapping[str, Any]],
    starting_balance: float = 10_000.0,
    sizing: PositionSizing | None = None,
) -> dict[str, Any]:
    """Kapanmış işlemleri sırayla uygulayıp nakit bazlı sonuç üretir.

    Girdi işlemleri en azından `entry_price`, `exit_price` ve `side` içerir;
    `pnl_percent` verilmişse (maliyetler düşülmüş olarak) o kullanılır, aksi
    halde fiyatlardan hesaplanır.

    Çıktı, `reports/performance_report.calculate_performance`'a doğrudan
    beslenebilecek biçimdedir: her işlem `pnl` (hesap para birimi), `quantity`
    ve `entry_price` taşır. Böylece otomatik ve manuel backtest aynı rapor
    fonksiyonundan geçer.
    """
    sizing = sizing or PositionSizing()
    equity = float(starting_balance)
    priced: list[dict[str, Any]] = []

    for trade in trades:
        entry = float(trade.get("entry_price") or 0.0)
        exit_price = float(trade.get("exit_price") or 0.0)
        side = str(trade.get("side", "long")).lower()
        if entry <= 0:
            continue

        pnl_pct = trade.get("pnl_percent")
        if pnl_pct is None:
            pnl_pct = (
                (entry - exit_price) / entry * 100.0
                if side == "short"
                else (exit_price - entry) / entry * 100.0
            )

        quantity = position_quantity(sizing, equity, entry, trade.get("stop_price"))
        # Nakit kâr/zarar: bağlanan sermayenin yüzdesel getirisi.
        pnl_cash = quantity * entry * float(pnl_pct) / 100.0
        equity += pnl_cash

        priced.append({
            **dict(trade),
            "quantity": quantity,
            "pnl": pnl_cash,
            "pnl_percent": float(pnl_pct),
            "equity_after": equity,
        })

        # Bakiye tükendiyse sonraki işlemler açılamaz.
        if equity <= 0:
            equity = 0.0
            break

    return {
        "starting_balance": float(starting_balance),
        "ending_balance": equity,
        "trades": priced,
    }


# Portföy testinde aynı anda taşınabilecek varsayılan pozisyon sayısı.
# Sınırsız bırakmak "her sinyale gir" demek olurdu; bu da tek sembollü testlerin
# toplamından farksız, gerçekte ise mümkün olmayan bir sonuç üretir.
DEFAULT_MAX_CONCURRENT_POSITIONS = 5


def simulate_portfolio(
    trades_by_symbol: Mapping[str, Sequence[Mapping[str, Any]]],
    starting_balance: float = 10_000.0,
    sizing: PositionSizing | None = None,
    max_concurrent_positions: int = DEFAULT_MAX_CONCURRENT_POSITIONS,
) -> dict[str, Any]:
    """Birden fazla sembolü TEK bir hesapla, kronolojik olarak simüle eder.

    Toplu tarama sembolleri birbirinden bağımsız test eder: her biri sanki tüm
    sermaye ona ayrılmış gibi hesaplanır. Bu, "10 sembolde %30 kazandım"
    yanılsaması üretir — gerçekte o 10 pozisyon aynı parayı paylaşır ve
    bazılarına hiç girilemez.

    Burada işlemler GİRİŞ zamanına göre sıralanır ve tek bir bakiye üzerinden
    yürütülür:
      * Aynı anda en fazla `max_concurrent_positions` pozisyon taşınır.
      * Sınır doluyken gelen sinyal ATLANIR ve `skipped_trades` içinde sayılır —
        sessizce dahil etmek portföy kısıtını anlamsız kılardı.
      * Pozisyon büyüklüğü, o an SERBEST olan nakde göre hesaplanır.

    Giriş/çıkış zamanı olmayan işlemler atlanır: kronolojik sıra kurulamadan
    portföy simülasyonu yapılamaz.
    """
    sizing = sizing or PositionSizing()

    # Tüm sembollerin işlemlerini tek listede topla.
    pending: list[dict[str, Any]] = []
    for symbol, trades in trades_by_symbol.items():
        for trade in trades:
            entry_ts = trade.get("entry_timestamp")
            if entry_ts is None:
                continue
            pending.append({**dict(trade), "symbol": symbol})

    pending.sort(key=lambda t: (t["entry_timestamp"], t["symbol"]))

    equity = float(starting_balance)
    # Bağlı sermaye: (çıkış_zamanı, tutar, işlem)
    open_positions: list[dict[str, Any]] = []
    closed: list[dict[str, Any]] = []
    skipped = 0

    def _close_until(now_ts: int) -> None:
        """`now_ts`'e kadar kapanmış pozisyonların sonucunu bakiyeye işler."""
        nonlocal equity
        still_open = []
        for position in sorted(open_positions, key=lambda p: (p.get("exit_timestamp") is None, p.get("exit_timestamp") or 0, p["symbol"])):
            if position.get("exit_timestamp") is not None and position["exit_timestamp"] <= now_ts:
                equity += position["pnl"]
                closed.append({**position, "equity_after": equity})
            else:
                still_open.append(position)
        open_positions[:] = still_open

    for trade in pending:
        _close_until(trade["entry_timestamp"])

        if len(open_positions) >= max_concurrent_positions:
            skipped += 1
            continue

        entry = float(trade.get("entry_price") or 0.0)
        if entry <= 0:
            continue

        # Serbest nakit: toplam bakiyeden hâlâ açık pozisyonlara bağlı kısım düşülür.
        committed = sum(p["capital"] for p in open_positions)
        available = max(equity - committed, 0.0)
        if available <= 0:
            skipped += 1
            continue

        quantity = position_quantity(sizing, available, entry, trade.get("stop_price"))
        capital = quantity * entry
        if capital <= 0:
            skipped += 1
            continue

        pnl_pct = float(trade.get("pnl_percent") or 0.0)
        open_positions.append({
            **trade,
            "quantity": quantity,
            "capital": capital,
            "pnl": capital * pnl_pct / 100.0,
        })

    # Yalnızca veri içinde gerçekten kapananlar gerçekleşir.
    _close_until(max((p["exit_timestamp"] for p in open_positions if p.get("exit_timestamp") is not None), default=0))

    closed.sort(key=lambda t: t["exit_timestamp"])

    return {
        "starting_balance": float(starting_balance),
        "ending_balance": equity,
        "max_concurrent_positions": max_concurrent_positions,
        "total_signals": len(pending),
        # Portföy kısıtı yüzünden girilemeyen sinyaller. Yüksekse sınır
        # stratejinin sinyal üretimine göre çok dar demektir.
        "skipped_trades": skipped,
        "open_positions": open_positions,
        "committed_capital": sum(p["capital"] for p in open_positions),
        "available_cash": max(equity - sum(p["capital"] for p in open_positions), 0.0),
        "trades": closed,
    }
