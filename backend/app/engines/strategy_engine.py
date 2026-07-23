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

    def list_strategies(self) -> list[dict]:
        """Tüm kayıtlı stratejileri listeler."""
        strategies = []
        for filepath in sorted(self.strategies_dir.glob("*.json")):
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    data = json.load(f)
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

    def create_strategy(self, request: StrategyCreateRequest) -> dict:
        """Yeni strateji oluşturur ve JSON dosyası olarak kaydeder."""
        strategy = StrategyModel(
            name=request.name,
            description=request.description,
            parameters=request.parameters,
            entry_rules=request.entry_rules,
            exit_rules=request.exit_rules,
            timeframe_filters=request.timeframe_filters,
        )

        data = strategy.model_dump()
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
    ) -> dict:
        """
        Stratejiyi verilen veri üzerinde değerlendirir.

        Args:
            strategy_id: Strateji ID
            df: OHLCV DataFrame
            param_overrides: Parametre override'ları
            multi_tf_data: Çoklu timeframe verileri

        Returns:
            Değerlendirme sonucu dict'i
        """
        strategy = self.get_strategy(strategy_id)
        if strategy is None:
            raise ValueError(f"Strateji bulunamadı: {strategy_id}")

        if param_overrides is None:
            param_overrides = {}

        signals = RuleEngine.evaluate_range(
            strategy=strategy,
            df=df,
            params=param_overrides,
            multi_tf_data=multi_tf_data,
        )

        buy_count = sum(1 for s in signals if s["signal"] == "BUY")
        sell_count = sum(1 for s in signals if s["signal"] == "SELL")

        return {
            "strategy_id": strategy_id,
            "strategy_name": strategy.get("name", ""),
            "total_bars": len(df),
            "signals": signals,
            "buy_count": buy_count,
            "sell_count": sell_count,
        }
