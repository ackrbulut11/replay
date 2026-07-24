"""
Strateji Motoru Pydantic Modelleri.

Strateji JSON şeması, koşullar, parametreler, timeframe filtreleri ve
API istek/yanıt modelleri burada tanımlanır.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Union, Optional, List, Dict

from pydantic import BaseModel, Field


# ─── Enum Tanımları ────────────────────────────────────────────────────────────


class OperatorType(str, Enum):
    """Koşullarda kullanılabilecek operatörler."""

    GT = ">"
    LT = "<"
    GTE = ">="
    LTE = "<="
    EQ = "=="
    NEQ = "!="
    CROSS_ABOVE = "cross_above"
    CROSS_BELOW = "cross_below"
    BETWEEN = "between"


class LogicType(str, Enum):
    """Koşul grupları arası mantık operatörü."""

    AND = "AND"
    OR = "OR"


class SignalType(str, Enum):
    """Strateji sinyal tipleri."""

    BUY = "BUY"
    SELL = "SELL"
    NEUTRAL = "NEUTRAL"


class OperandType(str, Enum):
    """Koşul operandlarının tipleri."""

    INDICATOR = "indicator"
    PRICE = "price"
    VALUE = "value"


class ParameterType(str, Enum):
    """Strateji parametrelerinin tipleri."""

    INT = "int"
    FLOAT = "float"


# ─── Operand Modelleri ─────────────────────────────────────────────────────────


class IndicatorOperand(BaseModel):
    """İndikatör referansı olan operand (ör. EMA 20, RSI 14)."""

    type: OperandType = OperandType.INDICATOR
    name: str = Field(..., description="İndikatör adı: EMA, SMA, RSI, MACD, ATR, BollingerBands, ADX, VolumeMA")
    period: Union[int, str] = Field(..., description="Period değeri veya parametre referansı ($fast_ema)")
    field: Optional[str] = Field(None, description="İndikatör alt alanı (ör. MACD -> MACD, MACD_signal, MACD_hist)")
    timeframe: Optional[str] = Field(None, description="Farklı timeframe'den veri almak için (ör. '4h')")


class PriceOperand(BaseModel):
    """Fiyat verisi referansı (open, high, low, close, volume)."""

    type: OperandType = OperandType.PRICE
    field: str = Field(..., description="Fiyat alanı: open, high, low, close, volume")
    timeframe: Optional[str] = Field(None, description="Farklı timeframe'den veri almak için")


class ValueOperand(BaseModel):
    """Sabit değer veya parametre referansı."""

    type: OperandType = OperandType.VALUE
    value: Union[float, int, str] = Field(..., description="Sabit değer veya parametre referansı ($rsi_threshold)")


# Birleşik operand tipi
Operand = Union[IndicatorOperand, PriceOperand, ValueOperand]


# ─── Koşul Modelleri ──────────────────────────────────────────────────────────


class ConditionModel(BaseModel):
    """Tek bir karşılaştırma koşulu."""

    left: dict = Field(..., description="Sol operand")
    operator: OperatorType = Field(..., description="Karşılaştırma operatörü")
    right: dict = Field(..., description="Sağ operand")
    right2: Optional[dict] = Field(None, description="'between' operatörü için üst sınır operandı")


class ConditionGroupModel(BaseModel):
    """AND/OR mantığıyla bağlanmış koşullar grubu."""

    logic: LogicType = Field(LogicType.AND, description="Koşullar arası mantık operatörü")
    conditions: List[ConditionModel] = Field(default_factory=list, description="Koşullar listesi")


# ─── Parametre Modelleri ──────────────────────────────────────────────────────


class StrategyParameterModel(BaseModel):
    """Strateji parametresi tanımı — kod değiştirmeden ayarlanabilir değerler."""

    name: str = Field(..., description="Parametre adı (benzersiz, ör. fast_ema)")
    type: ParameterType = Field(ParameterType.INT, description="Parametre tipi")
    default: Union[int, float] = Field(..., description="Varsayılan değer")
    min: Optional[Union[int, float]] = Field(None, description="Minimum değer")
    max: Optional[Union[int, float]] = Field(None, description="Maksimum değer")
    description: str = Field("", description="Parametre açıklaması")


# ─── Timeframe Filtre Modeli ─────────────────────────────────────────────────


class TimeframeFilterModel(BaseModel):
    """Çoklu timeframe filtresi — farklı bir zaman diliminden koşul kontrolü."""

    timeframe: str = Field(..., description="Filtre zaman dilimi (ör. 4h, 1d)")
    logic: LogicType = Field(LogicType.AND, description="Filtre koşulları arası mantık")
    conditions: List[ConditionModel] = Field(default_factory=list, description="Filtre koşulları")


# ─── Strateji Modeli ─────────────────────────────────────────────────────────


class StrategyModel(BaseModel):
    """Tam strateji tanımı — JSON olarak storage/strategies/ altında saklanır."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8], description="Benzersiz strateji ID")
    name: str = Field(..., description="Strateji adı")
    description: str = Field("", description="Strateji açıklaması")
    version: int = Field(1, description="Strateji şema versiyonu")
    created_at: str = Field(
        default_factory=lambda: datetime.utcnow().isoformat() + "Z",
        description="Oluşturulma tarihi (ISO 8601)",
    )
    updated_at: str = Field(
        default_factory=lambda: datetime.utcnow().isoformat() + "Z",
        description="Son güncelleme tarihi (ISO 8601)",
    )
    parameters: List[StrategyParameterModel] = Field(default_factory=list, description="Ayarlanabilir parametreler")
    entry_rules: ConditionGroupModel = Field(
        default_factory=lambda: ConditionGroupModel(logic=LogicType.AND, conditions=[]),
        description="Giriş (BUY) kuralları",
    )
    exit_rules: ConditionGroupModel = Field(
        default_factory=lambda: ConditionGroupModel(logic=LogicType.AND, conditions=[]),
        description="Çıkış (SELL) kuralları",
    )
    timeframe_filters: List[TimeframeFilterModel] = Field(
        default_factory=list, description="Çoklu timeframe filtreleri"
    )


