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

# Bir operandın referans verebileceği zaman dilimleri.
#
# Liste burada TEKRARLANIYOR çünkü `rules/` katmanı `data/` katmanına bağımlı
# olamaz (RULES.md #1, #6). Sürüklenmeyi test engelliyor:
# `test_strategy_validation` bu kümenin `DataLoader.TIMEFRAME_DELTAS` ile
# birebir aynı olduğunu doğruluyor.
#
# Doğrulanmadığında `timeframe: "3h"` gibi bir yazım hatası kaydetmede
# geçiyor, ancak test çalıştırılınca ve 502 olarak ortaya çıkıyordu.
VALID_TIMEFRAMES = frozenset({"1m", "5m", "15m", "1h", "4h", "1d", "1w", "1mo"})

# Sağ operandı eşik değil GERİYE KAÇ BAR olan operatörler
# (bkz. rules/conditions.LOOKBACK_OPERATORS).
LOOKBACK_OPERATOR_NAMES = frozenset({"rising", "falling"})


class StrategyValidationError(ValueError):
    """Kural ağacı geçersiz. `errors` insan tarafından okunabilir maddeler taşır."""

    def __init__(self, errors: list[str]):
        self.errors = errors
        super().__init__("; ".join(errors))


MAX_RULE_NODES = 512
MAX_RULE_CONDITIONS = 100


def _tree_budget_errors(tree) -> list[str]:
    """İç içe ve geniş JSON ağaçlarının toplam maliyetini sınırlar."""
    stack = [(tree, 0)]
    nodes = conditions = 0
    while stack:
        value, depth = stack.pop()
        nodes += 1
        if nodes > MAX_RULE_NODES or depth > 32:
            return ["Kural ağacı boyut veya derinlik sınırını aşıyor"]
        if isinstance(value, dict):
            if "operator" in value:
                conditions += 1
                if conditions > MAX_RULE_CONDITIONS:
                    return [f"En fazla {MAX_RULE_CONDITIONS} koşul kullanılabilir"]
            stack.extend((child, depth + 1) for child in value.values())
        elif isinstance(value, list):
            if len(value) > MAX_RULE_CONDITIONS:
                return [f"Bir listede en fazla {MAX_RULE_CONDITIONS} öğe olabilir"]
            stack.extend((child, depth + 1) for child in value)
    return []


def validate_strategy(strategy: dict) -> list[str]:
    """Kural ağacını doğrular ve hata listesi döndürür (boşsa geçerli).

    Hata fırlatmak yerine liste döndürür: kullanıcıya tek tek "şunu da düzelt"
    demek yerine hepsini birden göstermek gerekiyor.
    """
    errors = _tree_budget_errors(strategy)
    if errors:
        return errors
    param_names = _parameter_names(strategy, errors)

    groups: list[tuple[str, Any]] = [
        ("Giriş kuralları", strategy.get("entry_rules")),
        ("Çıkış kuralları", strategy.get("exit_rules")),
    ]
    for i, tf_filter in enumerate(strategy.get("timeframe_filters") or []):
        label = f"Zaman dilimi filtresi #{i + 1}"
        if not isinstance(tf_filter, dict) or not tf_filter.get("timeframe"):
            errors.append(f"{label}: 'timeframe' alanı zorunlu")
        elif tf_filter.get("timeframe") not in VALID_TIMEFRAMES:
            errors.append(
                f"{label}: bilinmeyen zaman dilimi '{tf_filter.get('timeframe')}'. "
                f"Desteklenen: {sorted(VALID_TIMEFRAMES)}"
            )
        # Boş bir filtre grubunun sonucu SESSİZCE FELAKETTİR: filtre bir kapıdır
        # ve boş grup `False` döndüğü için strateji ömür boyu tek sinyal
        # üretemez. Kaydetmede yakalanmazsa kullanıcı "strateji çalışmıyor"
        # diye günlerce arar.
        if isinstance(tf_filter, dict) and not (tf_filter.get("conditions") or []):
            errors.append(
                f"{label}: en az bir koşul içermeli — boş bir filtre her barda "
                "sağlanmamış sayılır ve strateji hiç sinyal üretemez"
            )
        groups.append((label, tf_filter))

    for label, group in groups:
        if group is None:
            continue
        if not isinstance(group, dict):
            errors.append(f"{label}: koşul grubu bir nesne olmalı")
            continue
        _validate_group(group, param_names, label, errors, depth=0)

    errors.extend(_validate_tradeability(strategy))
    return errors


