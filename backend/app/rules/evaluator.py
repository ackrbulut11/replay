"""
Kural Değerlendirme Yardımcısı (Rule Evaluator).

Bir koşul bloğunu (condition group) AND/OR mantığıyla değerlendirir.
İndikatör ve fiyat değerlerini DataFrame'den çeker,
parametre referanslarını ($fast_ema gibi) çözümler.

Bir operand farklı bir zaman dilimi (`timeframe`) istediğinde ve o dilimin
verisi elde yoksa ANA ZAMAN DİLİMİNE DÜŞÜLMEZ — NaN döndürülür, koşul da
"yetersiz veri" sayılıp sağlanmaz. Eskiden düşülüyordu ve bu, üst dilim
yüklemesi başarısız olduğunda "15dk grafik + 4S EMA200 filtresi"ni sessizce
"15dk grafik + 15dk EMA200 filtresi"ne çeviriyordu: kullanıcı test ettiği
stratejinin bu olmadığını hiç öğrenemiyordu. Yükleme hatasının kendisi
`StrategyEngine.load_multi_tf_data` tarafından ayrıca yükseltilir.
"""

from __future__ import annotations

import math
from typing import Union

import pandas as pd

from app.indicators.registry import IndicatorRegistry
from app.rules.conditions import get_operator


def resolve_parameter(
    value: Union[int, float, str],
    params: dict[str, Union[int, float]],
) -> Union[int, float]:
    """
    Parametre referanslarını çözümler.

    '$fast_ema' gibi string referansları params dict'inden değere çevirir.
    Sayısal değerler olduğu gibi döndürülür.
    """
    if isinstance(value, str) and value.startswith("$"):
        param_name = value[1:]  # $ karakterini kaldır
        if param_name not in params:
            raise ValueError(f"Tanımsız parametre referansı: {value}")
        return params[param_name]
    return value


def _bar_duration(df: pd.DataFrame, cache: dict | None = None):
    """Bir serinin mum süresini zaman damgalarından çıkarır.

    Medyan kullanılır: hafta sonu/tatil boşlukları (BIST'te 1g serisinde 3
    günlük atlamalar) ortalamayı bozarken medyanı bozmaz. Süre çıkarılamazsa
    (tek satırlık seri) None döner.
    """
    if cache is not None:
        key = ("__bar_duration__", id(df))
        if key in cache:
            return cache[key]

    duration = None
    if "timestamp" in df.columns and len(df) >= 2:
        diffs = pd.to_datetime(df["timestamp"]).diff().dropna()
        if not diffs.empty:
            median = diffs.median()
            if pd.notna(median) and median > pd.Timedelta(0):
                duration = median

    if cache is not None:
        cache[key] = duration
    return duration


def _get_multi_tf_bar_index(
    df: pd.DataFrame,
    bar_index: int,
    target_df: pd.DataFrame,
    cache: dict | None = None,
) -> int:
    """Üst zaman diliminde KULLANILABİLİR (kapanmış) mumun indeksini bulur.

    Lookahead koruması (RULES.md #19-21): `timestamp` mumun AÇILIŞ zamanıdır.
    Yalnızca "açılışı geçilmiş" mumu seçmek geleceğe bakmaktır — 15dk grafikte
    saat 10:15'teyken 08:00'de başlayan 4S mumu henüz 12:00'de kapanacaktır ve
    kapanışı/yükseği/düşüğü o an bilinemez.

    Ölçüt: değerlendirme, grafik mumunun KAPANIŞINDA yapılır. Üst dilim mumu
    ancak kendi kapanışı bu ana kadar gerçekleşmişse kullanılabilir:

        hedef_açılış + hedef_süre <= mevcut_açılış + grafik_süresi

    Aynı zaman dilimi verildiğinde eşitlik sağlanır ve mumun kendisi seçilir
    (doğru: o mum kapanmıştır). Süreler çıkarılamazsa muhafazakâr davranılır
    ve açılışı geçilmiş SON mum atlanır — o mum her zaman hâlâ oluşmaktadır.
    """
    if bar_index < 0 or bar_index >= len(df) or target_df.empty:
        return -1
    if "timestamp" not in df.columns or "timestamp" not in target_df.columns:
        # Hizalama yapılamıyor: eskiden bar_index doğrudan kullanılıyordu, bu
        # da tamamen keyfi (ve büyük olasılıkla ileriye bakan) bir eşleme
        # üretiyordu. Değer yok saymak, yanlış değer üretmekten iyidir.
        return -1

    current_ts = df.iloc[bar_index]["timestamp"]
    valid = target_df[target_df["timestamp"] <= current_ts]
    if valid.empty:
        return -1

    target_duration = _bar_duration(target_df, cache)
    source_duration = _bar_duration(df, cache)

    if target_duration is None or source_duration is None:
        # Muhafazakâr geri çekilme: açılışı geçilmiş son mum hâlâ oluşuyor.
        return len(valid) - 2 if len(valid) >= 2 else -1

    evaluated_at = current_ts + source_duration
    closed = valid[valid["timestamp"] + target_duration <= evaluated_at]
    if closed.empty:
        return -1
    return len(closed) - 1


