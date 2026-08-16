"""
Strateji kural ağacının kaydetme anında doğrulanması.

Eskiden bir strateji, tanımsız bir parametreye ya da var olmayan bir
göstergeye referans verse bile sorunsuz kaydediliyordu; hata ancak test
çalıştırılınca ortaya çıkıyordu — üstelik 500 olarak. Kullanıcı, düzenlemeyi
bitirip kaydettiği anda değil, dakikalar sonra veri indirme turunun sonunda
öğreniyordu.

Doğrulama YALNIZCA statik olarak bilinebilecek şeyleri kontrol eder: isimler,
alanlar, referanslar, sınırlar. Verinin yeterli olup olmadığı (ısınma, boş
sembol) çalışma zamanına aittir ve burada denenmez.
"""

from __future__ import annotations

from typing import Any, Iterable

from app.indicators.registry import INDICATOR_INFO, IndicatorRegistry
from app.rules.conditions import OPERATOR_REGISTRY
from app.rules.evaluator import MAX_EXPR_DEPTH, MAX_GROUP_DEPTH, is_condition_group

# `price` operandının okuyabileceği sütunlar.
VALID_PRICE_FIELDS = frozenset({"open", "high", "low", "close", "volume"})

# Operand tipleri (bkz. rules/evaluator.resolve_operand).
VALID_OPERAND_TYPES = frozenset({"indicator", "price", "value", "pnl", "pnl_percent", "expr"})

# Aritmetik işlemler (bkz. rules/evaluator.ARITHMETIC_OPS).
VALID_ARITHMETIC_OPS = frozenset({"+", "-", "*", "/"})


class StrategyValidationError(ValueError):
    """Kural ağacı geçersiz. `errors` insan tarafından okunabilir maddeler taşır."""

    def __init__(self, errors: list[str]):
        self.errors = errors
        super().__init__("; ".join(errors))


def validate_strategy(strategy: dict) -> list[str]:
    """Kural ağacını doğrular ve hata listesi döndürür (boşsa geçerli).

    Hata fırlatmak yerine liste döndürür: kullanıcıya tek tek "şunu da düzelt"
    demek yerine hepsini birden göstermek gerekiyor.
    """
    errors: list[str] = []
    param_names = _parameter_names(strategy, errors)

    groups: list[tuple[str, Any]] = [
        ("Giriş kuralları", strategy.get("entry_rules")),
        ("Çıkış kuralları", strategy.get("exit_rules")),
    ]
    for i, tf_filter in enumerate(strategy.get("timeframe_filters") or []):
        if not isinstance(tf_filter, dict) or not tf_filter.get("timeframe"):
            errors.append(f"Zaman dilimi filtresi #{i + 1}: 'timeframe' alanı zorunlu")
        groups.append((f"Zaman dilimi filtresi #{i + 1}", tf_filter))

    for label, group in groups:
        if group is None:
            continue
        if not isinstance(group, dict):
            errors.append(f"{label}: koşul grubu bir nesne olmalı")
            continue
        _validate_group(group, param_names, label, errors, depth=0)

    return errors


def _parameter_names(strategy: dict, errors: list[str]) -> set[str]:
    """Parametre tanımlarını doğrular ve adlarını döndürür."""
    names: set[str] = set()
    for i, param in enumerate(strategy.get("parameters") or []):
        if not isinstance(param, dict):
            errors.append(f"Parametre #{i + 1}: nesne olmalı")
            continue

        name = param.get("name")
        if not name:
            errors.append(f"Parametre #{i + 1}: 'name' alanı zorunlu")
            continue
        if name in names:
            errors.append(f"Parametre '{name}' birden fazla kez tanımlanmış")
        names.add(name)

        minimum, maximum = param.get("min"), param.get("max")
        if minimum is not None and maximum is not None and minimum > maximum:
            errors.append(f"Parametre '{name}': min ({minimum}) max'tan ({maximum}) büyük")

        default = param.get("default")
        if default is not None:
            if minimum is not None and default < minimum:
                errors.append(f"Parametre '{name}': varsayılan ({default}) min'in ({minimum}) altında")
            if maximum is not None and default > maximum:
                errors.append(f"Parametre '{name}': varsayılan ({default}) max'ın ({maximum}) üstünde")

    return names


def _validate_group(
    group: dict, params: set[str], label: str, errors: list[str], depth: int
) -> None:
    if depth > MAX_GROUP_DEPTH:
        errors.append(f"{label}: koşul grubu {MAX_GROUP_DEPTH} seviyeden derin olamaz")
        return

    logic = group.get("logic", "AND")
    if logic not in ("AND", "OR"):
        errors.append(f"{label}: geçersiz mantık operatörü '{logic}' (AND veya OR olmalı)")

    for i, item in enumerate(group.get("conditions") or []):
        item_label = f"{label} → koşul #{i + 1}"
        if not isinstance(item, dict):
            errors.append(f"{item_label}: nesne olmalı")
        elif is_condition_group(item):
            _validate_group(item, params, f"{label} → grup #{i + 1}", errors, depth + 1)
        else:
            _validate_condition(item, params, item_label, errors)


def _validate_condition(
    condition: dict, params: set[str], label: str, errors: list[str]
) -> None:
    operator = condition.get("operator")
    if operator not in OPERATOR_REGISTRY:
        errors.append(
            f"{label}: bilinmeyen operatör '{operator}'. "
            f"Desteklenen: {sorted(OPERATOR_REGISTRY)}"
        )

    if operator == "between" and not condition.get("right2"):
        errors.append(f"{label}: 'between' operatörü ikinci sınır (right2) ister")

    for side in ("left", "right", "right2"):
        operand = condition.get(side)
        if operand is None:
            if side != "right2":
                errors.append(f"{label}: '{side}' operandı zorunlu")
            continue
        _validate_operand(operand, params, f"{label} ({side})", errors, depth=0)


