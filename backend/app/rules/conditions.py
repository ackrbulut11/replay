"""
Koşul Operatörleri.

Karşılaştırma ve çapraz kesişim operatörlerinin implementasyonu.
Her operatör (left, right, prev_left, prev_right) -> bool şeklinde çalışır.
"""

from __future__ import annotations

from typing import Callable


def gt(left: float, right: float, **_: float) -> bool:
    """Büyüktür (>)."""
    return left > right


def lt(left: float, right: float, **_: float) -> bool:
    """Küçüktür (<)."""
    return left < right


def gte(left: float, right: float, **_: float) -> bool:
    """Büyük eşit (>=)."""
    return left >= right


def lte(left: float, right: float, **_: float) -> bool:
    """Küçük eşit (<=)."""
    return left <= right


def eq(left: float, right: float, **_: float) -> bool:
    """Eşittir (==). Kayan nokta karşılaştırması için tolerans kullanır."""
    return abs(left - right) < 1e-10


def neq(left: float, right: float, **_: float) -> bool:
    """Eşit değildir (!=)."""
    return abs(left - right) >= 1e-10


def cross_above(
    left: float,
    right: float,
    prev_left: float | None = None,
    prev_right: float | None = None,
    **_: float,
) -> bool:
    """
    Yukarı kesişim (cross above).

    Sol değer, sağ değerin üstüne geçtiğinde True döner.
    Önceki barda sol <= sağ VE mevcut barda sol > sağ olmalı.
    """
    if prev_left is None or prev_right is None:
        return False
    return prev_left <= prev_right and left > right


def cross_below(
    left: float,
    right: float,
    prev_left: float | None = None,
    prev_right: float | None = None,
    **_: float,
) -> bool:
    """
    Aşağı kesişim (cross below).

    Sol değer, sağ değerin altına düştüğünde True döner.
    Önceki barda sol >= sağ VE mevcut barda sol < sağ olmalı.
    """
    if prev_left is None or prev_right is None:
        return False
    return prev_left >= prev_right and left < right


def rising(
    left: float,
    right: float,
    prev_left: float | None = None,
    **_: float,
) -> bool:
    """
    Yükseliyor (rising).

    Sol değer, `right` bar önceki değerinden BÜYÜKSE True. Karşılaştırma
    değeri `prev_left` olarak evaluator tarafından geçirilir (bkz.
    `RuleEvaluator.evaluate_condition`).

    "EMA20 son 3 barda yükseliyor" gibi trend yönü koşulları bunsuz
    yazılamıyordu; kullanıcı iki ayrı operandla elle kaydırma yapmak
    zorundaydı.
    """
    if prev_left is None:
        return False
    return left > prev_left


def falling(
    left: float,
    right: float,
    prev_left: float | None = None,
    **_: float,
) -> bool:
    """Düşüyor (falling) — `rising`'in tersi."""
    if prev_left is None:
        return False
    return left < prev_left


def between(
    left: float,
    right: float,
    right2: float | None = None,
    **_: float,
) -> bool:
    """
    Arada (between).

    Sol değer, sağ (alt sınır) ve right2 (üst sınır) arasındaysa True döner.
    Alt ve üst sınırlar dahil (inclusive).
    """
    if right2 is None:
        return False
    lower = min(right, right2)
    upper = max(right, right2)
    return lower <= left <= upper


# ─── Operatör Registry ────────────────────────────────────────────────────────

# Operatör adından fonksiyona eşleme tablosu
OPERATOR_REGISTRY: dict[str, Callable] = {
    ">": gt,
    "<": lt,
    ">=": gte,
    "<=": lte,
    "==": eq,
    "!=": neq,
    "cross_above": cross_above,
    "cross_below": cross_below,
    "between": between,
    # Sağ operand "kaç bar önceye göre" anlamına gelir, eşik değil.
    "rising": rising,
    "falling": falling,
}

# Sağ operandı bir eşik değil, GERİYE KAÇ BAR bakılacağı olan operatörler.
# Evaluator bunlar için sol operandı o kadar bar geriden bir kez daha çözer.
LOOKBACK_OPERATORS = frozenset({"rising", "falling"})


def get_operator(name: str) -> Callable:
    """Operatör adından fonksiyon döndürür."""
    func = OPERATOR_REGISTRY.get(name)
    if func is None:
        raise ValueError(
            f"Bilinmeyen operatör: {name}. "
            f"Desteklenen operatörler: {list(OPERATOR_REGISTRY.keys())}"
        )
    return func