def resolve_operand(
    operand: dict,
    df: pd.DataFrame,
    bar_index: int,
    params: dict[str, Union[int, float]],
    multi_tf_data: dict[str, pd.DataFrame] | None = None,
    current_pnl: float = 0.0,
    cache: dict | None = None,
) -> float:
    """
    Bir operandın değerini çözümler.
    """
    op_type = operand.get("type", "value")

    if op_type in ("pnl", "pnl_percent"):
        return float(current_pnl)

    if op_type == "value":
        raw = operand.get("value")
        if raw is None:
            raise ValueError("Value operandında 'value' alanı zorunludur")
        return float(resolve_parameter(raw, params))

    if op_type == "price":
        field = operand.get("field", "close")
        timeframe = operand.get("timeframe")

        if timeframe:
            # Farklı bir zaman dilimi istendiyse ana dilime DÜŞÜLMEZ: veri yoksa
            # değer bilinmiyordur (bkz. modül başlığı).
            target_df = (multi_tf_data or {}).get(timeframe)
            if target_df is None:
                return float("nan")
            idx = _get_multi_tf_bar_index(df, bar_index, target_df, cache)
            if idx < 0:
                return float("nan")
            return float(target_df[field].iloc[idx])

        if bar_index < 0 or bar_index >= len(df):
            return float("nan")
        return float(df[field].iloc[bar_index])

    if op_type == "indicator":
        name = operand.get("name")
        if name is None:
            raise ValueError("Indicator operandında 'name' alanı zorunludur")

        raw_period = operand.get("period", IndicatorRegistry.get_info(name)["default_period"])
        period = int(resolve_parameter(raw_period, params))
        field = operand.get("field")
        timeframe = operand.get("timeframe")

        if timeframe:
            # Ana dilime düşülmez (bkz. modül başlığı).
            target_df = (multi_tf_data or {}).get(timeframe)
            if target_df is None:
                return float("nan")
            idx = _get_multi_tf_bar_index(df, bar_index, target_df, cache)
            if idx < 0:
                return float("nan")
            return IndicatorRegistry.get_value(name, target_df, period, idx, field, cache=cache)

        return IndicatorRegistry.get_value(name, df, period, bar_index, field, cache=cache)

    raise ValueError(f"Bilinmeyen operand tipi: {op_type}")


