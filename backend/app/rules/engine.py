"""
Kural Motoru (Rule Engine).

Strateji JSON'ını alır, gerekli indikatörleri hesaplar, kuralları değerlendirir.
Lookahead bias koruması: bar_index'e kadar olan veriye erişim.

Aynı strateji motoru canlı analiz ve replay'de kullanılır (RULES.md #3).
Stratejiler kod değil, veridir (RULES.md #4).

Emir gerçekleşme konvansiyonu (RULES.md #22): sinyal KAPANAN mumdan üretilir,
işlem BİR SONRAKİ mumun AÇILIŞINDAN gerçekleşir. Bkz. `DEFAULT_BAR_DELAY` ve
`evaluate_range`.
"""

from __future__ import annotations

from typing import Union

import pandas as pd

from app.indicators.registry import IndicatorRegistry
from app.rules.evaluator import RuleEvaluator
from app.rules.strategy_models import SignalType


# Sinyal üretimi ile emrin gerçekleşmesi arasındaki mum sayısı (RULES.md #22).
#
# 1 = sinyal bar i'nin kapanışında üretilir, pozisyon bar i+1'in açılışından
# açılır/kapanır. Aynı mumun kapanışını görüp yine aynı mumda işlem yapmak
# (0 = intrabar) varsayılan olarak yasaktır; backtest sonuçlarını sistematik
# olarak iyimserleştirir. Strateji `bar_delay` alanıyla açıkça 0 seçebilir —
# bunun "intrabar test ediyorum" beyanı olduğu kabul edilir.
DEFAULT_BAR_DELAY = 1

