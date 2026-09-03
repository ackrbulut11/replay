"""
Alert Models for Price & Indicator Alarms.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Optional, Dict, List
from pydantic import BaseModel, Field


class AlertTargetType(str, Enum):
    PRICE = "price"
    EMA = "EMA"
    SMA = "SMA"
    RSI = "RSI"
    MACD = "MACD"
    ATR = "ATR"
    BOLLINGER = "BollingerBands"
    EMA_CROSS = "EMA_CROSS"
    PERCENT_CHANGE = "PERCENT_CHANGE"


class AlertCondition(str, Enum):
    RISES_ABOVE = "rises_above"  # >
    FALLS_BELOW = "falls_below"  # <


class AlertStatus(str, Enum):
    ACTIVE = "ACTIVE"
    TRIGGERED = "TRIGGERED"
    DISABLED = "DISABLED"


class AlertCreateRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=32, pattern=r"^[A-Za-z0-9./^=_-]+$")
    provider: str = Field(default="binance", min_length=1, max_length=16, pattern=r"^[a-z]+$")
    timeframe: str = Field(default="1d", pattern=r"^(1m|5m|15m|1h|4h|1d|1w|1mo)$")
    target_type: AlertTargetType = AlertTargetType.PRICE
    indicator_period: Optional[int] = Field(default=14, ge=1, le=500)
    indicator_period_fast: Optional[int] = Field(default=20, ge=1, le=500)
    indicator_period_slow: Optional[int] = Field(default=50, ge=1, le=500)
    indicator_field: Optional[str] = Field(default=None, max_length=64)  # ör. MACD_hist, BB_upper
    condition: AlertCondition = AlertCondition.RISES_ABOVE
    threshold_value: float
    note: Optional[str] = Field(default=None, max_length=1000)


class AlertUpdateRequest(BaseModel):
    status: Optional[AlertStatus] = None
    threshold_value: Optional[float] = None
    note: Optional[str] = Field(default=None, max_length=1000)


class AlertModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    symbol: str = Field(min_length=1, max_length=32, pattern=r"^[A-Za-z0-9./^=_-]+$")
    provider: str = Field(default="binance", min_length=1, max_length=16, pattern=r"^[a-z]+$")
    timeframe: str = "1d"
    target_type: AlertTargetType
    indicator_period: Optional[int] = 14
    indicator_period_fast: Optional[int] = 20
    indicator_period_slow: Optional[int] = 50
    indicator_field: Optional[str] = None
    condition: AlertCondition
    threshold_value: float
    note: Optional[str] = None
    status: AlertStatus = AlertStatus.ACTIVE
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")
    triggered_at: Optional[str] = None
    last_value: Optional[float] = None

    @property
    def label(self) -> str:
        symbol_upper = self.symbol.upper()
        cond_str = ">" if self.condition == AlertCondition.RISES_ABOVE else "<"
        if self.target_type == AlertTargetType.PRICE:
            target_str = f"{symbol_upper} Price"
        else:
            period_str = f"({self.indicator_period})" if self.indicator_period else ""
            target_str = f"{self.target_type.value}{period_str}"
        return f"{target_str} {cond_str} {self.threshold_value}"


class AlertCheckRequest(BaseModel):
    """Alarm değerlendirme isteği.

    Yalnızca hangi sembolün alarmlarının kontrol edileceğini söyler. Fiyat ve
    gösterge değerleri sunucuda hesaplanır; istemciden gelen sayılara
    güvenilmez (bkz. AlertEngine.check_alerts).
    """

    symbol: str
    provider: str = "binance"
    # Eski istemcilerle uyum için kabul edilir, KULLANILMAZ.
    current_price: Optional[float] = None
    indicator_values: Optional[Dict[str, float]] = None


class AlertCheckResponse(BaseModel):
    checked_count: int
    triggered_alerts: List[AlertModel]