class RuleEvaluator:
    """
    Kural değerlendirici.

    Bir koşul grubunu (ConditionGroup) AND/OR mantığıyla değerlendirir.
    """

    @staticmethod
    def evaluate_condition(
        condition: dict,
        df: pd.DataFrame,
        bar_index: int,
        params: dict[str, Union[int, float]],
        multi_tf_data: dict[str, pd.DataFrame] | None = None,
        current_pnl: float = 0.0,
        cache: dict | None = None,
    ) -> tuple[bool, str]:
        """
        Tek bir koşulu değerlendirir.

        Returns:
            (sonuç, açıklama) tuple'ı.
        """
        left_def = condition.get("left", {})
        right_def = condition.get("right", {})
        operator_name = condition.get("operator", ">")

        # Mevcut bar değerlerini çözümle
        left_val = resolve_operand(left_def, df, bar_index, params, multi_tf_data, current_pnl, cache)
        right_val = resolve_operand(right_def, df, bar_index, params, multi_tf_data, current_pnl, cache)

        # NaN kontrolü — veri yetersizse koşul sağlanmaz
        if math.isnan(left_val) or math.isnan(right_val):
            return False, "Yetersiz veri (NaN)"

        # Operatör fonksiyonunu al
        operator_func = get_operator(operator_name)

        # Cross operatörleri için önceki bar değerleri gerekli
        kwargs: dict = {}
        if operator_name in ("cross_above", "cross_below"):
            if bar_index > 0:
                prev_left = resolve_operand(left_def, df, bar_index - 1, params, multi_tf_data, current_pnl, cache)
                prev_right = resolve_operand(right_def, df, bar_index - 1, params, multi_tf_data, current_pnl, cache)
                if not math.isnan(prev_left) and not math.isnan(prev_right):
                    kwargs["prev_left"] = prev_left
                    kwargs["prev_right"] = prev_right

        # Between operatörü için ikinci sağ değer
        if operator_name == "between":
            right2_def = condition.get("right2")
            if right2_def:
                right2_val = resolve_operand(right2_def, df, bar_index, params, multi_tf_data, current_pnl, cache)
                if not math.isnan(right2_val):
                    kwargs["right2"] = right2_val

        result = operator_func(left_val, right_val, **kwargs)

        # Açıklama oluştur
        left_desc = _operand_description(left_def)
        right_desc = _operand_description(right_def)
        desc = f"{left_desc} {operator_name} {right_desc}"
        if operator_name == "between" and "right2" in kwargs:
            right2_desc = _operand_description(condition.get("right2", {}))
            desc = f"{left_desc} between {right_desc} - {right2_desc}"

        return result, desc

    @staticmethod
    def evaluate_group(
        group: dict,
        df: pd.DataFrame,
        bar_index: int,
        params: dict[str, Union[int, float]],
        multi_tf_data: dict[str, pd.DataFrame] | None = None,
        current_pnl: float = 0.0,
        cache: dict | None = None,
    ) -> tuple[bool, list[str]]:
        """
        Bir koşul grubunu AND/OR mantığıyla değerlendirir.

        Returns:
            (sonuç, karşılanan_koşullar) tuple'ı.
        """
        logic = group.get("logic", "AND")
        conditions = group.get("conditions", [])

        if not conditions:
            return False, []

        met_conditions: list[str] = []
        results: list[bool] = []

        for condition in conditions:
            result, desc = RuleEvaluator.evaluate_condition(
                condition, df, bar_index, params, multi_tf_data, current_pnl, cache
            )
            results.append(result)
            if result:
                met_conditions.append(desc)

        if logic == "AND":
            final = all(results)
        else:  # OR
            final = any(results)

        return final, met_conditions


def _operand_description(operand: dict) -> str:
    """Operandın okunabilir açıklamasını üretir."""
    op_type = operand.get("type", "value")
    if op_type in ("pnl", "pnl_percent"):
        return "Kar/Zarar (%)"
    if op_type == "indicator":
        name = operand.get("name", "?")
        period = operand.get("period", "?")
        field = operand.get("field", "")
        tf = operand.get("timeframe", "")
        base = f"{name}({period})"
        if field:
            base = f"{base}.{field}"
        if tf:
            base = f"{base}@{tf}"
        return base
    elif op_type == "price":
        field = operand.get("field", "close")
        tf = operand.get("timeframe", "")
        return f"{field}@{tf}" if tf else field
    elif op_type == "value":
        return str(operand.get("value", "?"))
    return "?"