# TP/SL bu gecikmeye TABİ DEĞİLDİR: bunlar mum içinde piyasada duran koşullu
# emirlerdir, kapanışı görüp karar verilen bir sinyal değil. Seviyeye
# dokunulduğu anda ve tam o seviyeden gerçekleşirler (bkz. engines/replay_engine
# içindeki aynı konvansiyon).


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
        # Kapanışta üretilmiş ama henüz gerçekleşmemiş sinyal (bkz. bar_delay).
        pending_signal: dict | None = None
        # Aralık boyunca aynı df sabit kaldığından, kullanılan her indikatör
        # serisi (isim+period başına) yalnızca bir kez hesaplanıp burada
        # önbelleğe alınır — aksi halde her bar için tüm seri yeniden
        # hesaplanır (O(n) yerine O(n^2), bkz. IndicatorRegistry.get_value).
        indicator_cache: dict = {}

        bar_delay = RuleEngine._resolve_bar_delay(strategy, effective_params)

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
        # Gecikmeli emir bir SONRAKİ mumun açılışından gerçekleşir; açılış
        # sütunu yoksa (bazı testlerdeki sentetik df) kapanışa düşülür.
        open_col = next((col for col in df.columns if str(col).lower() == "open"), None)

        def _execute(
            signal: SignalType,
            conditions_met: list[str],
            exec_price: float,
            bar_index: int,
            timestamp: int,
            signal_bar_index: int,
            signal_timestamp: int,
            reverse: bool = True,
        ) -> None:
            """Bir sinyali gerçekleştirir: pozisyon durumunu günceller ve kaydı yazar.

            `bar_index`/`timestamp` emrin GERÇEKLEŞTİĞİ mumdur (grafikteki
            işaret oraya konur), `signal_*` ise sinyali üreten kapanmış mum.
            Gecikme yokken (bar_delay=0) ikisi aynıdır.

            `reverse=False` yalnızca pozisyonu KAPATIR, ters yöne geçmez —
            TP/SL çıkışları böyledir (bkz. çağrı yeri).
            """
            nonlocal position_state, last_entry_price

            item: dict = {
                "bar_index": bar_index,
                "timestamp": timestamp,
                "signal": signal.value,
                "price": round(exec_price, 4),
                "conditions_met": conditions_met,
                "signal_bar_index": signal_bar_index,
                "signal_timestamp": signal_timestamp,
            }

            # ── Açık pozisyonu kapat (varsa) ──────────────────────────────
            has_position = last_entry_price is not None and last_entry_price > 0
            if signal == SignalType.BUY and position_state == "short" and has_position:
                short_pnl = ((last_entry_price - exec_price) / last_entry_price) * 100.0
                item["entry_price"] = round(last_entry_price, 4)
                item["pnl_percent"] = round(short_pnl, 2)
                item["position_closed"] = "SHORT"
            elif signal == SignalType.SELL and position_state == "long" and has_position:
                long_pnl = ((exec_price - last_entry_price) / last_entry_price) * 100.0
                item["entry_price"] = round(last_entry_price, 4)
                item["pnl_percent"] = round(long_pnl, 2)
                item["position_closed"] = "LONG"

            # ── Yeni pozisyon durumu ──────────────────────────────────────
            if not reverse:
                # Risk yönetimi çıkışı: nakite geçilir, ters pozisyon açılmaz.
                position_state = "none"
                last_entry_price = None
            elif signal == SignalType.BUY:
                position_state = "long"
                last_entry_price = exec_price
            elif allow_short:
                position_state = "short"
                last_entry_price = exec_price
            else:
                position_state = "none"
                last_entry_price = None

            signals.append(item)

        for i in range(start_index, end_index + 1):
            close_price = float(df.iloc[i][close_col]) if close_col else 0.0
            high_price = float(df.iloc[i][high_col]) if high_col else close_price
            low_price = float(df.iloc[i][low_col]) if low_col else close_price
            open_price = float(df.iloc[i][open_col]) if open_col else close_price
            timestamp = RuleEngine._bar_timestamp(df, i)

            # ─── 1. Bekleyen sinyalin gerçekleşmesi ───────────────────────
            # Önceki mumun kapanışında üretilen emir, bu mumun AÇILIŞINDAN
            # gerçekleşir. TP/SL kontrolünden ÖNCE yapılır: pozisyon mumun
            # başında açıldığı için o mumun içindeki seviyeler onu bağlar.
            if pending_signal is not None and i >= pending_signal["execute_at"]:
                _execute(
                    signal=pending_signal["signal"],
                    conditions_met=pending_signal["conditions_met"],
                    exec_price=open_price,
                    bar_index=i,
                    timestamp=timestamp,
                    signal_bar_index=pending_signal["bar_index"],
                    signal_timestamp=pending_signal["timestamp"],
                )
                pending_signal = None

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

            # ─── 2. TP/SL gerçekleşmesi ──────────────────────────────────
            # Gecikmeye tabi değildir: piyasada duran koşullu emirlerdir,
            # seviyeye dokunulduğu anda gerçekleşirler.
            #
            # `reverse=False`: TP/SL bir risk yönetimi çıkışıdır, yön değiştirme
            # kararı değil. Eskiden allow_short açıkken zarar durdur emri
            # kendiliğinden bir SHORT açıyordu (ve short'un stop'u bir LONG) —
            # kullanıcının hiç kurmadığı bir "her zaman piyasada" stratejisi.
            if tp_sl_signal is not None:
                _execute(
                    signal=tp_sl_signal,
                    conditions_met=tp_sl_reason,
                    exec_price=exec_price,
                    bar_index=i,
                    timestamp=timestamp,
                    signal_bar_index=i,
                    signal_timestamp=timestamp,
                    reverse=False,
                )
                # Seviye tetiklenen mumda kural değerlendirilmez (mevcut
                # davranış korunuyor): pozisyon zaten bu mumda el değiştirdi.
                continue

            # ─── 3. Kural değerlendirmesi ────────────────────────────────
            # Bekleyen bir emir varken yenisi üretilmez; aksi halde gecikme
            # penceresi içindeki sinyaller üst üste binerdi.
            if pending_signal is not None:
                continue

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

            if signal == SignalType.NEUTRAL:
                continue

            if bar_delay <= 0:
                # İntrabar (açıkça seçildi): kapanışı görüp yine aynı mumun
                # kapanışından işlem yapılır.
                _execute(
                    signal=signal,
                    conditions_met=conditions_met,
                    exec_price=close_price,
                    bar_index=i,
                    timestamp=timestamp,
                    signal_bar_index=i,
                    signal_timestamp=timestamp,
                )
            else:
                pending_signal = {
                    "signal": signal,
                    "conditions_met": conditions_met,
                    "bar_index": i,
                    "timestamp": timestamp,
                    "execute_at": i + bar_delay,
                }

        return signals

    @staticmethod
    def _bar_timestamp(df: pd.DataFrame, bar_index: int) -> int:
        """Bir barın unix zaman damgasını (saniye) döndürür."""
        ts_val = df.iloc[bar_index].get("timestamp", 0)
        if hasattr(ts_val, "timestamp"):
            return int(ts_val.timestamp())
        if "time" in df.columns:
            time_val = df.iloc[bar_index]["time"]
            return int(time_val.timestamp()) if hasattr(time_val, "timestamp") else int(time_val)
        return int(ts_val) if ts_val else 0

    @staticmethod
    def _resolve_bar_delay(strategy: dict, params: dict) -> int:
        """Sinyal ile gerçekleşme arasındaki mum sayısı (RULES.md #22).

        Strateji alanı ya da parametre override'ı verilmemişse
        `DEFAULT_BAR_DELAY` (1 bar gecikme) kullanılır — yani varsayılan
        davranış kural uyumludur, intrabar açıkça seçilmelidir.
        """
        raw = params.get("bar_delay", strategy.get("bar_delay"))
        if raw is None:
            return DEFAULT_BAR_DELAY
        try:
            return max(int(raw), 0)
        except (TypeError, ValueError):
            return DEFAULT_BAR_DELAY


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

        Ham `period` yerine indikatörün GERÇEK ısınma gereksinimi kullanılır
        (bkz. `IndicatorRegistry.warmup_bars`): MACD(12) için 12 değil 35 bar.
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
                        try:
                            period = IndicatorRegistry.warmup_bars(operand.get("name", ""), period)
                        except ValueError:
                            # Bilinmeyen indikatör: değerlendirme sırasında zaten
                            # hata verecek; burada ham period'la yetin.
                            pass
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
