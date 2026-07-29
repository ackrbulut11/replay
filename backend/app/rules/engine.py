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
        cache: dict | None = None,
    ) -> tuple[SignalType, list[str]]:
        """
        Tek bir bar için strateji değerlendirmesi yapar.

        Args:
            strategy: Strateji JSON dict'i
            df: OHLCV DataFrame (tüm veri)
            bar_index: Değerlendirilecek mum indeksi
            params: Parametre değerleri (override'lar dahil)
            multi_tf_data: Çoklu timeframe verileri
            cache: İndikatör serilerini önbelleğe almak için paylaşılan sözlük
                (bkz. `evaluate_range` — aynı df üzerinde tekrarlanan
                çağrılarda indikatörün yeniden hesaplanmasını önler)

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
                tf_filter, df, bar_index, effective_params, multi_tf_data, cache=cache
            )
            if not tf_result:
                # Timeframe filtresi geçilmedi, sinyal yok
                return SignalType.NEUTRAL, []

        # Entry (BUY) kurallarını değerlendir
        entry_rules = strategy.get("entry_rules", {})
        if entry_rules and entry_rules.get("conditions"):
            entry_result, entry_met = RuleEvaluator.evaluate_group(
                entry_rules, df, bar_index, effective_params, multi_tf_data, cache=cache
            )
            if entry_result:
                return SignalType.BUY, entry_met

        # Exit (SELL) kurallarını değerlendir
        exit_rules = strategy.get("exit_rules", {})
        if exit_rules and exit_rules.get("conditions"):
            exit_result, exit_met = RuleEvaluator.evaluate_group(
                exit_rules, df, bar_index, effective_params, multi_tf_data, cache=cache
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
        current_pnl: float = 0.0,
        cache: dict | None = None,
    ) -> tuple[SignalType, list[str]]:

        """Pozisyon durumuna (none, long, short) göre ilgili kuralları değerlendirir."""
        if bar_index < 0 or bar_index >= len(df):
            return SignalType.NEUTRAL, []

        # Timeframe filtrelerini kontrol et
        tf_filters = strategy.get("timeframe_filters", [])
        for tf_filter in tf_filters:
            tf_result, _ = RuleEvaluator.evaluate_group(
                tf_filter, df, bar_index, effective_params, multi_tf_data, current_pnl, cache
            )
            if not tf_result:
                return SignalType.NEUTRAL, []

        entry_rules = strategy.get("entry_rules", {})
        exit_rules = strategy.get("exit_rules", {})

        allow_short = strategy.get("allow_short", False)
        if "allow_short" in effective_params:
            allow_short = bool(effective_params["allow_short"])

        if position_state == "none":
            # Pozisyon yoksa önce BUY (giriş) kontrol edilir
            if entry_rules and entry_rules.get("conditions"):
                entry_result, entry_met = RuleEvaluator.evaluate_group(
                    entry_rules, df, bar_index, effective_params, multi_tf_data, current_pnl, cache
                )
                if entry_result:
                    return SignalType.BUY, entry_met

            # Eğer short pozisyona izin veriliyorsa SELL kontrol edilir
            if allow_short and exit_rules and exit_rules.get("conditions"):
                exit_result, exit_met = RuleEvaluator.evaluate_group(
                    exit_rules, df, bar_index, effective_params, multi_tf_data, current_pnl, cache
                )
                if exit_result:
                    return SignalType.SELL, exit_met

        elif position_state == "long":
            # Long pozisyondayız -> YALNIZCA ÇIKIŞ (SELL) kurallarını kontrol et
            if exit_rules and exit_rules.get("conditions"):
                exit_result, exit_met = RuleEvaluator.evaluate_group(
                    exit_rules, df, bar_index, effective_params, multi_tf_data, current_pnl, cache
                )
                if exit_result:
                    return SignalType.SELL, exit_met

        elif position_state == "short":
            # Short pozisyondayız -> YALNIZCA GİRİŞ (BUY -> Long'a geçiş) kurallarını kontrol et
            if entry_rules and entry_rules.get("conditions"):
                entry_result, entry_met = RuleEvaluator.evaluate_group(
                    entry_rules, df, bar_index, effective_params, multi_tf_data, current_pnl, cache
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
        allow_short durumuna göre Spot/Long-Only veya Çift yönlü (Long & Short) simülasyon yapar.
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
        # Aralık boyunca aynı df sabit kaldığından, kullanılan her indikatör
        # serisi (isim+period başına) yalnızca bir kez hesaplanıp burada
        # önbelleğe alınır — aksi halde her bar için tüm seri yeniden
        # hesaplanır (O(n) yerine O(n^2), bkz. IndicatorRegistry.get_value).
        indicator_cache: dict = {}

        allow_short = strategy.get("allow_short", False)
        if "allow_short" in effective_params:
            allow_short = bool(effective_params["allow_short"])

        take_profit_pct = strategy.get("take_profit_pct")
        if "take_profit_pct" in effective_params and effective_params["take_profit_pct"] is not None:
            take_profit_pct = float(effective_params["take_profit_pct"])

        stop_loss_pct = strategy.get("stop_loss_pct")
        if "stop_loss_pct" in effective_params and effective_params["stop_loss_pct"] is not None:
            stop_loss_pct = float(effective_params["stop_loss_pct"])


        # Fiyat sütun adlarını büyük/küçük harf bağımsız bul
        close_col = next((col for col in df.columns if str(col).lower() == "close"), None)
        high_col = next((col for col in df.columns if str(col).lower() == "high"), None)
        low_col = next((col for col in df.columns if str(col).lower() == "low"), None)


        for i in range(start_index, end_index + 1):
            close_price = float(df.iloc[i][close_col]) if close_col else 0.0
            high_price = float(df.iloc[i][high_col]) if high_col else close_price
            low_price = float(df.iloc[i][low_col]) if low_col else close_price

            # Pozisyon kontrolü & TP/SL kontrolleri
            tp_sl_signal = None
            tp_sl_reason = []
            exec_price = close_price

            if position_state == "long" and last_entry_price is not None and last_entry_price > 0:
                pnl_high = ((high_price - last_entry_price) / last_entry_price) * 100.0
                pnl_low = ((low_price - last_entry_price) / last_entry_price) * 100.0
                pnl_close = ((close_price - last_entry_price) / last_entry_price) * 100.0

                # 1. Önce Zarar Durdur (Stop Loss) kontrol et
                if stop_loss_pct is not None and stop_loss_pct > 0 and (pnl_low <= -stop_loss_pct or pnl_close <= -stop_loss_pct):
                    tp_sl_signal = SignalType.SELL
                    tp_sl_reason = [f"Zarar Durdur (-%{stop_loss_pct})"]
                    exec_price = last_entry_price * (1.0 - (stop_loss_pct / 100.0))

                # 2. Sonra Kar Al (Take Profit) kontrol et
                elif take_profit_pct is not None and take_profit_pct > 0 and (pnl_high >= take_profit_pct or pnl_close >= take_profit_pct):
                    tp_sl_signal = SignalType.SELL
                    tp_sl_reason = [f"Kar Al (%{take_profit_pct})"]
                    exec_price = last_entry_price * (1.0 + (take_profit_pct / 100.0))

            elif position_state == "short" and last_entry_price is not None and last_entry_price > 0:
                pnl_high_loss = ((last_entry_price - high_price) / last_entry_price) * 100.0
                pnl_low_gain = ((last_entry_price - low_price) / last_entry_price) * 100.0
                pnl_close = ((last_entry_price - close_price) / last_entry_price) * 100.0

                # 1. Önce Zarar Durdur (Stop Loss) kontrol et
                if stop_loss_pct is not None and stop_loss_pct > 0 and (pnl_high_loss <= -stop_loss_pct or pnl_close <= -stop_loss_pct):
                    tp_sl_signal = SignalType.BUY
                    tp_sl_reason = [f"Zarar Durdur (-%{stop_loss_pct})"]
                    exec_price = last_entry_price * (1.0 + (stop_loss_pct / 100.0))

                # 2. Sonra Kar Al (Take Profit) kontrol et
                elif take_profit_pct is not None and take_profit_pct > 0 and (pnl_low_gain >= take_profit_pct or pnl_close >= take_profit_pct):
                    tp_sl_signal = SignalType.BUY
                    tp_sl_reason = [f"Kar Al (%{take_profit_pct})"]
                    exec_price = last_entry_price * (1.0 - (take_profit_pct / 100.0))

            unrealized_pnl = 0.0
            if position_state == "long" and last_entry_price is not None and last_entry_price > 0:
                unrealized_pnl = ((close_price - last_entry_price) / last_entry_price) * 100.0
            elif position_state == "short" and last_entry_price is not None and last_entry_price > 0:
                unrealized_pnl = ((last_entry_price - close_price) / last_entry_price) * 100.0

            if tp_sl_signal is not None:
                signal = tp_sl_signal
                conditions_met = tp_sl_reason
            else:
                signal, conditions_met = RuleEngine.evaluate_bar_with_state(
                    strategy=strategy,
                    df=df,
                    bar_index=i,
                    position_state=position_state,
                    effective_params=effective_params,
                    multi_tf_data=multi_tf_data,
                    current_pnl=unrealized_pnl,
                    cache=indicator_cache,
                )

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
                    "price": round(exec_price, 4),
                    "conditions_met": conditions_met,
                }

                if position_state == "short" and last_entry_price is not None and last_entry_price > 0:
                    # Short pozisyonunu kapat ve Short PnL % hesapla
                    short_pnl = ((last_entry_price - exec_price) / last_entry_price) * 100.0
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
                    "price": round(exec_price, 4),
                    "conditions_met": conditions_met,
                }

                if position_state == "long" and last_entry_price is not None and last_entry_price > 0:
                    # Long pozisyonunu kapat ve Long PnL % hesapla
                    long_pnl = ((exec_price - last_entry_price) / last_entry_price) * 100.0
                    sig_item["entry_price"] = round(last_entry_price, 4)
                    sig_item["pnl_percent"] = round(long_pnl, 2)
                    sig_item["position_closed"] = "LONG"

                if allow_short:
                    position_state = "short"
                    last_entry_price = close_price
                else:
                    position_state = "none"
                    last_entry_price = None

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
