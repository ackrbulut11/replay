"""
Performans hesaplama motoru — Win Rate, Profit Factor, Sharpe, Drawdown vb.

Bu modül tamamen saf (pure) fonksiyonlardan oluşur: aynı girdi → aynı çıktı,
yan etki yok, veritabanı/HTTP bilgisi yok (SKILLS.md "Genel"). Girdi olarak
kapanmış işlemlerin listesini alır; her işlem en azından `pnl` alanını
içeren bir sözlüktür (rule engine'in düz sözlük alması gibi).

JSON güvenliği: hiçbir metrik `inf` veya `nan` döndürmez — tanımsız olduğu
durumlarda (ör. hiç zarar eden işlem yokken Profit Factor) `None` döner.
`float('inf')` JSON'a serialize edilemez ve arayüzde patlardı.
"""

from __future__ import annotations

import math
import statistics
from typing import Any, Mapping, Optional, Sequence

# Kapanmış tek bir işlem. En az `pnl` (kâr/zarar, hesap para biriminde) içerir.
Trade = Mapping[str, Any]


def extract_pnls(trades: Sequence[Trade]) -> list[float]:
    """
    İşlem listesinden geçerli `pnl` değerlerini çıkarır.

    Eksik/None/NaN/sonsuz pnl'ler sessizce atlanır: tek bozuk kayıt yüzünden
    tüm raporun NaN'a dönüşmesi, hatalı satırı atlamaktan daha kötüdür.
    """
    values: list[float] = []
    for trade in trades:
        raw = trade.get("pnl")
        if raw is None:
            continue
        try:
            value = float(raw)
        except (TypeError, ValueError):
            continue
        if math.isnan(value) or math.isinf(value):
            continue
        values.append(value)
    return values


def net_profit(pnls: Sequence[float]) -> float:
    """Toplam net kâr/zarar."""
    return float(sum(pnls))


def gross_profit(pnls: Sequence[float]) -> float:
    """Yalnızca kazanan işlemlerin toplamı (pozitif)."""
    return float(sum(p for p in pnls if p > 0))


def gross_loss(pnls: Sequence[float]) -> float:
    """Yalnızca kaybeden işlemlerin toplamı — pozitif bir büyüklük olarak."""
    return float(abs(sum(p for p in pnls if p < 0)))


def win_rate(pnls: Sequence[float]) -> Optional[float]:
    """
    Kazanma oranı (%). İşlem yoksa `None`.

    Sıfır pnl'li (başabaş) işlemler ne kazanç ne kayıp sayılır ama paydaya
    dahildir; bu yüzden win_rate + loss_rate her zaman 100 etmez.
    """
    if not pnls:
        return None
    wins = sum(1 for p in pnls if p > 0)
    return wins / len(pnls) * 100.0


def loss_rate(pnls: Sequence[float]) -> Optional[float]:
    """Kaybetme oranı (%). İşlem yoksa `None`."""
    if not pnls:
        return None
    losses = sum(1 for p in pnls if p < 0)
    return losses / len(pnls) * 100.0


def profit_factor(pnls: Sequence[float]) -> Optional[float]:
    """
    Brüt kâr / brüt zarar.

    Hiç zarar eden işlem yoksa oran matematiksel olarak sonsuzdur; JSON'a
    yazılabilir bir değer olmadığı için `None` döner (arayüz bunu "—" ya da
    "∞" olarak gösterebilir).
    """
    losses = gross_loss(pnls)
    if losses <= 0:
        return None
    return gross_profit(pnls) / losses


def average_win(pnls: Sequence[float]) -> Optional[float]:
    """Kazanan işlemlerin ortalaması. Kazanan yoksa `None`."""
    wins = [p for p in pnls if p > 0]
    return sum(wins) / len(wins) if wins else None


def average_loss(pnls: Sequence[float]) -> Optional[float]:
    """Kaybeden işlemlerin ortalaması — pozitif büyüklük. Kaybeden yoksa `None`."""
    losses = [p for p in pnls if p < 0]
    return abs(sum(losses) / len(losses)) if losses else None


def expectancy(pnls: Sequence[float]) -> Optional[float]:
    """İşlem başına beklenen kâr/zarar (ortalama pnl). İşlem yoksa `None`."""
    if not pnls:
        return None
    return net_profit(pnls) / len(pnls)


