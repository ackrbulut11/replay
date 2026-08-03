"""
Trade Journal Pydantic modelleri (istek/yanıt şemaları).

Veritabanı tablosu `database/models.py: JournalTrade` içindedir; burada
yalnızca API sözleşmesi tanımlanır (RULES.md #10: şema dışı JSON yasak).
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator

# Ekran görüntüsü data URL olarak gelebildiği için üst sınır konur; sınırsız
# blob biriktirmek SQLite'ı şişirir (RULES.md §24 ile aynı gerekçe).
MAX_SCREENSHOT_CHARS = 2_000_000  # ~1.5 MB'lık base64 görsel


class TradeSide(str, Enum):
    LONG = "long"
    SHORT = "short"


class TradeStatus(str, Enum):
    OPEN = "OPEN"
    CLOSED = "CLOSED"


class ExitReason(str, Enum):
    STOP_LOSS = "stop_loss"
    TAKE_PROFIT = "take_profit"
    MANUAL = "manual"


class TradeOpenRequest(BaseModel):
    """Replay sırasında yeni pozisyon açma isteği."""

    symbol: str
    provider: str = "binance"
    timeframe: str = "1h"
    side: TradeSide
    entry_price: float = Field(gt=0)
    quantity: float = Field(default=1.0, gt=0)
    stop_loss: Optional[float] = Field(default=None, gt=0)
    take_profit: Optional[float] = Field(default=None, gt=0)
    # Seviyeler yüzdeyle de verilebilir; mutlak fiyata çevirme işi backend'de
    # (`replay_engine.levels_from_percent`) yapılır — finansal hesap arayüze
    # yazılmaz (RULES.md "Yasaklar"). Her ikisi verilirse mutlak fiyat kazanır.
    stop_loss_pct: Optional[float] = Field(default=None, gt=0)
    take_profit_pct: Optional[float] = Field(default=None, gt=0)
    entry_bar_index: Optional[int] = None
    entry_time: Optional[datetime] = None
    session_id: Optional[str] = None
    reason: Optional[str] = None
    notes: Optional[str] = None
    screenshot: Optional[str] = None

    @field_validator("screenshot")
    @classmethod
    def _limit_screenshot(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and len(value) > MAX_SCREENSHOT_CHARS:
            raise ValueError("Ekran görüntüsü çok büyük (en fazla ~1.5 MB)")
        return value


class ReplaySessionCreateRequest(BaseModel):
    """Yeni bir replay oturumu başlatma isteği."""

    symbol: str
    timeframe: str = "1h"


class ReplaySessionResponse(BaseModel):
    """`replay_sessions` satırının API yanıtı — yalnızca kimliği ilgilendiren alanlar."""

    id: str
    symbol: str
    timeframe: str

    class Config:
        from_attributes = True


class TradeCloseRequest(BaseModel):
    """Açık pozisyonu kapatma isteği."""

    exit_price: float = Field(gt=0)
    exit_bar_index: Optional[int] = None
    exit_time: Optional[datetime] = None
    exit_reason: ExitReason = ExitReason.MANUAL


class TradeUpdateRequest(BaseModel):
    """
    İşlem günlüğü alanlarını günceller.

    Yalnızca not/sebep/ekran görüntüsü ve henüz açık pozisyonların
    seviyeleri değiştirilebilir; fiyat ve kâr/zarar geçmişe dönük
    düzeltilemez — aksi halde günlük güvenilirliğini yitirir.
    """

    reason: Optional[str] = None
    notes: Optional[str] = None
    screenshot: Optional[str] = None
    stop_loss: Optional[float] = Field(default=None, gt=0)
    take_profit: Optional[float] = Field(default=None, gt=0)

    @field_validator("screenshot")
    @classmethod
    def _limit_screenshot(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and len(value) > MAX_SCREENSHOT_CHARS:
            raise ValueError("Ekran görüntüsü çok büyük (en fazla ~1.5 MB)")
        return value


class TradeResponse(BaseModel):
    """Tek bir işlem kaydı."""

    id: str
    user_id: str
    session_id: Optional[str] = None
    symbol: str
    provider: Optional[str] = None
    timeframe: Optional[str] = None
    side: str
    status: Optional[str] = None
    entry_price: float
    exit_price: Optional[float] = None
    quantity: Optional[float] = None
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    pnl: Optional[float] = None
    pnl_percent: Optional[float] = None
    exit_reason: Optional[str] = None
    reason: Optional[str] = None
    notes: Optional[str] = None
    screenshot: Optional[str] = None
    entry_bar_index: Optional[int] = None
    exit_bar_index: Optional[int] = None
    entry_time: Optional[datetime] = None
    exit_time: Optional[datetime] = None
    created_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class PerformanceResponse(BaseModel):
    """
    `reports/performance_report.calculate_performance` çıktısı.

    Tanımsız metrikler `None` döner (ör. hiç zarar eden işlem yokken
    Profit Factor sonsuz olurdu).
    """

    total_trades: int
    winning_trades: int
    losing_trades: int
    breakeven_trades: int
    win_rate: Optional[float] = None
    loss_rate: Optional[float] = None
    net_profit: float
    net_profit_pct: Optional[float] = None
    gross_profit: float
    gross_loss: float
    profit_factor: Optional[float] = None
    average_win: Optional[float] = None
    average_loss: Optional[float] = None
    expectancy: Optional[float] = None
    largest_win: Optional[float] = None
    largest_loss: Optional[float] = None
    max_drawdown: float
    max_drawdown_pct: Optional[float] = None
    sharpe_ratio: Optional[float] = None
    starting_balance: float
    ending_balance: float
    equity_curve: list[float]
