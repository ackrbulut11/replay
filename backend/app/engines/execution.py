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
    verilmemişse (stratejide `stop_loss_pct` yok) bu mod uygulanamaz ve
    bakiyenin tamamına düşülür — sessizce sıfır miktar üretmek işlemi hiç
    açılmamış gibi gösterirdi.
    """
    if entry_price <= 0 or equity <= 0:
        return 0.0

    if sizing.mode == SizingMode.FIXED_UNITS:
        return max(sizing.value, 0.0)

    if sizing.mode == SizingMode.FIXED_CASH:
        return max(sizing.value, 0.0) / entry_price

    if sizing.mode == SizingMode.PERCENT_EQUITY:
        cash = equity * max(sizing.value, 0.0) / 100.0
        return cash / entry_price

    # RISK_PERCENT
    if stop_price is None or stop_price <= 0:
        return equity / entry_price

    risk_per_unit = abs(entry_price - stop_price)
    if risk_per_unit <= 0:
        return equity / entry_price

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