def build_equity_curve(pnls: Sequence[float], starting_balance: float) -> list[float]:
    """
    Başlangıç bakiyesinden itibaren işlem işlem bakiye eğrisi.

    İlk eleman her zaman başlangıç bakiyesidir; böylece N işlem için N+1
    noktalı bir eğri oluşur ve ilk işlemin düşüşü de drawdown'a yansır.
    """
    curve = [float(starting_balance)]
    balance = float(starting_balance)
    for pnl in pnls:
        balance += pnl
        curve.append(balance)
    return curve


def max_drawdown(equity_curve: Sequence[float]) -> tuple[float, Optional[float]]:
    """
    Zirveden dibe en büyük düşüş: (mutlak tutar, yüzde).

    İki değer BAĞIMSIZ olarak takip edilir. Eskiden yüzde, yalnızca MUTLAK en
    büyük düşüşün olduğu noktada hesaplanıyordu; hesap büyüdükçe erken
    dönemdeki ağır yüzdesel düşüşler raporda kayboluyordu:

        [10.000, 5.000, 100.000, 80.000]
        eski  -> (20.000, %20)   # gerçek risk gizlendi
        yeni  -> (20.000, %50)   # %50'lik ilk düşüş görünür

    Bir risk metriğinin riski olduğundan küçük göstermesi, hiç göstermemesinden
    kötüdür. Zirve sıfır veya negatifse (hesap tamamen eridiyse) o noktanın
    yüzdesi tanımsızdır ve atlanır.
    """
    if not equity_curve:
        return 0.0, None

    peak = equity_curve[0]
    worst_abs = 0.0
    worst_pct: Optional[float] = None

    for value in equity_curve:
        if value > peak:
            peak = value
        drop = peak - value
        if drop > worst_abs:
            worst_abs = drop
        if drop > 0 and peak > 0:
            pct = drop / peak * 100.0
            if worst_pct is None or pct > worst_pct:
                worst_pct = pct

    return worst_abs, worst_pct


def trade_returns(pnls: Sequence[float], starting_balance: float) -> list[float]:
    """
    İşlem başına getiri oranı: pnl / (o işleme girilmeden önceki bakiye).

    Mutlak pnl yerine oransal getiri kullanılır; aksi halde bakiye büyüdükçe
    aynı yüzdelik kazanç daha büyük bir sapma gibi görünür ve Sharpe yanlış
    çıkar. Bakiye sıfıra düştüyse o işlemin oranı tanımsızdır ve atlanır.
    """
    returns: list[float] = []
    balance = float(starting_balance)
    for pnl in pnls:
        if balance > 0:
            returns.append(pnl / balance)
        balance += pnl
    return returns


def sharpe_ratio(
    returns: Sequence[float],
    risk_free_rate: float = 0.0,
    periods_per_year: Optional[float] = None,
) -> Optional[float]:
    """
    Sharpe oranı: (ortalama getiri - risksiz getiri) / getiri standart sapması.

    `periods_per_year` verilirse sonuç `sqrt(periods_per_year)` ile yıllıklandırılır.
    Varsayılan olarak yıllıklandırma YAPILMAZ: işlem bazlı bir seride yılda kaç
    işlem olduğu bilinmeden yapılan yıllıklandırma uydurma bir sayı üretir.

    En az 2 getiri gerekir (örneklem standart sapması için). Tüm getiriler
    birebir aynıysa sapma sıfırdır, oran tanımsızdır → `None`.
    """
    if len(returns) < 2:
        return None

    stdev = statistics.stdev(returns)  # ddof=1: örneklem standart sapması
    if stdev <= 0:
        return None

    ratio = (statistics.fmean(returns) - risk_free_rate) / stdev
    if periods_per_year is not None and periods_per_year > 0:
        ratio *= math.sqrt(periods_per_year)

    if math.isnan(ratio) or math.isinf(ratio):
        return None
    return ratio