def _validate_tradeability(strategy: dict) -> list[str]:
    """Strateji gerçekten pozisyon açıp kapatabiliyor mu?

    Kural ağacı tek tek geçerli olduğu hâlde strateji BÜTÜN olarak hiçbir şey
    yapamayabilir; bu durum kaydetmede hiç yakalanmıyordu ve kullanıcı ancak
    "0 işlem" sonucunu görünce fark ediyordu — o da genelde stratejinin
    kötü olduğu sanılarak.
    """
    errors: list[str] = []

    entry = strategy.get("entry_rules") or {}
    exit_rules = strategy.get("exit_rules") or {}
    has_entry = bool(isinstance(entry, dict) and (entry.get("conditions") or []))
    has_exit = bool(isinstance(exit_rules, dict) and (exit_rules.get("conditions") or []))
    allow_short = bool(strategy.get("allow_short"))
    has_tp = bool(strategy.get("take_profit_pct"))
    has_sl = bool(strategy.get("stop_loss_pct"))

    if not has_entry and not has_exit:
        errors.append(
            "Strateji hiç kural içermiyor: giriş ya da çıkış kurallarından en az "
            "biri dolu olmalı."
        )
        return errors

    # Pozisyon açabilme: giriş kuralı BUY üretir; `allow_short` açıkken çıkış
    # kuralı da nakitteyken SHORT açar (bkz. RuleEngine.evaluate_bar_with_state).
    if not has_entry and not allow_short:
        errors.append(
            "Giriş kuralları boş ve short'a izin verilmemiş: strateji hiç "
            "pozisyon açamaz. Bir giriş koşulu ekleyin ya da short'u açın."
        )

    # NOT — "çıkış kuralı yok" bilerek HATA SAYILMIYOR. Böyle bir strateji
    # pozisyonu açar ve taşır; bu artık sessiz değil: sonuçta `open_position`
    # alanı ve arayüzde "test sonunda pozisyon açık" satırı görünüyor. Hata
    # yapmak, kullanıcının hâlâ düzenlemekte olduğu ya da alanlar eklenmeden
    # önce kaydedilmiş stratejileri kaydedilemez hâle getirirdi.
    #
    # Buradaki ölçüt şu: HİÇBİR çıktı üretmeyen durum hatadır, eksik ama
    # görünür çıktı üreten durum değildir.
    _ = (has_tp, has_sl)
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

    if operator in LOOKBACK_OPERATOR_NAMES:
        # Bu operatörlerde sağ operand bir EŞİK DEĞİL, "kaç bar geriye
        # bakılacağı"dır. Oraya bir gösterge konursa `int(right_val)` binlerce
        # barlık bir geri bakış üretir (EMA50 = 42.000 -> 42.000 bar) ve koşul
        # sessizce hep NaN döner; hiçbir hata görünmez, strateji yalnızca
        # hiç tetiklenmez.
        right = condition.get("right")
        if not isinstance(right, dict) or right.get("type", "value") != "value":
            errors.append(
                f"{label}: '{operator}' operatöründe sağ taraf bir SAYI olmalı "
                "(kaç bar geriye bakılacağı), gösterge/fiyat değil"
            )
        else:
            raw = right.get("value")
            if isinstance(raw, str) and raw.startswith("$"):
                pass  # Parametre referansı ayrıca doğrulanıyor.
            else:
                try:
                    bars = int(raw)
                except (TypeError, ValueError):
                    bars = 0
                if bars < 1:
                    errors.append(
                        f"{label}: '{operator}' operatöründe bar sayısı en az 1 olmalı "
                        f"(verilen: {raw})"
                    )

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

    # Zaman dilimi referansı: yazım hatası kaydetmede geçip test sırasında
    # 502'ye dönüşüyordu (yüklenemeyen dilim -> MultiTimeframeDataError).
    timeframe = operand.get("timeframe")
    if timeframe is not None and timeframe not in VALID_TIMEFRAMES:
        errors.append(
            f"{label}: bilinmeyen zaman dilimi '{timeframe}'. "
            f"Desteklenen: {sorted(VALID_TIMEFRAMES)}"
        )

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

    errors.extend(_tree_budget_errors(group))
    if errors:
        return errors
    if parameters and len(parameters) > 64:
        return ["En fazla 64 parametre kullanılabilir"]
    try:
        param_names = _parameter_names({"parameters": parameters or []}, errors)
        _validate_group(group, param_names, field_name, errors, depth=0)
    except (TypeError, ValueError, AttributeError, OverflowError):
        errors.append("Koşul alanlarının türleri veya sayısal değerleri geçersiz")
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
