"""
Alarm Motoru.

Alarm tanımlarını `alerts` tablosunda, kullanıcıya bağlı olarak saklar ve
değerlendirir. Bir kullanıcı yalnızca kendi alarmlarını görebilir/değiştirebilir.

Fiyat ve gösterge değerleri SUNUCUDA hesaplanır (bkz. `check_alerts`):
göstergenin tek doğruluk kaynağı `indicators/registry.py`'dir (RULES.md #8)
ve finansal hesap arayüze yazılmaz (RULES.md "Yasaklar").

İş mantığı burada, route dosyasına yazılmaz (RULES.md #9).
"""

from __future__ import annotations

import math
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
from app.data.loader import lookback_start_for_bars
from app.database.models import Alert
from app.indicators.registry import IndicatorRegistry
from app.rules.conditions import cross_above, cross_below

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
    def _series_value(row: Alert, df, bar_index: int) -> Optional[float]:
        """Alarmın izlediği büyüklüğün `bar_index`'teki değeri.

        Değer, sunucudaki veriden ve `IndicatorRegistry` ile hesaplanır —
        göstergenin tek doğruluk kaynağı orasıdır (RULES.md #8) ve istemciden
        gelen bir sayıya güvenilmez.
        """
        if bar_index < 0 or bar_index >= len(df):
            return None

        target_type = row.target_type

        if target_type == AlertTargetType.PRICE.value:
            return float(df["close"].iloc[bar_index])

        if target_type == AlertTargetType.PERCENT_CHANGE.value:
            if bar_index < 1:
                return None
            prev_close = float(df["close"].iloc[bar_index - 1])
            if prev_close == 0:
                return None
            return (float(df["close"].iloc[bar_index]) / prev_close - 1.0) * 100.0

        if target_type == AlertTargetType.EMA_CROSS.value:
            fast_period = row.indicator_period_fast or 20
            slow_period = row.indicator_period_slow or 50
            fast = IndicatorRegistry.get_value("EMA", df, int(fast_period), bar_index)
            slow = IndicatorRegistry.get_value("EMA", df, int(slow_period), bar_index)
            if math.isnan(fast) or math.isnan(slow):
                return None
            # İki ortalamanın FARKI; kesişim bu farkın işaret değiştirmesidir.
            return fast - slow

        period = int(row.indicator_period or IndicatorRegistry.get_info(target_type)["default_period"])
        value = IndicatorRegistry.get_value(
            target_type, df, period, bar_index, row.indicator_field or None
        )
        return None if math.isnan(value) else float(value)

    @staticmethod
    def _is_triggered(row: Alert, current_val: float, previous_val: Optional[float]) -> bool:
        """Alarmın tetiklenip tetiklenmediğine karar verir."""
        rises = row.condition == AlertCondition.RISES_ABOVE.value

        if row.target_type == AlertTargetType.EMA_CROSS.value:
            # GERÇEK kesişim: farkın işaret değiştirmesi. Eskiden yalnızca
            # işarete bakılıyordu ("fast şu an slow'un üstünde mi"), yani
            # kesişim çoktan olmuş bir sembolde alarm kurulur kurulmaz
            # tetikleniyordu — arayüzde "Golden / Death Cross" yazmasına rağmen.
            if previous_val is None:
                return False
            # Operatör mantığı rule engine ile ortak (RULES.md #8).
            crossed = cross_above if rises else cross_below
            return crossed(current_val, 0.0, prev_left=previous_val, prev_right=0.0)

        threshold = row.threshold_value

        if row.target_type == AlertTargetType.PERCENT_CHANGE.value and not rises:
            # Düşüş alarmı pozitif eşikle de tanımlanabilir (ör. "%5 düşerse").
            limit = -abs(threshold) if threshold > 0 else threshold
            return current_val <= limit

        return current_val >= threshold if rises else current_val <= threshold

    @staticmethod
    def _required_bars(row: Alert) -> int:
        """Alarmı değerlendirmek için gereken en az mum sayısı."""
        target_type = row.target_type
        if target_type == AlertTargetType.PRICE.value:
            warmup = 1
        elif target_type == AlertTargetType.PERCENT_CHANGE.value:
            warmup = 2
        elif target_type == AlertTargetType.EMA_CROSS.value:
            warmup = max(int(row.indicator_period_fast or 20), int(row.indicator_period_slow or 50))
        else:
            period = int(row.indicator_period or IndicatorRegistry.get_info(target_type)["default_period"])
            warmup = IndicatorRegistry.warmup_bars(target_type, period)
        # +2: kesişim tespiti için bir önceki bar da gerekli, +1 tampon.
        return warmup + 2

    def check_alerts(
        self,
        db: Session,
        symbol: str,
        provider: str,
        user_id: str,
        loader,
    ) -> List[dict]:
        """
        Kullanıcının bir sembole ait etkin alarmlarını değerlendirir.

        Fiyat ve gösterge değerleri SUNUCUDA, alarmın kendi zaman diliminde
        yüklenen veriden hesaplanır. Eskiden bunlar istekle birlikte
        istemciden geliyordu; çağıran taraf gösterge değerlerini hiç
        göndermediği için fiyat dışındaki TÜM alarm tipleri (RSI, EMA, MACD,
        ATR, BollingerBands, EMA kesişimi, yüzde değişim) sessizce hiç
        tetiklenmiyordu.

        Aynı sembolde farklı zaman dilimlerine kurulmuş alarmlar için veri
        dilim başına bir kez yüklenir.

        Tetiklenenleri TRIGGERED olarak işaretler ve döndürür.
        """
        rows = (
            db.query(Alert)
            .filter(
                Alert.user_id == user_id,
                Alert.symbol == symbol.upper(),
                Alert.provider == provider.lower(),
                Alert.status == AlertStatus.ACTIVE.value,
            )
            .all()
        )
        if not rows:
            return []

        # Zaman dilimi -> o dilimde gereken azami mum sayısı
        needed: Dict[str, int] = {}
        for row in rows:
            tf = row.timeframe or "1d"
            try:
                needed[tf] = max(needed.get(tf, 0), self._required_bars(row))
            except ValueError:
                # Tanımsız gösterge tipi: bu alarm değerlendirilemez, atlanır.
                continue

        frames: Dict[str, object] = {}
        for tf, bars in needed.items():
            end_dt = datetime.utcnow()
            try:
                df = loader.load_data(
                    provider_name=provider,
                    symbol=symbol,
                    timeframe=tf,
                    start_time=lookback_start_for_bars(end_dt, tf, bars),
                    end_time=end_dt,
                )
            except Exception as exc:
                # Veri gelmiyorsa alarm DEĞERLENDİRİLMEZ. Alternatif (istemcinin
                # gönderdiği fiyata düşmek) doğrulanmamış veriyle tetikleme
                # yapmak olurdu.
                print(f"Alarm verisi yüklenemedi ({symbol} {tf}): {exc}")
                continue
            if df is not None and not df.empty:
                frames[tf] = df

        triggered: List[dict] = []

        for row in rows:
            df = frames.get(row.timeframe or "1d")
            if df is None or len(df) == 0:
                continue

            last = len(df) - 1
            current_val = self._series_value(row, df, last)
            if current_val is None:
                continue
            previous_val = self._series_value(row, df, last - 1)

            row.last_value = current_val

            # Bayrak her alarm için sıfırdan hesaplanır. Önceden döngü dışında
            # tutuluyordu; bir alarm tetiklendiğinde değer sonraki alarma
            # sızıyor ve onu da yanlışlıkla tetikliyordu.
            if self._is_triggered(row, current_val, previous_val):
                row.status = AlertStatus.TRIGGERED.value
                row.triggered_at = datetime.utcnow()
                triggered.append(self._row_to_dict(row))

        db.commit()
        return triggered
