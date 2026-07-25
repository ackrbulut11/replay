"""
Tarayıcı ve Tarama Geçmişi Motoru.

Strateji tarama sonuçlarını storage/scans/ klasörü altında JSON dosyalarında saklar ve yönetir.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from app.rules.strategy_models import BatchEvaluateResultItem, ScanHistoryItem

_CURRENT_DIR = Path(__file__).resolve().parent
_PROJECT_ROOT = _CURRENT_DIR
while _PROJECT_ROOT and not (_PROJECT_ROOT / "storage").exists():
    parent = _PROJECT_ROOT.parent
    if parent == _PROJECT_ROOT:
        break
    _PROJECT_ROOT = parent

SCANS_DIR = _PROJECT_ROOT / "storage" / "scans"


class ScannerEngine:
    """Tarama sonuçlarını kaydeden ve listeleyen motor."""

    def __init__(self, scans_dir: str | Path | None = None):
        self.scans_dir = Path(scans_dir) if scans_dir else SCANS_DIR
        self.scans_dir.mkdir(parents=True, exist_ok=True)

    def _get_history_file(self, strategy_id: str) -> Path:
        return self.scans_dir / f"{strategy_id}_scans.json"

    def save_scan(
        self,
        strategy_id: str,
        strategy_name: str,
        provider: str,
        timeframe: str,
        results: List[dict | BatchEvaluateResultItem],
    ) -> ScanHistoryItem:
        """Tarama sonucunu stratejiye özel geçmiş dosyasına ekler (en son tarama en başta)."""
        history_file = self._get_history_file(strategy_id)

        formatted_results = []
        for r in results:
            if isinstance(r, dict):
                formatted_results.append(BatchEvaluateResultItem(**r))
            elif hasattr(r, "dict"):
                formatted_results.append(BatchEvaluateResultItem(**r.dict()))
            else:
                formatted_results.append(r)

        scan_item = ScanHistoryItem(
            scan_id=str(uuid.uuid4())[:8],
            strategy_id=strategy_id,
            strategy_name=strategy_name,
            provider=provider,
            timeframe=timeframe,
            created_at=datetime.utcnow().isoformat() + "Z",
            scanned_count=len(formatted_results),
            results=formatted_results,
        )

        history = self.get_scans(strategy_id)
        history.insert(0, scan_item.dict())
        history = history[:20]

        with open(history_file, "w", encoding="utf-8") as f:
            json.dump(history, f, ensure_ascii=False, indent=2)

        return scan_item

    def get_scans(self, strategy_id: str) -> list[dict]:
        """Bir stratejiye ait geçmiş tarama sonuçlarını döndürür."""
        history_file = self._get_history_file(strategy_id)
        if not history_file.exists():
            return []

        try:
            with open(history_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return []

    def get_latest_scan(self, strategy_id: str) -> Optional[dict]:
        """Bir stratejiye ait en son yapılan tarama sonucunu döndürür."""
        scans = self.get_scans(strategy_id)
        return scans[0] if scans else None
