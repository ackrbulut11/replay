"""
Strateji Motoru Pydantic Modelleri.

Strateji JSON şeması, koşullar, parametreler, timeframe filtreleri ve
API istek/yanıt modelleri burada tanımlanır.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Any, Union, Optional, List, Dict

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
    PNL = "pnl"


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


class PnlOperand(BaseModel):
    """Pozisyon Kar/Zarar yüzdesi operandı (ör. %3.5 kâr, -%2.0 zarar)."""

    type: OperandType = OperandType.PNL


# Birleşik operand tipi
Operand = Union[IndicatorOperand, PriceOperand, ValueOperand, PnlOperand]



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
    user_id: Optional[str] = Field(None, description="Stratejinin ait olduğu kullanıcı ID")
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
    allow_short: bool = Field(
        False, description="Short pozisyon açılsın mı? False ise sadece elindekini satıp nakite geçer."
    )
    take_profit_pct: Optional[float] = Field(None, description="Yüzde Kar Al (Take Profit %), örn: 3.5 = %3.5 kârda sat")
    stop_loss_pct: Optional[float] = Field(None, description="Yüzde Zarar Durdur (Stop Loss %), örn: 2.0 = %2.0 zararda sat")
    commission_bps: float = Field(
        0.0,
        ge=0,
        le=1000,
        description=(
            "Her BACAK icin komisyon, baz puan (1 bps = %0,01). Binance spot taker ~10 bps. "
            "Giris ve cikis ayri ayri alinir."
        ),
    )
    slippage_bps: float = Field(
        0.0,
        ge=0,
        le=1000,
        description="Emrin istenen fiyattan ne kadar kotu doldugu (bps). Alista yukari, satista asagi.",
    )
    bar_delay: int = Field(
        1,
        ge=0,
        le=10,
        description=(
            "Sinyal ile emrin gerçekleşmesi arasındaki mum sayısı (RULES.md #22). "
            "1 (varsayılan): sinyal kapanan mumdan üretilir, işlem bir sonraki mumun "
            "açılışından yapılır. 0: intrabar — aynı mumun kapanışından işlem; "
            "sonuçları iyimserleştirdiği için yalnızca açıkça intrabar test edilirken kullanılır."
        ),
    )


# ─── API İstek/Yanıt Modelleri ───────────────────────────────────────────────


class StrategyCreateRequest(BaseModel):
    """Yeni strateji oluşturma isteği."""

    name: str = Field(..., min_length=1, max_length=100, description="Strateji adı")
    description: str = Field("", max_length=500, description="Strateji açıklaması")
    user_id: Optional[str] = Field(None, description="Kullanıcı ID (opsiyonel)")
    parameters: List[StrategyParameterModel] = Field(default_factory=list)
    entry_rules: ConditionGroupModel = Field(
        default_factory=lambda: ConditionGroupModel(logic=LogicType.AND, conditions=[])
    )
    exit_rules: ConditionGroupModel = Field(
        default_factory=lambda: ConditionGroupModel(logic=LogicType.AND, conditions=[])
    )
    timeframe_filters: List[TimeframeFilterModel] = Field(default_factory=list)
    allow_short: bool = Field(False, description="Short pozisyon açılsın mı?")
    take_profit_pct: Optional[float] = Field(None, description="Yüzde Kar Al (Take Profit %)")
    stop_loss_pct: Optional[float] = Field(None, description="Yüzde Zarar Durdur (Stop Loss %)")
    commission_bps: float = Field(0.0, ge=0, le=1000, description="Bacak basina komisyon (bps)")
    slippage_bps: float = Field(0.0, ge=0, le=1000, description="Slipaj (bps)")
    bar_delay: int = Field(1, ge=0, le=10, description="Sinyal → gerçekleşme gecikmesi (mum). 0 = intrabar.")


class StrategyUpdateRequest(BaseModel):
    """Strateji güncelleme isteği — tüm alanlar opsiyonel."""

    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    parameters: Optional[List[StrategyParameterModel]] = None
    entry_rules: Optional[ConditionGroupModel] = None
    exit_rules: Optional[ConditionGroupModel] = None
    timeframe_filters: Optional[List[TimeframeFilterModel]] = None
    allow_short: Optional[bool] = None
    take_profit_pct: Optional[float] = None
    stop_loss_pct: Optional[float] = None
    commission_bps: Optional[float] = Field(None, ge=0, le=1000)
    slippage_bps: Optional[float] = Field(None, ge=0, le=1000)
    bar_delay: Optional[int] = Field(None, ge=0, le=10)



class EvaluateRequest(BaseModel):
    """Strateji değerlendirme isteği."""

    symbol: str = Field(..., description="Sembol (ör. BTCUSDT, AAPL, THYAO)")
    provider: str = Field(..., description="Veri sağlayıcı (binance, nasdaq, bist)")
    timeframe: str = Field(..., description="Ana zaman dilimi (ör. 15m, 1h, 1d)")
    start: Optional[str] = Field(None, description="Başlangıç tarihi (YYYY-MM-DD)")
    end: Optional[str] = Field(None, description="Bitiş tarihi (YYYY-MM-DD)")
    limit_bars: Optional[int] = Field(1000, description="Değerlendirilecek maksimum mum sayısı (varsayılan: 1000, azami: 10000)")
    allow_short: Optional[bool] = Field(None, description="Short pozisyon açılsın mı?")
    param_overrides: Dict[str, Union[int, float]] = Field(
        default_factory=dict, description="Parametre override'ları"
    )
    starting_balance: float = Field(
        10000.0, gt=0, description="Nakit simulasyonu icin baslangic bakiyesi"
    )
    sizing: Optional[Dict[str, Union[str, float]]] = Field(
        None,
        description=(
            "Pozisyon boyutlandirma: {mode, value}. mode = fixed_units | fixed_cash | "
            "percent_equity | risk_percent. Verilmezse bakiyenin tamami kullanilir."
        ),
    )



class SignalResult(BaseModel):
    """Tek bir sinyal sonucu."""

    timestamp: int = Field(..., description="Emrin GERÇEKLEŞTİĞİ mumun unix timestamp'i (saniye)")
    signal: SignalType = Field(..., description="Sinyal tipi")
    price: float = Field(0.0, description="Gerçekleşme fiyatı (gecikmeli emirlerde sonraki mumun açılışı)")
    conditions_met: List[str] = Field(default_factory=list, description="Karşılanan koşulların açıklaması")
    signal_timestamp: Optional[int] = Field(
        None,
        description="Sinyali ÜRETEN kapanmış mumun timestamp'i; bar_delay=0 iken timestamp ile aynıdır",
    )
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
    # Tam metrik seti: Sharpe, max drawdown, profit factor, expectancy,
    # bakiye egrisi (reports/performance_report.py).
    performance: Optional[Dict[str, Any]] = None


class IndicatorInfo(BaseModel):
    """Kullanılabilir indikatör bilgisi."""

    name: str = Field(..., description="İndikatör adı")
    display_name: str = Field(..., description="Görüntüleme adı")
    category: str = Field(..., description="Kategori (trend, momentum, volatility)")
    default_period: int = Field(..., description="Varsayılan period")
    min_period: int = Field(1, description="Minimum period")
    max_period: int = Field(500, description="Maksimum period")
    fields: List[str] = Field(default_factory=list, description="Alt alanlar (ör. MACD -> MACD, signal, hist)")


class BatchEvaluateRequest(BaseModel):
    """Çoklu sembol strateji tarama isteği."""

    symbols: List[str] = Field(..., description="Taranacak sembol listesi (ör. ['BTCUSDT', 'ETHUSDT'])")
    provider: str = Field("binance", description="Veri sağlayıcı (binance, bist, nasdaq)")
    timeframe: str = Field("1d", description="Zaman dilimi (15m, 1h, 1d)")
    start: Optional[str] = Field(None, description="Başlangıç tarihi (YYYY-MM-DD)")
    end: Optional[str] = Field(None, description="Bitiş tarihi (YYYY-MM-DD)")
    limit_bars: Optional[int] = Field(1000, description="Maksimum mum sayısı (azami: 10000)")
    allow_short: Optional[bool] = Field(None, description="Short pozisyon izni")
    param_overrides: Dict[str, Union[int, float]] = Field(default_factory=dict)
    starting_balance: float = Field(
        10000.0, gt=0, description="Nakit simulasyonu icin baslangic bakiyesi"
    )
    sizing: Optional[Dict[str, Union[str, float]]] = Field(
        None,
        description=(
            "Pozisyon boyutlandirma: {mode, value}. mode = fixed_units | fixed_cash | "
            "percent_equity | risk_percent. Verilmezse bakiyenin tamami kullanilir."
        ),
    )


class BatchEvaluateResultItem(BaseModel):
    """Tek bir sembol için tarama sonucu."""

    symbol: str
    total_bars: int = 0
    buy_count: int = 0
    sell_count: int = 0
    total_trades: int = 0
    winning_trades: int = 0
    losing_trades: int = 0
    win_rate: float = 0.0
    total_pnl_percent: float = 0.0
    last_signal: Optional[str] = None
    last_signal_time: Optional[int] = None
    # Getiriyi tek basina gostermek yaniltici: ayni getiriyi buyuk dususle
    # alan bir strateji ayni degildir.
    max_drawdown_pct: Optional[float] = None
    profit_factor: Optional[float] = None
    sharpe_ratio: Optional[float] = None
    error: Optional[str] = None


class ScanHistoryItem(BaseModel):
    """Kayıtlı tarama geçmişi öğesi.

    `status`: "running" (arka planda devam ediyor) | "done" | "error".
    Tarama arka planda ilerledikçe `results`/`scanned_count` kademeli olarak dolar.
    """

    scan_id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    strategy_id: str
    strategy_name: str
    provider: str
    timeframe: str
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")
    scanned_count: int
    total_symbols: Optional[int] = None
    status: str = "done"
    error: Optional[str] = None
    results: List[BatchEvaluateResultItem]


class SaveScanRequest(BaseModel):
    """Tarama sonucunu kaydetme isteği."""

    provider: str
    timeframe: str
    results: List[BatchEvaluateResultItem]

