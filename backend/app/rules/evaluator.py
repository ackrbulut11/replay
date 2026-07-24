"""
Kural Değerlendirme Yardımcısı (Rule Evaluator).

Bir koşul bloğunu (condition group) AND/OR mantığıyla değerlendirir.
İndikatör ve fiyat değerlerini DataFrame'den çeker,
parametre referanslarını ($fast_ema gibi) çözümler.
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


def _get_multi_tf_bar_index(df: pd.DataFrame, bar_index: int, target_df: pd.DataFrame) -> int:
    """Çoklu zaman diliminde zaman damgasına göre uygun mum indeksini bulur."""
    if bar_index < 0 or bar_index >= len(df) or target_df.empty:
        return -1
    if "timestamp" not in df.columns or "timestamp" not in target_df.columns:
        return min(bar_index, len(target_df) - 1)
    
    current_ts = df.iloc[bar_index]["timestamp"]
    valid = target_df[target_df["timestamp"] <= current_ts]
    if valid.empty:
        return -1
    return len(valid) - 1


def resolve_operand(
    operand: dict,
    df: pd.DataFrame,
    bar_index: int,
    params: dict[str, Union[int, float]],
    multi_tf_data: dict[str, pd.DataFrame] | None = None,
) -> float:
    """
    Bir operandın değerini çözümler.
    """
    op_type = operand.get("type", "value")

    if op_type == "value":
        raw = operand.get("value")
        if raw is None:
            raise ValueError("Value operandında 'value' alanı zorunludur")
        return float(resolve_parameter(raw, params))

    if op_type == "price":
        field = operand.get("field", "close")
        timeframe = operand.get("timeframe")

        if timeframe and multi_tf_data and timeframe in multi_tf_data:
            target_df = multi_tf_data[timeframe]
            idx = _get_multi_tf_bar_index(df, bar_index, target_df)
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

        if timeframe and multi_tf_data and timeframe in multi_tf_data:
            target_df = multi_tf_data[timeframe]
            idx = _get_multi_tf_bar_index(df, bar_index, target_df)
            if idx < 0:
                return float("nan")
            return IndicatorRegistry.get_value(name, target_df, period, idx, field)

        return IndicatorRegistry.get_value(name, df, period, bar_index, field)

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
        left_val = resolve_operand(left_def, df, bar_index, params, multi_tf_data)
        right_val = resolve_operand(right_def, df, bar_index, params, multi_tf_data)

        # NaN kontrolü — veri yetersizse koşul sağlanmaz
        if math.isnan(left_val) or math.isnan(right_val):
            return False, "Yetersiz veri (NaN)"

        # Operatör fonksiyonunu al
        operator_func = get_operator(operator_name)

        # Cross operatörleri için önceki bar değerleri gerekli
        kwargs: dict = {}
        if operator_name in ("cross_above", "cross_below"):
            if bar_index > 0:
                prev_left = resolve_operand(left_def, df, bar_index - 1, params, multi_tf_data)
                prev_right = resolve_operand(right_def, df, bar_index - 1, params, multi_tf_data)
                if not math.isnan(prev_left) and not math.isnan(prev_right):
                    kwargs["prev_left"] = prev_left
                    kwargs["prev_right"] = prev_right

        # Between operatörü için ikinci sağ değer
        if operator_name == "between":
            right2_def = condition.get("right2")
            if right2_def:
                right2_val = resolve_operand(right2_def, df, bar_index, params, multi_tf_data)
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
                condition, df, bar_index, params, multi_tf_data
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
