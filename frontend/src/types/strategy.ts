/**
 * Strateji Motoru TypeScript Tipleri.
 *
 * Backend Pydantic modellerinin frontend karşılıkları.
 */

// ─── Enum Tipleri ────────────────────────────────────────────────────────────

export type OperatorType =
  | '>'
  | '<'
  | '>='
  | '<='
  | '=='
  | '!='
  | 'cross_above'
  | 'cross_below'
  | 'between'
  // Sağ operand eşik değil, "kaç bar öncesine göre" anlamındadır.
  | 'rising'
  | 'falling';

export type LogicType = 'AND' | 'OR';

export type SignalType = 'BUY' | 'SELL' | 'NEUTRAL';

export type OperandType = 'indicator' | 'price' | 'value' | 'pnl' | 'expr';

/** Aritmetik operandın desteklediği işlemler. */
export type ArithmeticOp = '+' | '-' | '*' | '/';

export type ParameterType = 'int' | 'float';

// ─── Operand Tipleri ─────────────────────────────────────────────────────────

export interface IndicatorOperand {
  type: 'indicator';
  name: string;
  period: number | string; // sayı veya parametre referansı "$fast_ema"
  field?: string;
  timeframe?: string;
  /** Kaç bar GERİDEKİ değer okunsun (0 = mevcut bar). Negatif yasak (lookahead). */
  offset?: number;
}

export interface PriceOperand {
  type: 'price';
  field: string; // open, high, low, close, volume
  timeframe?: string;
  /** Kaç bar GERİDEKİ değer okunsun (0 = mevcut bar). */
  offset?: number;
}

export interface ValueOperand {
  type: 'value';
  value: number | string; // sayı veya parametre referansı "$rsi_threshold"
}

export interface PnlOperand {
  type: 'pnl';
}

/** Aritmetik ifade: `left <op> right`. "close - 2*ATR(14)" gibi. */
export interface ExprOperand {
  type: 'expr';
  op: ArithmeticOp;
  left: Operand;
  right: Operand;
}

export type Operand =
  | IndicatorOperand
  | PriceOperand
  | ValueOperand
  | PnlOperand
  | ExprOperand;


// ─── Koşul Tipleri ───────────────────────────────────────────────────────────

export interface Condition {
  left: Operand;
  operator: OperatorType;
  right: Operand;
  right2?: Operand; // 'between' operatörü için
}

/**
 * Koşul grubu.
 *
 * `conditions` hem düz koşul hem ALT GRUP içerebilir; böylece
 * `(A VE B) VEYA (C VE D)` ifade edilebilir.
 */
export interface ConditionGroup {
  logic: LogicType;
  conditions: Array<Condition | ConditionGroup>;
}

/** Bir öğe alt grup mu, düz koşul mu? (backend `is_condition_group` ile aynı ölçüt) */
export function isConditionGroup(item: Condition | ConditionGroup): item is ConditionGroup {
  return (item as ConditionGroup).conditions !== undefined;
}

// ─── Parametre Tipi ──────────────────────────────────────────────────────────

export interface StrategyParameter {
  name: string;
  type: ParameterType;
  default: number;
  min?: number;
  max?: number;
  description?: string;
}

// ─── Timeframe Filtre ────────────────────────────────────────────────────────

export interface TimeframeFilter {
  timeframe: string;
  logic: LogicType;
  conditions: Array<Condition | ConditionGroup>;
}

// ─── Strateji Modeli ─────────────────────────────────────────────────────────

export interface Strategy {
  id: string;
  name: string;
  description: string;
  version: number;
  created_at: string;
  updated_at: string;
  parameters: StrategyParameter[];
  entry_rules: ConditionGroup;
  exit_rules: ConditionGroup;
  timeframe_filters: TimeframeFilter[];
  allow_short?: boolean;
  take_profit_pct?: number | null;
  stop_loss_pct?: number | null;
  /** Sinyal ile emrin gerçekleşmesi arasındaki mum sayısı. 1 = kural uyumlu, 0 = intrabar. */
  bar_delay?: number;
  /** Her bacak için komisyon, baz puan (1 bps = %0,01). */
  commission_bps?: number;
  /** Emrin istenen fiyattan ne kadar kötü dolduğu (bps). */
  slippage_bps?: number;
}

