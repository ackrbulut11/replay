"""
Replay yürütme motoru — manuel backtest sırasında pozisyon yaşam döngüsü.

Kullanıcı replay oynatırken elle long/short pozisyon açar, stop-loss ve
take-profit belirler; mumlar ilerledikçe bu seviyelerin tetiklenip
tetiklenmediği burada kontrol edilir.

Bu modül saf (pure) fonksiyonlardan oluşur: veritabanı, HTTP ve grafik
bilgisi yoktur. Finansal hesap arayüze yazılmaz (RULES.md "Yasaklar"),
kalıcılık ise journal katmanının işidir.

`rules/engine.py` ile aynı iki konvansiyonu korur (RULES.md §3, §8):

  1. **Aynı mumda hem SL hem TP tetiklenirse SL kazanır.** Mum içi (intrabar)
     fiyat sırası bilinmediğinden kötü senaryo varsayılır; aksi halde
     backtest sonuçları sistematik olarak iyimser çıkar.
  2. **Çıkış fiyatı SL/TP seviyesidir — mum o seviyenin ötesinde AÇMADIYSA.**
     Emrin tam seviyeden dolduğu varsayılır; ama mum seviyeyi atlayarak
     açtıysa (boşluk/gap) emir açılıştan dolar. Ortak hesap
     `engines/execution.level_fill_price` içindedir ve strateji motoruyla
     paylaşılır — aksi halde manuel taraf her zaman tam seviyeden çıkıp
     otomatik tarafa göre yapay olarak korunaklı görünürdü.

Lookahead bias yoktur (RULES.md §19-21): her kontrol yalnızca o anki muma
bakar, sonraki mumlara erişmez.
"""

from __future__ import annotations

from typing import Any, Mapping, Optional

from app.engines.execution import level_fill_price

# Açık bir pozisyon ya da kapanmış bir işlem — düz sözlük olarak taşınır
# (rule engine'in strateji sözlüğü alması gibi).
Position = Mapping[str, Any]
Bar = Mapping[str, Any]

LONG = "long"
SHORT = "short"

# Kapanış sebepleri
REASON_STOP_LOSS = "stop_loss"
REASON_TAKE_PROFIT = "take_profit"
REASON_MANUAL = "manual"


def calculate_pnl(side: str, entry_price: float, exit_price: float, quantity: float = 1.0) -> float:
    """
    Kapanmış bir pozisyonun kâr/zararı (hesap para biriminde).

    Long'da fiyat artışı, short'ta fiyat düşüşü kâr getirir.
    """
    if side == LONG:
        return (exit_price - entry_price) * quantity
    if side == SHORT:
        return (entry_price - exit_price) * quantity
    raise ValueError(f"Geçersiz pozisyon yönü: {side!r} (beklenen: {LONG!r} veya {SHORT!r})")


def calculate_pnl_percent(side: str, entry_price: float, exit_price: float) -> float:
    """
    Kâr/zarar yüzdesi — giriş fiyatına göre.

    Miktardan bağımsızdır; `rules/engine.py` de sinyalleri bu biçimde raporlar.
    """
    if entry_price <= 0:
        raise ValueError("Giriş fiyatı sıfır veya negatif olamaz")
    if side == LONG:
        return (exit_price - entry_price) / entry_price * 100.0
    if side == SHORT:
        return (entry_price - exit_price) / entry_price * 100.0
    raise ValueError(f"Geçersiz pozisyon yönü: {side!r}")


def validate_levels(
    side: str,
    entry_price: float,
    stop_loss: Optional[float],
    take_profit: Optional[float],
) -> None:
    """
    Stop-loss / take-profit seviyelerinin giriş fiyatına göre doğru tarafta
    olduğunu doğrular; değilse `ValueError` fırlatır.

    Ters tarafa konmuş bir seviye açılış anında tetiklenir ve pozisyon daha
    ilk mumda kapanır — sessizce kabul etmek yerine erken hata vermek daha
    iyidir.
    """
    if side not in (LONG, SHORT):
        raise ValueError(f"Geçersiz pozisyon yönü: {side!r}")
    if entry_price <= 0:
        raise ValueError("Giriş fiyatı sıfır veya negatif olamaz")

    if side == LONG:
        if stop_loss is not None and stop_loss >= entry_price:
            raise ValueError("Long pozisyonda stop-loss giriş fiyatının altında olmalı")
        if take_profit is not None and take_profit <= entry_price:
            raise ValueError("Long pozisyonda take-profit giriş fiyatının üstünde olmalı")
    else:
        if stop_loss is not None and stop_loss <= entry_price:
            raise ValueError("Short pozisyonda stop-loss giriş fiyatının üstünde olmalı")
        if take_profit is not None and take_profit >= entry_price:
            raise ValueError("Short pozisyonda take-profit giriş fiyatının altında olmalı")


def open_position(
    side: str,
    entry_price: float,
    bar_index: int,
    quantity: float = 1.0,
    stop_loss: Optional[float] = None,
    take_profit: Optional[float] = None,
    entry_time: Optional[Any] = None,
) -> dict[str, Any]:
    """
    Yeni bir pozisyon açar ve pozisyon sözlüğünü döndürür.

    Seviyeler doğrulanır; miktar pozitif olmalıdır.
    """
    if quantity <= 0:
        raise ValueError("Miktar sıfır veya negatif olamaz")
    validate_levels(side, entry_price, stop_loss, take_profit)

    return {
        "side": side,
        "entry_price": float(entry_price),
        "quantity": float(quantity),
        "stop_loss": float(stop_loss) if stop_loss is not None else None,
        "take_profit": float(take_profit) if take_profit is not None else None,
        "entry_bar_index": int(bar_index),
        "entry_time": entry_time,
    }