def _validate_operand(
    operand: Any, params: set[str], label: str, errors: list[str], depth: int
) -> None:
    if not isinstance(operand, dict):
        errors.append(f"{label}: operand bir nesne olmalı")
        return
    if depth > MAX_EXPR_DEPTH:
        errors.append(f"{label}: aritmetik ifade {MAX_EXPR_DEPTH} seviyeden derin olamaz")
        return

    op_type = operand.get("type", "value")
    if op_type not in VALID_OPERAND_TYPES:
        errors.append(
            f"{label}: bilinmeyen operand tipi '{op_type}'. "
            f"Desteklenen: {sorted(VALID_OPERAND_TYPES)}"
        )
        return

    offset = operand.get("offset", 0) or 0
    if isinstance(offset, str):
        _validate_param_ref(offset, params, f"{label} offset", errors)
    elif offset < 0:
        errors.append(f"{label}: negatif offset yasak (lookahead bias, RULES.md #20)")

    if op_type == "expr":
        if operand.get("op") not in VALID_ARITHMETIC_OPS:
            errors.append(
                f"{label}: bilinmeyen aritmetik işlem '{operand.get('op')}'. "
                f"Desteklenen: {sorted(VALID_ARITHMETIC_OPS)}"
            )
        for side in ("left", "right"):
            if operand.get(side) is None:
                errors.append(f"{label}: aritmetik ifade '{side}' operandı ister")
            else:
                _validate_operand(operand[side], params, f"{label}.{side}", errors, depth + 1)
        return

    if op_type == "value":
        value = operand.get("value")
        if value is None:
            errors.append(f"{label}: 'value' alanı zorunlu")
        elif isinstance(value, str):
            _validate_param_ref(value, params, label, errors)
        return

    if op_type == "price":
        field = operand.get("field", "close")
        if field not in VALID_PRICE_FIELDS:
            errors.append(
                f"{label}: geçersiz fiyat alanı '{field}'. Desteklenen: {sorted(VALID_PRICE_FIELDS)}"
            )
        return

    if op_type == "indicator":
        name = operand.get("name")
        if name not in INDICATOR_INFO:
            errors.append(
                f"{label}: bilinmeyen gösterge '{name}'. Desteklenen: {sorted(INDICATOR_INFO)}"
            )
            return

        info = IndicatorRegistry.get_info(name)
        field = operand.get("field")
        if field and info["fields"] and field not in info["fields"]:
            errors.append(
                f"{label}: {name} için geçersiz alan '{field}'. Mevcut: {info['fields']}"
            )
        if field and not info["fields"]:
            errors.append(f"{label}: {name} tek çıktılıdır, 'field' almaz")

        period = operand.get("period", info["default_period"])
        if isinstance(period, str):
            _validate_param_ref(period, params, f"{label} period", errors)
        elif not isinstance(period, int) or not (info["min_period"] <= period <= info["max_period"]):
            errors.append(
                f"{label}: {name} periyodu {info['min_period']}-{info['max_period']} "
                f"aralığında olmalı (verilen: {period})"
            )


def _validate_param_ref(
    value: str, params: set[str], label: str, errors: list[str]
) -> None:
    """`$param` referansının tanımlı olduğunu doğrular."""
    if not value.startswith("$"):
        # Düz metin sayı olabilir ("20"); değilse çalışma zamanında float()
        # patlar, burada da yakalayalım.
        try:
            float(value)
        except ValueError:
            errors.append(f"{label}: '{value}' ne sayı ne de $parametre referansı")
        return

    name = value[1:]
    if name not in params:
        errors.append(
            f"{label}: tanımsız parametre referansı '{value}'. "
            f"Tanımlı parametreler: {sorted(params) or 'yok'}"
        )


def validate_condition_group(
    group: Any,
    parameters: list[dict] | None = None,
    field_name: str = "Koşul grubu",
) -> list[str]:
    """Tek başına bir koşul grubunu doğrular ve hata listesi döndürür.

    Örüntü arama (Faz 3.5) kaydedilmiş bir stratejiye bağlı değildir: koşul
    doğrudan istek gövdesinde gelir ve `entry_rules`/`exit_rules` anahtarları
    yoktur. `validate_strategy` o yapıyı beklediği için burada aynı
    `_validate_group` yeniden kullanılıyor — ikinci bir doğrulayıcı yazmak,
    iki kural setinin zamanla ayrışması demekti.
    """
    errors: list[str] = []

    if not isinstance(group, dict):
        return [f"{field_name}: koşul grubu bir nesne olmalı"]

    param_names = _parameter_names({"parameters": parameters or []}, errors)
    _validate_group(group, param_names, field_name, errors, depth=0)
    return errors


def raise_if_invalid(strategy: dict) -> None:
    """Geçersizse `StrategyValidationError` fırlatır."""
    errors = validate_strategy(strategy)
    if errors:
        raise StrategyValidationError(errors)


def collect_indicator_names(strategy: dict) -> Iterable[str]:
    """Stratejide geçen gösterge adları (arayüzün otomatik açması için)."""
    from app.rules.evaluator import iter_operands

    seen: set[str] = set()
    groups = [strategy.get("entry_rules") or {}, strategy.get("exit_rules") or {}]
    groups.extend(strategy.get("timeframe_filters") or [])
    for group in groups:
        for operand in iter_operands(group):
            name = operand.get("name")
            if operand.get("type") == "indicator" and name and name not in seen:
                seen.add(name)
                yield name