// ─── API İstek/Yanıt Tipleri ─────────────────────────────────────────────────

export interface StrategyCreateRequest {
  name: string;
  description?: string;
  parameters?: StrategyParameter[];
  entry_rules?: ConditionGroup;
  exit_rules?: ConditionGroup;
  timeframe_filters?: TimeframeFilter[];
  allow_short?: boolean;
  take_profit_pct?: number | null;
  stop_loss_pct?: number | null;
  /** Sinyal ile emrin gerçekleşmesi arasındaki mum sayısı. 1 = kural uyumlu, 0 = intrabar. */
  bar_delay?: number;
  /** Her bacak için komisyon, baz puan (1 bps = %0,01). */
  commission_bps?: number;
  /** Emrin istenen fiyattan ne kadar kötü dolduğu (bps). */
  slippage_bps?: number;
}

export interface StrategyUpdateRequest {
  name?: string;
  description?: string;
  parameters?: StrategyParameter[];
  entry_rules?: ConditionGroup;
  exit_rules?: ConditionGroup;
  timeframe_filters?: TimeframeFilter[];
  allow_short?: boolean;
  take_profit_pct?: number | null;
  stop_loss_pct?: number | null;
  /** Sinyal ile emrin gerçekleşmesi arasındaki mum sayısı. 1 = kural uyumlu, 0 = intrabar. */
  bar_delay?: number;
  /** Her bacak için komisyon, baz puan (1 bps = %0,01). */
  commission_bps?: number;
  /** Emrin istenen fiyattan ne kadar kötü dolduğu (bps). */
  slippage_bps?: number;
}

/** Pozisyon boyutlandırma kuralı. */
export type SizingMode = 'fixed_units' | 'fixed_cash' | 'percent_equity' | 'risk_percent';

export interface PositionSizing {
  mode: SizingMode;
  /** Anlamı moda göre değişir: adet / tutar / bakiye yüzdesi / risk yüzdesi. */
  value: number;
}

export interface EvaluateRequest {
  symbol: string;
  provider: string;
  timeframe: string;
  start?: string;
  end?: string;
  limit_bars?: number;
  allow_short?: boolean;
  param_overrides?: Record<string, number>;
  /** Nakit simülasyonu için başlangıç bakiyesi. */
  starting_balance?: number;
  sizing?: PositionSizing;
}

export interface SignalResult {
  /** Emrin GERÇEKLEŞTİĞİ mumun zamanı. */
  timestamp: number;
  signal: SignalType;
  price?: number;
  conditions_met: string[];
  entry_price?: number;
  pnl_percent?: number;
  /** Sinyali ÜRETEN kapanmış mumun zamanı; bar_delay=0 iken timestamp ile aynı. */
  signal_timestamp?: number;
}

/** `reports/performance_report.py` çıktısı. Tanımsız metrikler null döner. */
export interface PerformanceReport {
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  breakeven_trades: number;
  win_rate: number | null;
  loss_rate: number | null;
  net_profit: number;
  net_profit_pct: number | null;
  weighted_return_pct: number | null;
  gross_profit: number;
  gross_loss: number;
  profit_factor: number | null;
  average_win: number | null;
  average_loss: number | null;
  expectancy: number | null;
  largest_win: number | null;
  largest_loss: number | null;
  max_drawdown: number;
  max_drawdown_pct: number | null;
  sharpe_ratio: number | null;
  starting_balance: number;
  ending_balance: number;
  equity_curve: number[];
}

export interface BuyAndHoldResult {
  return_pct: number | null;
  entry_price: number | null;
  exit_price: number | null;
}