def levels_from_percent(
    side: str,
    entry_price: float,
    stop_loss_pct: Optional[float] = None,
    take_profit_pct: Optional[float] = None,
) -> tuple[Optional[float], Optional[float]]:
    """
    Yüzdesel SL/TP'yi mutlak fiyat seviyesine çevirir.

    Strateji motoru yüzdeyle çalışır (`take_profit_pct`), manuel replay ise
    grafikte sürüklenen mutlak seviyeyle. İki tarafın aynı sayıyı üretmesi
    için dönüşüm tek yerde tutulur (RULES.md §8).
    """
    if entry_price <= 0:
        raise ValueError("Giriş fiyatı sıfır veya negatif olamaz")
    if side not in (LONG, SHORT):
        raise ValueError(f"Geçersiz pozisyon yönü: {side!r}")

    direction = 1.0 if side == LONG else -1.0
    stop_loss = (
        entry_price * (1.0 - direction * stop_loss_pct / 100.0)
        if stop_loss_pct is not None and stop_loss_pct > 0
        else None
    )
    take_profit = (
        entry_price * (1.0 + direction * take_profit_pct / 100.0)
        if take_profit_pct is not None and take_profit_pct > 0
        else None
    )
    return stop_loss, take_profit


def check_exit(position: Position, bar: Bar) -> Optional[tuple[float, str]]:
    """
    Verilen mumda stop-loss veya take-profit tetiklendi mi?

    Tetiklendiyse `(çıkış_fiyatı, sebep)`, tetiklenmediyse `None` döner.
    Aynı mumda ikisi de tetiklenirse stop-loss kazanır (modül başlığındaki
    1. konvansiyon).

    Çıkış fiyatı boşluk (gap) farkındalıdır: mum seviyenin ötesinde açtıysa
    emir açılıştan dolar (2. konvansiyon). Mumda `open` yoksa seviyeye
    düşülür — açılış bilinmeden boşluk tespit edilemez.
    """
    side = position["side"]
    stop_loss = position.get("stop_loss")
    take_profit = position.get("take_profit")

    high = float(bar["high"])
    low = float(bar["low"])
    raw_open = bar.get("open")
    bar_open = float(raw_open) if raw_open is not None else 0.0

    if side == LONG:
        if stop_loss is not None and low <= stop_loss:
            return level_fill_price(LONG, stop_loss, bar_open, is_stop=True), REASON_STOP_LOSS
        if take_profit is not None and high >= take_profit:
            return level_fill_price(LONG, take_profit, bar_open, is_stop=False), REASON_TAKE_PROFIT
        return None

    if side == SHORT:
        if stop_loss is not None and high >= stop_loss:
            return level_fill_price(SHORT, stop_loss, bar_open, is_stop=True), REASON_STOP_LOSS
        if take_profit is not None and low <= take_profit:
            return level_fill_price(SHORT, take_profit, bar_open, is_stop=False), REASON_TAKE_PROFIT
        return None

    raise ValueError(f"Geçersiz pozisyon yönü: {side!r}")


def unrealized_pnl(position: Position, current_price: float) -> dict[str, float]:
    """Açık pozisyonun anlık (gerçekleşmemiş) kâr/zararı: tutar ve yüzde."""
    side = position["side"]
    entry_price = float(position["entry_price"])
    quantity = float(position.get("quantity", 1.0))

    return {
        "pnl": calculate_pnl(side, entry_price, current_price, quantity),
        "pnl_percent": calculate_pnl_percent(side, entry_price, current_price),
    }


def close_position(
    position: Position,
    exit_price: float,
    bar_index: int,
    reason: str = REASON_MANUAL,
    exit_time: Optional[Any] = None,
) -> dict[str, Any]:
    """
    Pozisyonu kapatır ve kapanmış işlem sözlüğünü döndürür.

    Çıktı, `reports/performance_report.py`'nin beklediği `pnl` alanını
    içerir; böylece kapanan işlemler doğrudan rapora beslenebilir.
    """
    side = position["side"]
    entry_price = float(position["entry_price"])
    quantity = float(position.get("quantity", 1.0))

    return {
        "side": side,
        "entry_price": entry_price,
        "exit_price": float(exit_price),
        "quantity": quantity,
        "stop_loss": position.get("stop_loss"),
        "take_profit": position.get("take_profit"),
        "entry_bar_index": position.get("entry_bar_index"),
        "exit_bar_index": int(bar_index),
        "entry_time": position.get("entry_time"),
        "exit_time": exit_time,
        "exit_reason": reason,
        "pnl": calculate_pnl(side, entry_price, exit_price, quantity),
        "pnl_percent": calculate_pnl_percent(side, entry_price, exit_price),
    }


def advance_bar(position: Optional[Position], bar: Bar, bar_index: int) -> dict[str, Any]:
    """
    Replay bir mum ilerlediğinde çağrılır.

    Açık pozisyon yoksa ya da hiçbir seviye tetiklenmediyse pozisyon olduğu
    gibi kalır; tetiklendiyse pozisyon kapatılır ve kapanan işlem döner.

    Dönen sözlük: `{"position": açık pozisyon ya da None, "closed_trade": ... ya da None}`
    """
    if position is None:
        return {"position": None, "closed_trade": None}

    hit = check_exit(position, bar)
    if hit is None:
        return {"position": dict(position), "closed_trade": None}

    exit_price, reason = hit
    closed = close_position(
        position,
        exit_price=exit_price,
        bar_index=bar_index,
        reason=reason,
        exit_time=bar.get("timestamp"),
    )
    return {"position": None, "closed_trade": closed}
