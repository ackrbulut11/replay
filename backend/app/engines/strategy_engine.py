"""
Strateji Değerlendirme Motoru.

JSON strateji dosyalarını yükleme/kaydetme/silme (CRUD) ve
rule engine çağrısı koordinasyonunu sağlar.

Stratejiler storage/strategies/{strategy_id}.json formatında saklanır (RULES.md #4).
"""

from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Union

import pandas as pd

from app.rules.engine import RuleEngine
from app.rules.strategy_models import (
    StrategyCreateRequest,
    StrategyModel,
    StrategyUpdateRequest,
)

# Proje kök dizininden storage/strategies/ yolunu hesapla
_CURRENT_DIR = Path(__file__).resolve().parent
_PROJECT_ROOT = _CURRENT_DIR
while _PROJECT_ROOT and not (_PROJECT_ROOT / "storage").exists():
    parent = _PROJECT_ROOT.parent
    if parent == _PROJECT_ROOT:
        break
    _PROJECT_ROOT = parent

STRATEGIES_DIR = _PROJECT_ROOT / "storage" / "strategies"


class StrategyEngine:
    """
    Strateji CRUD ve değerlendirme motoru.

    İş mantığı burada, route dosyasına yazılmaz (RULES.md #9).
    """

    def __init__(self, strategies_dir: str | Path | None = None):
        self.strategies_dir = Path(strategies_dir) if strategies_dir else STRATEGIES_DIR
        self.strategies_dir.mkdir(parents=True, exist_ok=True)

    # ─── CRUD İşlemleri ────────────────────────────────────────────────────

    def list_strategies(self, user_id: str | None = None) -> list[dict]:
        """Tüm kayıtlı stratejileri listeler. user_id verilirse kullanıcıya özel filtreler."""
        strategies = []
        for filepath in sorted(self.strategies_dir.glob("*.json")):
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if user_id:
                    strat_user = data.get("user_id")
                    if strat_user and strat_user != user_id:
                        continue
                strategies.append(data)
            except (json.JSONDecodeError, IOError) as e:
                # Bozuk dosyaları atla
                print(f"Uyarı: {filepath} okunamadı: {e}")
        return strategies

    def get_strategy(self, strategy_id: str) -> dict | None:
        """Belirtilen ID'ye sahip stratejiyi döndürür."""
        filepath = self.strategies_dir / f"{strategy_id}.json"
        if not filepath.exists():
            return None
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return None

    def create_strategy(self, request: StrategyCreateRequest, user_id: str | None = None) -> dict:
        """Yeni strateji oluşturur ve JSON dosyası olarak kaydeder."""
        effective_user_id = user_id or request.user_id
        strategy = StrategyModel(
            name=request.name,
            description=request.description,
            user_id=effective_user_id,
            parameters=request.parameters,
            entry_rules=request.entry_rules,
            exit_rules=request.exit_rules,
            timeframe_filters=request.timeframe_filters,
            allow_short=request.allow_short,
            take_profit_pct=request.take_profit_pct,
            stop_loss_pct=request.stop_loss_pct,
        )

        data = strategy.model_dump()
        if effective_user_id:
            data["user_id"] = effective_user_id

        filepath = self.strategies_dir / f"{strategy.id}.json"

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        return data

    def update_strategy(self, strategy_id: str, request: StrategyUpdateRequest) -> dict | None:
        """Mevcut stratejiyi günceller."""
        existing = self.get_strategy(strategy_id)
        if existing is None:
            return None

        # Sadece gönderilen alanları güncelle
        if request.name is not None:
            existing["name"] = request.name
        if request.description is not None:
            existing["description"] = request.description
        if request.parameters is not None:
            existing["parameters"] = [p.model_dump() for p in request.parameters]
        if request.entry_rules is not None:
            existing["entry_rules"] = request.entry_rules.model_dump()
        if request.exit_rules is not None:
            existing["exit_rules"] = request.exit_rules.model_dump()
        if request.timeframe_filters is not None:
            existing["timeframe_filters"] = [tf.model_dump() for tf in request.timeframe_filters]
        if request.allow_short is not None:
            existing["allow_short"] = request.allow_short
        if request.take_profit_pct is not None:
            existing["take_profit_pct"] = request.take_profit_pct
        if request.stop_loss_pct is not None:
            existing["stop_loss_pct"] = request.stop_loss_pct


        # Güncelleme zamanını ayarla
        existing["updated_at"] = datetime.utcnow().isoformat() + "Z"
        existing["version"] = existing.get("version", 1) + 1

        filepath = self.strategies_dir / f"{strategy_id}.json"
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(existing, f, ensure_ascii=False, indent=2)

        return existing

    def delete_strategy(self, strategy_id: str) -> bool:
        """Stratejiyi siler."""
        filepath = self.strategies_dir / f"{strategy_id}.json"
        if not filepath.exists():
            return False
        filepath.unlink()
        return True

    # ─── Değerlendirme ────────────────────────────────────────────────────

    def evaluate(
        self,
        strategy_id: str,
        df: pd.DataFrame,
        param_overrides: dict[str, Union[int, float]] | None = None,
        multi_tf_data: dict[str, pd.DataFrame] | None = None,
        allow_short: bool | None = None,
    ) -> dict:
        """
        Stratejiyi verilen veri üzerinde değerlendirir.
        """
        strategy = self.get_strategy(strategy_id)
        if strategy is None:
            raise ValueError(f"Strateji bulunamadı: {strategy_id}")

        if param_overrides is None:
            param_overrides = {}

        if allow_short is not None:
            param_overrides["allow_short"] = allow_short

        signals = RuleEngine.evaluate_range(
            strategy=strategy,
            df=df,
            params=param_overrides,
            multi_tf_data=multi_tf_data,
        )

        buy_count = sum(1 for s in signals if s["signal"] == "BUY")
        sell_count = sum(1 for s in signals if s["signal"] == "SELL")

        trades = [s for s in signals if s.get("pnl_percent") is not None]
        total_trades = len(trades)
        winning_trades = sum(1 for s in trades if s["pnl_percent"] > 0)
        losing_trades = sum(1 for s in trades if s["pnl_percent"] < 0)
        win_rate = round((winning_trades / total_trades) * 100.0, 2) if total_trades > 0 else 0.0
        total_pnl_percent = round(sum(s["pnl_percent"] for s in trades), 2)

        return {
            "strategy_id": strategy_id,
            "strategy_name": strategy.get("name", ""),
            "total_bars": len(df),
            "signals": signals,
            "buy_count": buy_count,
            "sell_count": sell_count,
            "total_trades": total_trades,
            "winning_trades": winning_trades,
            "losing_trades": losing_trades,
            "win_rate": win_rate,
            "total_pnl_percent": total_pnl_percent,
        }

    def evaluate_symbol(
        self,
        strategy_id: str,
        symbol: str,
        provider: str,
        timeframe: str,
        loader,
        start_dt,
        end_dt,
        limit_bars: int = 1000,
        param_overrides: dict | None = None,
        allow_short: bool | None = None,
    ) -> dict:
        """Tek bir sembolü yükler ve değerlendirir (batch yardımcı fonksiyonu)."""
        try:
            df = loader.load_data(
                provider_name=provider,
                symbol=symbol,
                timeframe=timeframe,
                start_time=start_dt,
                end_time=end_dt,
            )
            if df.empty:
                return {
                    "symbol": symbol,
                    "error": "Veri bulunamadı",
                }

            if limit_bars > 0 and len(df) > limit_bars:
                df = df.tail(limit_bars).reset_index(drop=True)

            res = self.evaluate(
                strategy_id=strategy_id,
                df=df,
                param_overrides=param_overrides,
                allow_short=allow_short,
            )

            last_sig = res["signals"][-1] if res["signals"] else None

            return {
                "symbol": symbol,
                "total_bars": res["total_bars"],
                "buy_count": res["buy_count"],
                "sell_count": res["sell_count"],
                "total_trades": res["total_trades"],
                "winning_trades": res["winning_trades"],
                "losing_trades": res["losing_trades"],
                "win_rate": res["win_rate"],
                "total_pnl_percent": res["total_pnl_percent"],
                "last_signal": last_sig["signal"] if last_sig else None,
                "last_signal_time": last_sig["timestamp"] if last_sig else None,
                "error": None,
            }
        except Exception as e:
            return {
                "symbol": symbol,
                "error": str(e),
            }

    def evaluate_batch(
        self,
        strategy_id: str,
        symbols: list[str],
        provider: str,
        timeframe: str,
        loader,
        start_dt,
        end_dt,
        limit_bars: int = 1000,
        param_overrides: dict | None = None,
        allow_short: bool | None = None,
        max_workers: int = 10,
    ) -> list[dict]:
        """Tüm sembol grubunu paralel olarak değerlendirir."""
        from concurrent.futures import ThreadPoolExecutor

        results = []
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = [
                executor.submit(
                    self.evaluate_symbol,
                    strategy_id=strategy_id,
                    symbol=sym,
                    provider=provider,
                    timeframe=timeframe,
                    loader=loader,
                    start_dt=start_dt,
                    end_dt=end_dt,
                    limit_bars=limit_bars,
                    param_overrides=param_overrides,
                    allow_short=allow_short,
                )
                for sym in symbols
            ]

            for future in futures:
                try:
                    res = future.result()
                    results.append(res)
                except Exception as ex:
                    print(f"Batch evaluation error: {ex}")

        # PnL'e göre büyükten küçüğe sırala
        results.sort(key=lambda x: x.get("total_pnl_percent", 0.0) if x.get("error") is None else -99999, reverse=True)
        return results