export interface EvaluateResponse {
  strategy_id: string;
  strategy_name: string;
  symbol: string;
  provider: string;
  timeframe: string;
  total_bars: number;
  signals: SignalResult[];
  buy_count: number;
  sell_count: number;
  total_trades?: number;
  winning_trades?: number;
  losing_trades?: number;
  win_rate?: number;
  total_pnl_percent?: number;
  /** Sharpe, drawdown, profit factor, bakiye eğrisi. */
  performance?: PerformanceReport | null;
  /** Aynı dönemde al-tut getirisi. */
  buy_and_hold?: BuyAndHoldResult | null;
  /** Stratejinin al-tut'a göre farkı. Pozitifse strateji öndedir. */
  outperformance_pct?: number | null;
}

export interface SingleEvaluationLogItem {
  id: string;
  strategy_id: string;
  strategy_name: string;
  symbol: string;
  provider: string;
  timeframe: string;
  executed_at: string;
  total_bars: number;
  total_trades: number;
  win_rate: number;
  total_pnl_percent: number;
  /** Testi üreten istek parametreleri — geçmişten seçilince form bu değerlerle geri yüklenir. */
  request?: EvaluateRequest;
  /** Testin tam sonucu (sinyaller dahil) — değerlendirme paneli bunu birebir gösterir. */
  result: EvaluateResponse;
}

// ─── İndikatör Bilgisi ───────────────────────────────────────────────────────

export interface IndicatorInfo {
  name: string;
  display_name: string;
  category: string;
  default_period: number;
  min_period: number;
  max_period: number;
  fields: string[];
}

// ─── Operatör Listesi ────────────────────────────────────────────────────────

export const OPERATORS: { value: OperatorType; label: string; description: string }[] = [
  { value: '>', label: '>', description: 'Büyüktür' },
  { value: '<', label: '<', description: 'Küçüktür' },
  { value: '>=', label: '≥', description: 'Büyük eşit' },
  { value: '<=', label: '≤', description: 'Küçük eşit' },
  { value: '==', label: '=', description: 'Eşittir' },
  { value: '!=', label: '≠', description: 'Eşit değil' },
  { value: 'cross_above', label: '↗ Yukarı Kesişim', description: 'Yukarı kesişim' },
  { value: 'cross_below', label: '↘ Aşağı Kesişim', description: 'Aşağı kesişim' },
  { value: 'between', label: '⟷ Arada', description: 'Arada (between)' },
];

export const PRICE_FIELDS = ['close', 'open', 'high', 'low', 'volume'];

export const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'];

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

export function createEmptyCondition(): Condition {
  return {
    left: { type: 'indicator', name: 'EMA', period: 20 },
    operator: '>',
    right: { type: 'indicator', name: 'EMA', period: 50 },
  };
}

export function createEmptyConditionGroup(): ConditionGroup {
  return {
    logic: 'AND',
    conditions: [],
  };
}

export function createEmptyStrategy(): StrategyCreateRequest {
  return {
    name: '',
    description: '',
    parameters: [],
    entry_rules: createEmptyConditionGroup(),
    exit_rules: createEmptyConditionGroup(),
    timeframe_filters: [],
    allow_short: false,
  };
}

// ─── Çoklu Sembol Tarama Tipleri ──────────────────────────────────────────────

export interface BatchEvaluateRequest {
  symbols: string[];
  provider: string;
  timeframe: string;
  start?: string;
  end?: string;
  limit_bars?: number;
  allow_short?: boolean;
  param_overrides?: Record<string, number>;
}

export interface BatchEvaluateResultItem {
  symbol: string;
  total_bars: number;
  buy_count: number;
  sell_count: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  total_pnl_percent: number;
  last_signal?: string | null;
  last_signal_time?: number | null;
  error?: string | null;
}

/** Tarama durumu: "running" arka planda devam ediyor, "done"/"error" tamamlandı. */
export type ScanStatus = 'running' | 'done' | 'error';

export interface ScanHistoryItem {
  scan_id: string;
  strategy_id: string;
  strategy_name: string;
  provider: string;
  timeframe: string;
  created_at: string;
  scanned_count: number;
  total_symbols?: number | null;
  status: ScanStatus;
  error?: string | null;
  results: BatchEvaluateResultItem[];
}

export interface SaveScanRequest {
  provider: string;
  timeframe: string;
  results: BatchEvaluateResultItem[];
}

