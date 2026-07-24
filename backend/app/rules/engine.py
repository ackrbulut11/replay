"""
Kural Motoru (Rule Engine).

Strateji JSON'ını alır, gerekli indikatörleri hesaplar, kuralları değerlendirir.
Lookahead bias koruması: bar_index'e kadar olan veriye erişim.

Aynı strateji motoru canlı analiz ve replay'de kullanılır (RULES.md #3).
Stratejiler kod değil, veridir (RULES.md #4).
"""

from __future__ import annotations

from typing import Union

import pandas as pd

from app.rules.evaluator import RuleEvaluator
from app.rules.strategy_models import SignalType


class RuleEngine:
    """
    JSON tabanlı kural motoru.

    Strateji JSON'ını alır ve bar-by-bar değerlendirme yapar.
    Her barda sadece o ana kadar oluşmuş mumlara erişilir (lookahead bias koruması).
    Sinyal, kapanan mumdan üretilir (RULES.md #22).
    """

    @staticmethod
    def evaluate(
        strategy: dict,
        df: pd.DataFrame,
        bar_index: int,
        params: dict[str, Union[int, float]] | None = None,
        multi_tf_data: dict[str, pd.DataFrame] | None = None,
    ) -> tuple[SignalType, list[str]]:
        """
        Tek bir bar için strateji değerlendirmesi yapar.

        Args:
            strategy: Strateji JSON dict'i
            df: OHLCV DataFrame (tüm veri)
            bar_index: Değerlendirilecek mum indeksi
            params: Parametre değerleri (override'lar dahil)
            multi_tf_data: Çoklu timeframe verileri

        Returns:
            (sinyal_tipi, karşılanan_koşullar) tuple'ı.
        """
        if params is None:
            params = {}

        # Strateji parametrelerinden varsayılan değerleri al, override'larla birleştir
        effective_params = RuleEngine._resolve_params(strategy, params)

        # Lookahead koruması: bar_index sınırlarını kontrol et
        if bar_index < 0 or bar_index >= len(df):
            return SignalType.NEUTRAL, []

        # Önce timeframe filtrelerini kontrol et
        tf_filters = strategy.get("timeframe_filters", [])
        for tf_filter in tf_filters:
            tf_result, _ = RuleEvaluator.evaluate_group(
                tf_filter, df, bar_index, effective_params, multi_tf_data
            )
            if not tf_result:
                # Timeframe filtresi geçilmedi, sinyal yok
                return SignalType.NEUTRAL, []

        # Entry (BUY) kurallarını değerlendir
        entry_rules = strategy.get("entry_rules", {})
        if entry_rules and entry_rules.get("conditions"):
            entry_result, entry_met = RuleEvaluator.evaluate_group(
                entry_rules, df, bar_index, effective_params, multi_tf_data
            )
            if entry_result:
                return SignalType.BUY, entry_met

        # Exit (SELL) kurallarını değerlendir
        exit_rules = strategy.get("exit_rules", {})
        if exit_rules and exit_rules.get("conditions"):
            exit_result, exit_met = RuleEvaluator.evaluate_group(
                exit_rules, df, bar_index, effective_params, multi_tf_data
            )
            if exit_result:
                return SignalType.SELL, exit_met

        return SignalType.NEUTRAL, []

    @staticmethod
    def evaluate_bar_with_state(
        strategy: dict,
        df: pd.DataFrame,
        bar_index: int,
        position_state: str,
        effective_params: dict,
        multi_tf_data: dict[str, pd.DataFrame] | None = None,
    ) -> tuple[SignalType, list[str]]:
        """Pozisyon durumuna (none, long, short) göre ilgili kuralları değerlendirir."""
        if bar_index < 0 or bar_index >= len(df):
            return SignalType.NEUTRAL, []

        # Timeframe filtrelerini kontrol et
        tf_filters = strategy.get("timeframe_filters", [])
        for tf_filter in tf_filters:
            tf_result, _ = RuleEvaluator.evaluate_group(
                tf_filter, df, bar_index, effective_params, multi_tf_data
            )
            if not tf_result:
                return SignalType.NEUTRAL, []

        entry_rules = strategy.get("entry_rules", {})
        exit_rules = strategy.get("exit_rules", {})

        if position_state == "none":
            # Pozisyon yoksa önce BUY (giriş) sonra SELL (short giriş) kontrol edilir
            if entry_rules and entry_rules.get("conditions"):
                entry_result, entry_met = RuleEvaluator.evaluate_group(
                    entry_rules, df, bar_index, effective_params, multi_tf_data
                )
                if entry_result:
                    return SignalType.BUY, entry_met

            if exit_rules and exit_rules.get("conditions"):
                exit_result, exit_met = RuleEvaluator.evaluate_group(
                    exit_rules, df, bar_index, effective_params, multi_tf_data
                )
                if exit_result:
                    return SignalType.SELL, exit_met

        elif position_state == "long":
            # Long pozisyondayız -> YALNIZCA ÇIKIŞ (SELL -> Short'a geçiş) kurallarını kontrol et
            if exit_rules and exit_rules.get("conditions"):
                exit_result, exit_met = RuleEvaluator.evaluate_group(
                    exit_rules, df, bar_index, effective_params, multi_tf_data
                )
                if exit_result:
                    return SignalType.SELL, exit_met

        elif position_state == "short":
            # Short pozisyondayız -> YALNIZCA GİRİŞ (BUY -> Long'a geçiş) kurallarını kontrol et
            if entry_rules and entry_rules.get("conditions"):
                entry_result, entry_met = RuleEvaluator.evaluate_group(
                    entry_rules, df, bar_index, effective_params, multi_tf_data
                )
                if entry_result:
                    return SignalType.BUY, entry_met

        return SignalType.NEUTRAL, []

    @staticmethod
    def evaluate_range(
        strategy: dict,
        df: pd.DataFrame,
        start_index: int | None = None,
        end_index: int | None = None,
        params: dict[str, Union[int, float]] | None = None,
        multi_tf_data: dict[str, pd.DataFrame] | None = None,
    ) -> list[dict]:
        """
        Belirli bir aralıktaki tüm barları değerlendirir.
        Long ve Short pozisyon dönüşümlü sürekli işlem simülasyonu yapar.
        """
        if params is None:
            params = {}

        effective_params = RuleEngine._resolve_params(strategy, params)

        if start_index is None:
            start_index = RuleEngine._get_warmup_period(strategy, effective_params)
        if end_index is None:
            end_index = len(df) - 1

        start_index = max(start_index, 0)
        end_index = min(end_index, len(df) - 1)

        signals: list[dict] = []
        position_state: str = "none"  # "none", "long", "short"
        last_entry_price: float | None = None

        # Fiyat sütun adını büyük/küçük harf bağımsız bul
        close_col = None
        for col in df.columns:
            if str(col).lower() == "close":
                close_col = col
                break

        for i in range(start_index, end_index + 1):
            signal, conditions_met = RuleEngine.evaluate_bar_with_state(
                strategy=strategy,
                df=df,
                bar_index=i,
                position_state=position_state,
                effective_params=effective_params,
                multi_tf_data=multi_tf_data,
            )

            close_price = float(df.iloc[i][close_col]) if close_col else 0.0

            ts_val = df.iloc[i].get("timestamp", 0)
            if hasattr(ts_val, "timestamp"):
                timestamp = int(ts_val.timestamp())
            elif "time" in df.columns:
                time_val = df.iloc[i]["time"]
                timestamp = int(time_val.timestamp()) if hasattr(time_val, "timestamp") else int(time_val)
            else:
                timestamp = int(ts_val) if ts_val else 0

            if signal == SignalType.BUY:
                sig_item: dict = {
                    "bar_index": i,
                    "timestamp": timestamp,
                    "signal": "BUY",
                    "price": round(close_price, 4),
                    "conditions_met": conditions_met,
                }

                if position_state == "short" and last_entry_price is not None and last_entry_price > 0:
                    # Short pozisyonunu kapat ve Short PnL % hesapla
                    short_pnl = ((last_entry_price - close_price) / last_entry_price) * 100.0
                    sig_item["entry_price"] = round(last_entry_price, 4)
                    sig_item["pnl_percent"] = round(short_pnl, 2)
                    sig_item["position_closed"] = "SHORT"

                position_state = "long"
                last_entry_price = close_price
                signals.append(sig_item)

            elif signal == SignalType.SELL:
                sig_item: dict = {
                    "bar_index": i,
                    "timestamp": timestamp,
                    "signal": "SELL",
                    "price": round(close_price, 4),
                    "conditions_met": conditions_met,
                }

                if position_state == "long" and last_entry_price is not None and last_entry_price > 0:
                    # Long pozisyonunu kapat ve Long PnL % hesapla
                    long_pnl = ((close_price - last_entry_price) / last_entry_price) * 100.0
                    sig_item["entry_price"] = round(last_entry_price, 4)
                    sig_item["pnl_percent"] = round(long_pnl, 2)
                    sig_item["position_closed"] = "LONG"

                position_state = "short"
                last_entry_price = close_price
                signals.append(sig_item)

        return signals

    @staticmethod
    def _resolve_params(
        strategy: dict,
        overrides: dict[str, Union[int, float]],
    ) -> dict[str, Union[int, float]]:
        """Strateji parametrelerinin varsayılan ve override değerlerini birleştirir."""
        params: dict[str, Union[int, float]] = {}

        for param_def in strategy.get("parameters", []):
            name = param_def.get("name", "")
            default = param_def.get("default", 0)
            params[name] = default

        # Override'ları uygula (min/max sınırlarına dikkat et)
        for name, value in overrides.items():
            if name in params:
                # Sınır kontrolü
                for param_def in strategy.get("parameters", []):
                    if param_def.get("name") == name:
                        min_val = param_def.get("min")
                        max_val = param_def.get("max")
                        if min_val is not None:
                            value = max(value, min_val)
                        if max_val is not None:
                            value = min(value, max_val)
                        break
            params[name] = value

        return params

    @staticmethod
    def _get_warmup_period(
        strategy: dict,
        params: dict[str, Union[int, float]],
    ) -> int:
        """
        Stratejide kullanılan indikatörlerin gerektirdiği minimum warmup barını hesaplar.

        En büyük period değerini bulur ve yeterli veri birikimine izin verir.
        """
        max_period = 0

        def scan_conditions(group: dict) -> None:
            nonlocal max_period
            for condition in group.get("conditions", []):
                for side in ("left", "right", "right2"):
                    operand = condition.get(side)
                    if operand and operand.get("type") == "indicator":
                        raw_period = operand.get("period", 14)
                        if isinstance(raw_period, str) and raw_period.startswith("$"):
                            period = int(params.get(raw_period[1:], 14))
                        else:
                            period = int(raw_period)
                        max_period = max(max_period, period)

        # Entry ve exit kurallarını tara
        entry_rules = strategy.get("entry_rules", {})
        if entry_rules:
            scan_conditions(entry_rules)

        exit_rules = strategy.get("exit_rules", {})
        if exit_rules:
            scan_conditions(exit_rules)

        # Timeframe filtrelerini de tara
        for tf_filter in strategy.get("timeframe_filters", []):
            scan_conditions(tf_filter)

        # Warmup: en az max_period kadar bar geçmeli
        return max(max_period, 1)