def weighted_return_pct(trades: Sequence[Trade]) -> Optional[float]:
    """
    Pozisyon büyüklüğüne göre ağırlıklı toplam getiri yüzdesi.

    İşlemlerin yüzdelerini düz ortalamak YANLIŞ olurdu: 10 birimlik bir işlemde
    %10 kâr ile 1 birimlik bir işlemde %10 zarar, düz ortalamada birbirini
    götürüp %0 verirdi. Oysa bağlanan sermaye çok farklı. Bunun yerine toplam
    kâr/zarar, işlemlere bağlanan toplam sermayeye bölünür:

        toplam_pnl / toplam(giris_fiyati * miktar)

    Yukarıdaki örnekte sonuç ~%8,2 çıkar — yani büyük işlem sonucu domine eder.

    Sermaye toplamı hesaplanamıyorsa (fiyat/miktar eksik) `None` döner; sıfır
    dönmek "başabaş" ile "bilinmiyor"u karıştırırdı.
    """
    total_pnl = 0.0
    total_capital = 0.0

    for trade in trades:
        pnl = trade.get("pnl")
        entry = trade.get("entry_price")
        quantity = trade.get("quantity")

        if pnl is None or entry is None:
            continue
        try:
            pnl_value = float(pnl)
            capital = float(entry) * float(quantity if quantity is not None else 1.0)
        except (TypeError, ValueError):
            continue
        if not math.isfinite(pnl_value) or not math.isfinite(capital) or capital <= 0:
            continue

        total_pnl += pnl_value
        total_capital += capital

    if total_capital <= 0:
        return None
    return total_pnl / total_capital * 100.0


def compound_return_pct(percents: Sequence[float]) -> float:
    """
    Ardışık yüzdesel getirilerin BİLEŞİK toplamı.

    Yüzdeleri düz toplamak yanlış sonuç verir: +%50 ardından -%50 gerçekte
    -%25 ederken düz toplamda %0 görünür. Sapma işlem sayısıyla büyür, yani
    50 işlemli bir taramada sıralamayı bile bozabilir.

    Sermayenin tamamen erimesi (-%100) mutlak bir tabandır: sonraki işlemler
    bunu telafi edemez, sonuç -%100'de kalır.
    """
    growth = 1.0
    for pct in percents:
        try:
            value = float(pct)
        except (TypeError, ValueError):
            continue
        if not math.isfinite(value):
            continue

        growth *= 1.0 + value / 100.0
        if growth <= 0:
            return -100.0

    return (growth - 1.0) * 100.0


def calculate_performance(
    trades: Sequence[Trade],
    starting_balance: float = 10000.0,
    risk_free_rate: float = 0.0,
    periods_per_year: Optional[float] = None,
) -> dict[str, Any]:
    """
    Kapanmış işlem listesinden tam performans raporu üretir.

    Hiç işlem yoksa sayaçlar sıfır, oranlar `None` döner — çağıranın boş
    listeyi ayrıca kontrol etmesi gerekmez.
    """
    pnls = extract_pnls(trades)
    curve = build_equity_curve(pnls, starting_balance)
    drawdown_abs, drawdown_pct = max_drawdown(curve)
    profit = net_profit(pnls)

    return {
        "total_trades": len(pnls),
        "winning_trades": sum(1 for p in pnls if p > 0),
        "losing_trades": sum(1 for p in pnls if p < 0),
        "breakeven_trades": sum(1 for p in pnls if p == 0),
        "win_rate": win_rate(pnls),
        "loss_rate": loss_rate(pnls),
        "net_profit": profit,
        "net_profit_pct": (profit / starting_balance * 100.0) if starting_balance > 0 else None,
        # Sabit başlangıç bakiyesine değil, işlemlere fiilen bağlanan sermayeye
        # göre getiri — replay geçmişindeki "toplam durum" bunu gösterir.
        "weighted_return_pct": weighted_return_pct(trades),
        "gross_profit": gross_profit(pnls),
        "gross_loss": gross_loss(pnls),
        "profit_factor": profit_factor(pnls),
        "average_win": average_win(pnls),
        "average_loss": average_loss(pnls),
        "expectancy": expectancy(pnls),
        "largest_win": max(pnls) if pnls else None,
        "largest_loss": min(pnls) if pnls else None,
        "max_drawdown": drawdown_abs,
        "max_drawdown_pct": drawdown_pct,
        "sharpe_ratio": sharpe_ratio(
            trade_returns(pnls, starting_balance),
            risk_free_rate=risk_free_rate,
            periods_per_year=periods_per_year,
        ),
        "starting_balance": float(starting_balance),
        "ending_balance": curve[-1],
        "equity_curve": curve,
    }
