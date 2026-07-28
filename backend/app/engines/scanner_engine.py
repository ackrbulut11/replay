"""
Tarayıcı ve Tarama Geçmişi Motoru.

Strateji toplu tarama (batch evaluate) sonuçlarını `strategy_scans` tablosunda,
kullanıcıya bağlı olarak saklar ve listeler. Bir kullanıcı yalnızca kendi
taramalarını görebilir.
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from sqlalchemy.orm import Session

from app.database.models import StrategyScan
from app.rules.strategy_models import BatchEvaluateResultItem, ScanHistoryItem

# Strateji başına saklanacak azami tarama sayısı; aşan en eski kayıtlar silinir.
MAX_SCANS_PER_STRATEGY = 20


class ScannerEngine:
    """Tarama sonuçlarını kaydeden ve listeleyen motor (veritabanı destekli)."""

    @staticmethod
    def _normalize_results(results: List[dict | BatchEvaluateResultItem]) -> list[dict]:
        """Karışık gelen sonuç listesini düz sözlük listesine çevirir."""
        normalized: list[dict] = []
        for r in results:
            if isinstance(r, dict):
                normalized.append(BatchEvaluateResultItem(**r).model_dump())
            elif isinstance(r, BatchEvaluateResultItem):
                normalized.append(r.model_dump())
            elif hasattr(r, "model_dump"):
                normalized.append(r.model_dump())
            else:
                normalized.append(dict(r))
        return normalized

    @staticmethod
    def _row_to_item(row: StrategyScan) -> dict:
        """Veritabanı satırını arayüzün beklediği ScanHistoryItem sözlüğüne çevirir."""
        return ScanHistoryItem(
            scan_id=row.id,
            strategy_id=row.strategy_id,
            strategy_name=row.strategy_name or "",
            provider=row.provider,
            timeframe=row.timeframe,
            created_at=(row.created_at or datetime.utcnow()).isoformat() + "Z",
            scanned_count=row.scanned_count or 0,
            total_symbols=row.total_symbols,
            status=row.status or "done",
            error=row.error,
            results=[BatchEvaluateResultItem(**r) for r in (row.results or [])],
        ).model_dump()

    def save_scan(
        self,
        db: Session,
        strategy_id: str,
        strategy_name: str,
        provider: str,
        timeframe: str,
        results: List[dict | BatchEvaluateResultItem],
        user_id: str,
    ) -> dict:
        """Tarama sonucunu kaydeder ve en yeni kaydı döndürür."""
        normalized = self._normalize_results(results)

        row = StrategyScan(
            user_id=user_id,
            strategy_id=strategy_id,
            strategy_name=strategy_name,
            provider=provider,
            timeframe=timeframe,
            scanned_count=len(normalized),
            total_symbols=len(normalized),
            status="done",
            results=normalized,
        )
        db.add(row)
        db.commit()
        db.refresh(row)

        self._prune(db, strategy_id, user_id)
        return self._row_to_item(row)

    def _prune(self, db: Session, strategy_id: str, user_id: str) -> None:
        """Strateji başına saklanan tarama sayısını sınırlar (sınırsız birikmesin)."""
        stale = (
            db.query(StrategyScan)
            .filter(StrategyScan.strategy_id == strategy_id, StrategyScan.user_id == user_id)
            .order_by(StrategyScan.created_at.desc())
            .offset(MAX_SCANS_PER_STRATEGY)
            .all()
        )
        if not stale:
            return
        for row in stale:
            db.delete(row)
        db.commit()

    def get_scans(self, db: Session, strategy_id: str, user_id: str) -> list[dict]:
        """Bir stratejiye ait tarama geçmişini döndürür (en yeni en başta)."""
        rows = (
            db.query(StrategyScan)
            .filter(StrategyScan.strategy_id == strategy_id, StrategyScan.user_id == user_id)
            .order_by(StrategyScan.created_at.desc())
            .limit(MAX_SCANS_PER_STRATEGY)
            .all()
        )
        return [self._row_to_item(r) for r in rows]

    def get_latest_scan(self, db: Session, strategy_id: str, user_id: str) -> Optional[dict]:
        """Bir stratejiye ait en son taramayı döndürür."""
        row = (
            db.query(StrategyScan)
            .filter(StrategyScan.strategy_id == strategy_id, StrategyScan.user_id == user_id)
            .order_by(StrategyScan.created_at.desc())
            .first()
        )
        return self._row_to_item(row) if row else None

    def get_scan(self, db: Session, strategy_id: str, scan_id: str, user_id: str) -> Optional[dict]:
        """Tek bir taramanın (devam eden veya biten) güncel durumunu döndürür (yalnızca sahibi)."""
        row = (
            db.query(StrategyScan)
            .filter(
                StrategyScan.id == scan_id,
                StrategyScan.strategy_id == strategy_id,
                StrategyScan.user_id == user_id,
            )
            .first()
        )
        return self._row_to_item(row) if row else None

    def create_running_scan(
        self,
        db: Session,
        strategy_id: str,
        strategy_name: str,
        provider: str,
        timeframe: str,
        total_symbols: int,
        user_id: str,
    ) -> dict:
        """Arka planda çalışacak taramayı temsil eden boş bir kayıt oluşturur."""
        row = StrategyScan(
            user_id=user_id,
            strategy_id=strategy_id,
            strategy_name=strategy_name,
            provider=provider,
            timeframe=timeframe,
            scanned_count=0,
            total_symbols=total_symbols,
            status="running",
            results=[],
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return self._row_to_item(row)

    def append_scan_result(self, db: Session, scan_id: str, result: dict) -> None:
        """Arka plandaki tarama tek bir sembolü bitirdiğinde sonucu kayda ekler."""
        row = db.query(StrategyScan).filter(StrategyScan.id == scan_id).first()
        if not row:
            return
        normalized = BatchEvaluateResultItem(**result).model_dump()
        # JSON kolonunda değişikliğin algılanması için yeniden atama gerekir (in-place mutasyon yetmez).
        row.results = [*(row.results or []), normalized]
        row.scanned_count = len(row.results)
        db.commit()

    def finish_scan(self, db: Session, scan_id: str) -> None:
        """Taramayı tamamlandı olarak işaretler ve eski kayıtları budar."""
        row = db.query(StrategyScan).filter(StrategyScan.id == scan_id).first()
        if not row:
            return
        row.status = "done"
        db.commit()
        self._prune(db, row.strategy_id, row.user_id)

    def fail_scan(self, db: Session, scan_id: str, error: str) -> None:
        """Taramayı hata ile sonlanmış olarak işaretler."""
        row = db.query(StrategyScan).filter(StrategyScan.id == scan_id).first()
        if not row:
            return
        row.status = "error"
        row.error = error
        db.commit()
