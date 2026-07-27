"""
Alarm Motoru.

Alarm tanımlarını `alerts` tablosunda, kullanıcıya bağlı olarak saklar ve
değerlendirir. Bir kullanıcı yalnızca kendi alarmlarını görebilir/değiştirebilir.

İş mantığı burada, route dosyasına yazılmaz (RULES.md #9).
"""

from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from app.alerts.models import (
    AlertCondition,
    AlertCreateRequest,
    AlertStatus,
    AlertTargetType,
    AlertUpdateRequest,
)
from app.database.models import Alert

# AlertModel ile birebir eşleşen kolonlar (satır -> sözlük çevirisinde kullanılır)
_PLAIN_FIELDS = (
    "id",
    "user_id",
    "symbol",
    "provider",
    "timeframe",
    "target_type",
    "indicator_period",
    "indicator_period_fast",
    "indicator_period_slow",
    "indicator_field",
    "condition",
    "threshold_value",
    "note",
    "status",
    "last_value",
)


def _iso(value: Optional[datetime]) -> Optional[str]:
    """datetime'ı arayüzün beklediği ISO 8601 + Z biçimine çevirir."""
    return value.isoformat() + "Z" if value else None


class AlertEngine:
    """Alarm yönetimi ve değerlendirme motoru (veritabanı destekli)."""

    @staticmethod
    def _row_to_dict(row: Alert) -> dict:
        data = {field: getattr(row, field) for field in _PLAIN_FIELDS}
        data["created_at"] = _iso(row.created_at) or (datetime.utcnow().isoformat() + "Z")
        data["triggered_at"] = _iso(row.triggered_at)
        return data

    # ─── CRUD İşlemleri ────────────────────────────────────────────────────

    def list_alerts(
        self,
        db: Session,
        user_id: str,
        symbol: Optional[str] = None,
        status: Optional[str] = None,
    ) -> List[dict]:
        """Kullanıcının alarmlarını listeler; sembol ve duruma göre filtrelenebilir."""
        query = db.query(Alert).filter(Alert.user_id == user_id)

        if symbol:
            query = query.filter(Alert.symbol == symbol.upper())
        if status:
            query = query.filter(Alert.status == status)

        rows = query.order_by(Alert.created_at.desc()).all()
        return [self._row_to_dict(r) for r in rows]

    def get_alert(self, db: Session, alert_id: str, user_id: str) -> Optional[dict]:
        """
        Alarmı döndürür — yalnızca sahibi ise.

        Sahibi değilse None döner; çağıran taraf bunu 404'e çevirir, böylece
        başkasına ait bir alarmın varlığı sızdırılmaz.
        """
        row = (
            db.query(Alert)
            .filter(Alert.id == alert_id, Alert.user_id == user_id)
            .first()
        )
        return self._row_to_dict(row) if row else None

    def create_alert(self, db: Session, request: AlertCreateRequest, user_id: str) -> dict:
        """Yeni alarm oluşturur. Sahip yalnızca `user_id` argümanından alınır."""
        row = Alert(
            user_id=user_id,
            symbol=request.symbol.upper(),
            provider=request.provider.lower(),
            timeframe=request.timeframe,
            target_type=request.target_type.value,
            indicator_period=request.indicator_period,
            indicator_period_fast=request.indicator_period_fast,
            indicator_period_slow=request.indicator_period_slow,
            indicator_field=request.indicator_field,
            condition=request.condition.value,
            threshold_value=request.threshold_value,
            note=request.note,
            status=AlertStatus.ACTIVE.value,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return self._row_to_dict(row)

    def update_alert(
        self,
        db: Session,
        alert_id: str,
        request: AlertUpdateRequest,
        user_id: str,
    ) -> Optional[dict]:
        """Mevcut alarmı günceller — yalnızca sahibi ise."""
        row = (
            db.query(Alert)
            .filter(Alert.id == alert_id, Alert.user_id == user_id)
            .first()
        )
        if row is None:
            return None

        if request.status is not None:
            row.status = request.status.value
            # Yeniden etkinleştirilen alarmın eski tetiklenme damgası kalmamalı.
            if request.status == AlertStatus.ACTIVE:
                row.triggered_at = None
        if request.threshold_value is not None:
            row.threshold_value = request.threshold_value
        if request.note is not None:
            row.note = request.note

        db.commit()
        db.refresh(row)
        return self._row_to_dict(row)

    def delete_alert(self, db: Session, alert_id: str, user_id: str) -> bool:
        """Alarmı siler — yalnızca sahibi ise."""
        row = (
            db.query(Alert)
            .filter(Alert.id == alert_id, Alert.user_id == user_id)
            .first()
        )
        if row is None:
            return False
        db.delete(row)
        db.commit()
        return True

    # ─── Değerlendirme ────────────────────────────────────────────────────

    @staticmethod
    def _resolve_current_value(
        row: Alert,
        current_price: float,
        indicator_values: Dict[str, float],
    ) -> Optional[float]:
        """Alarmın izlediği büyüklüğün güncel değerini bulur."""
        target_type = row.target_type

        if target_type == AlertTargetType.PRICE.value:
            return current_price

        if target_type == AlertTargetType.EMA_CROSS.value:
            fast = indicator_values.get(f"EMA_{row.indicator_period_fast}")
            if fast is None:
                fast = indicator_values.get("EMA_fast")
            slow = indicator_values.get(f"EMA_{row.indicator_period_slow}")
            if slow is None:
                slow = indicator_values.get("EMA_slow")
            if fast is None or slow is None:
                return None
            return fast - slow

        if target_type == AlertTargetType.PERCENT_CHANGE.value:
            pct = indicator_values.get("percent_change")
            if pct is None:
                pct = indicator_values.get("pct_change")
            return pct

        # Gösterge sözlüğündeki olası anahtar biçimleri: 'RSI_14', 'RSI', alan adı
        for key in (
            f"{target_type}_{row.indicator_period}" if row.indicator_period else target_type,
            target_type,
            row.indicator_field or "",
        ):
            if key and key in indicator_values:
                return indicator_values[key]

        return None

    @staticmethod
    def _is_triggered(row: Alert, current_val: float) -> bool:
        """Alarmın tetiklenip tetiklenmediğine karar verir."""
        rises = row.condition == AlertCondition.RISES_ABOVE.value

        if row.target_type == AlertTargetType.EMA_CROSS.value:
            # Kesişimde eşik değeri değil, iki ortalamanın farkının işareti bakılır.
            return current_val >= 0 if rises else current_val <= 0

        threshold = row.threshold_value

        if row.target_type == AlertTargetType.PERCENT_CHANGE.value and not rises:
            # Düşüş alarmı pozitif eşikle de tanımlanabilir (ör. "%5 düşerse").
            limit = -abs(threshold) if threshold > 0 else threshold
            return current_val <= limit

        return current_val >= threshold if rises else current_val <= threshold

    def check_alerts(
        self,
        db: Session,
        symbol: str,
        provider: str,
        current_price: float,
        user_id: str,
        indicator_values: Optional[Dict[str, float]] = None,
    ) -> List[dict]:
        """
        Kullanıcının bir sembole ait etkin alarmlarını değerlendirir.

        Tetiklenenleri TRIGGERED olarak işaretler ve döndürür.
        """
        if indicator_values is None:
            indicator_values = {}

        rows = (
            db.query(Alert)
            .filter(
                Alert.user_id == user_id,
                Alert.symbol == symbol.upper(),
                Alert.status == AlertStatus.ACTIVE.value,
            )
            .all()
        )

        triggered: List[dict] = []

        for row in rows:
            current_val = self._resolve_current_value(row, current_price, indicator_values)
            if current_val is None:
                continue

            row.last_value = current_val

            # Bayrak her alarm için sıfırdan hesaplanır. Önceden döngü dışında
            # tutuluyordu; bir alarm tetiklendiğinde değer sonraki alarma
            # sızıyor ve onu da yanlışlıkla tetikliyordu.
            if self._is_triggered(row, current_val):
                row.status = AlertStatus.TRIGGERED.value
                row.triggered_at = datetime.utcnow()
                triggered.append(self._row_to_dict(row))

        db.commit()
        return triggered