# ─── API İstek/Yanıt Modelleri ───────────────────────────────────────────────


class StrategyCreateRequest(BaseModel):
    """Yeni strateji oluşturma isteği."""

    name: str = Field(..., min_length=1, max_length=100, description="Strateji adı")
    description: str = Field("", max_length=500, description="Strateji açıklaması")
    parameters: List[StrategyParameterModel] = Field(default_factory=list)
    entry_rules: ConditionGroupModel = Field(
        default_factory=lambda: ConditionGroupModel(logic=LogicType.AND, conditions=[])
    )
    exit_rules: ConditionGroupModel = Field(
        default_factory=lambda: ConditionGroupModel(logic=LogicType.AND, conditions=[])
    )
    timeframe_filters: List[TimeframeFilterModel] = Field(default_factory=list)


class StrategyUpdateRequest(BaseModel):
    """Strateji güncelleme isteği — tüm alanlar opsiyonel."""

    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    parameters: Optional[List[StrategyParameterModel]] = None
    entry_rules: Optional[ConditionGroupModel] = None
    exit_rules: Optional[ConditionGroupModel] = None
    timeframe_filters: Optional[List[TimeframeFilterModel]] = None


class EvaluateRequest(BaseModel):
    """Strateji değerlendirme isteği."""

    symbol: str = Field(..., description="Sembol (ör. BTCUSDT, AAPL, THYAO)")
    provider: str = Field(..., description="Veri sağlayıcı (binance, nasdaq, bist)")
    timeframe: str = Field(..., description="Ana zaman dilimi (ör. 15m, 1h, 1d)")
    start: Optional[str] = Field(None, description="Başlangıç tarihi (YYYY-MM-DD)")
    end: Optional[str] = Field(None, description="Bitiş tarihi (YYYY-MM-DD)")
    limit_bars: Optional[int] = Field(1000, description="Değerlendirilecek maksimum mum sayısı (varsayılan: 1000)")
    param_overrides: Dict[str, Union[int, float]] = Field(
        default_factory=dict, description="Parametre override'ları"
    )


class SignalResult(BaseModel):
    """Tek bir sinyal sonucu."""

    timestamp: int = Field(..., description="Unix timestamp (saniye)")
    signal: SignalType = Field(..., description="Sinyal tipi")
    price: float = Field(0.0, description="Sinyal anındaki kapanış fiyatı")
    conditions_met: List[str] = Field(default_factory=list, description="Karşılanan koşulların açıklaması")
    entry_price: Optional[float] = Field(None, description="Alış fiyatı (SELL sinyalinde doldurulur)")
    pnl_percent: Optional[float] = Field(None, description="Kar/Zarar yüzdesi (SELL sinyalinde doldurulur)")


class EvaluateResponse(BaseModel):
    """Strateji değerlendirme yanıtı."""

    strategy_id: str
    strategy_name: str
    symbol: str
    provider: str
    timeframe: str
    total_bars: int
    signals: List[SignalResult]
    buy_count: int = 0
    sell_count: int = 0
    total_trades: int = 0
    winning_trades: int = 0
    losing_trades: int = 0
    win_rate: float = 0.0
    total_pnl_percent: float = 0.0


class IndicatorInfo(BaseModel):
    """Kullanılabilir indikatör bilgisi."""

    name: str = Field(..., description="İndikatör adı")
    display_name: str = Field(..., description="Görüntüleme adı")
    category: str = Field(..., description="Kategori (trend, momentum, volatility)")
    default_period: int = Field(..., description="Varsayılan period")
    min_period: int = Field(1, description="Minimum period")
    max_period: int = Field(500, description="Maksimum period")
    fields: List[str] = Field(default_factory=list, description="Alt alanlar (ör. MACD -> MACD, signal, hist)")
