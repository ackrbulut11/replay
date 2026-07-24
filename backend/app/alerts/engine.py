"""
Alert Engine for persistent storage and alert evaluation.

Stores alert definitions in storage/alerts/{alert_id}.json
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any

from app.alerts.models import (
    AlertCreateRequest,
    AlertModel,
    AlertStatus,
    AlertCondition,
    AlertTargetType,
    AlertUpdateRequest,
)

# Project root calculation
_CURRENT_DIR = Path(__file__).resolve().parent
_PROJECT_ROOT = _CURRENT_DIR
while _PROJECT_ROOT and not (_PROJECT_ROOT / "storage").exists():
    parent = _PROJECT_ROOT.parent
    if parent == _PROJECT_ROOT:
        break
    _PROJECT_ROOT = parent

ALERTS_DIR = _PROJECT_ROOT / "storage" / "alerts"


class AlertEngine:
    """Alert management and evaluation engine."""

    def __init__(self, alerts_dir: Optional[str | Path] = None):
        self.alerts_dir = Path(alerts_dir) if alerts_dir else ALERTS_DIR
        self.alerts_dir.mkdir(parents=True, exist_ok=True)

    def list_alerts(self, symbol: Optional[str] = None, status: Optional[str] = None) -> List[dict]:
        """Lists saved alerts with optional filtering."""
        alerts = []
        for filepath in sorted(self.alerts_dir.glob("*.json")):
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    data = json.load(f)

                if symbol and data.get("symbol", "").upper() != symbol.upper():
                    continue

                if status and data.get("status") != status:
                    continue

                alerts.append(data)
            except (json.JSONDecodeError, IOError) as e:
                print(f"Warning: Failed to read alert file {filepath}: {e}")

        return alerts

    def get_alert(self, alert_id: str) -> Optional[dict]:
        """Gets a single alert by ID."""
        filepath = self.alerts_dir / f"{alert_id}.json"
        if not filepath.exists():
            return None
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return None

    def create_alert(self, request: AlertCreateRequest) -> dict:
        """Creates a new alert and persists it as JSON."""
        alert = AlertModel(
            symbol=request.symbol.upper(),
            provider=request.provider.lower(),
            timeframe=request.timeframe,
            target_type=request.target_type,
            indicator_period=request.indicator_period,
            indicator_field=request.indicator_field,
            condition=request.condition,
            threshold_value=request.threshold_value,
            note=request.note,
        )

        data = alert.model_dump()
        filepath = self.alerts_dir / f"{alert.id}.json"

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        return data

    def update_alert(self, alert_id: str, request: AlertUpdateRequest) -> Optional[dict]:
        """Updates an existing alert."""
        existing = self.get_alert(alert_id)
        if existing is None:
            return None

        if request.status is not None:
            existing["status"] = request.status.value
        if request.threshold_value is not None:
            existing["threshold_value"] = request.threshold_value
        if request.note is not None:
            existing["note"] = request.note

        filepath = self.alerts_dir / f"{alert_id}.json"
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(existing, f, ensure_ascii=False, indent=2)

        return existing

    def delete_alert(self, alert_id: str) -> bool:
        """Deletes an alert by ID."""
        filepath = self.alerts_dir / f"{alert_id}.json"
        if not filepath.exists():
            return False
        filepath.unlink()
        return True

    def check_alerts(
        self,
        symbol: str,
        provider: str,
        current_price: float,
        indicator_values: Optional[Dict[str, float]] = None,
    ) -> List[dict]:
        """
        Evaluates active alerts for a symbol against current price/indicator values.
        Marks triggered alerts as TRIGGERED.
        """
        if indicator_values is None:
            indicator_values = {}

        active_alerts = self.list_alerts(symbol=symbol, status=AlertStatus.ACTIVE.value)
        triggered_list = []

        for alert in active_alerts:
            target_type = alert.get("target_type")
            threshold = alert.get("threshold_value")
            condition = alert.get("condition")

            current_val = None
            if target_type == AlertTargetType.PRICE.value:
                current_val = current_price
            elif target_type == AlertTargetType.EMA_CROSS.value:
                fast_period = alert.get("indicator_period_fast", 20)
                slow_period = alert.get("indicator_period_slow", 50)
                fast_val = indicator_values.get(f"EMA_{fast_period}") or indicator_values.get("EMA_fast")
                slow_val = indicator_values.get(f"EMA_{slow_period}") or indicator_values.get("EMA_slow")
                if fast_val is not None and slow_val is not None:
                    current_val = fast_val - slow_val
                    # For EMA_CROSS, threshold is 0 (or diff)
                    if condition == AlertCondition.RISES_ABOVE.value:
                        is_triggered = fast_val >= slow_val
                    else:
                        is_triggered = fast_val <= slow_val
            elif target_type == AlertTargetType.PERCENT_CHANGE.value:
                pct_val = indicator_values.get("percent_change") or indicator_values.get("pct_change")
                if pct_val is not None:
                    current_val = pct_val
                    if condition == AlertCondition.RISES_ABOVE.value:
                        is_triggered = pct_val >= threshold
                    else:
                        is_triggered = pct_val <= -abs(threshold) if threshold > 0 else pct_val <= threshold
            else:
                # Check indicator values dictionary
                # Key formats can be 'RSI', 'EMA_20', 'RSI_14', etc.
                period = alert.get("indicator_period")
                field = alert.get("indicator_field")

                possible_keys = [
                    f"{target_type}_{period}" if period else target_type,
                    target_type,
                    field if field else "",
                ]

                for key in possible_keys:
                    if key and key in indicator_values:
                        current_val = indicator_values[key]
                        break

            if current_val is None and target_type not in (AlertTargetType.EMA_CROSS.value, AlertTargetType.PERCENT_CHANGE.value):
                continue

            alert["last_value"] = current_val

            if target_type not in (AlertTargetType.EMA_CROSS.value, AlertTargetType.PERCENT_CHANGE.value):
                if condition == AlertCondition.RISES_ABOVE.value and current_val >= threshold:
                    is_triggered = True
                elif condition == AlertCondition.FALLS_BELOW.value and current_val <= threshold:
                    is_triggered = True

            if is_triggered:
                alert["status"] = AlertStatus.TRIGGERED.value
                alert["triggered_at"] = datetime.utcnow().isoformat() + "Z"

                # Persist updated status
                filepath = self.alerts_dir / f"{alert['id']}.json"
                with open(filepath, "w", encoding="utf-8") as f:
                    json.dump(alert, f, ensure_ascii=False, indent=2)

                triggered_list.append(alert)

        return triggered_list
