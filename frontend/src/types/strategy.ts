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
  | 'between';

export type LogicType = 'AND' | 'OR';

export type SignalType = 'BUY' | 'SELL' | 'NEUTRAL';

export type OperandType = 'indicator' | 'price' | 'value';

export type ParameterType = 'int' | 'float';

// ─── Operand Tipleri ─────────────────────────────────────────────────────────

export interface IndicatorOperand {
  type: 'indicator';
  name: string;
  period: number | string; // sayı veya parametre referansı "$fast_ema"
  field?: string;
  timeframe?: string;
}

export interface PriceOperand {
  type: 'price';
  field: string; // open, high, low, close, volume
  timeframe?: string;
}

export interface ValueOperand {
  type: 'value';
  value: number | string; // sayı veya parametre referansı "$rsi_threshold"
}

export type Operand = IndicatorOperand | PriceOperand | ValueOperand;

// ─── Koşul Tipleri ───────────────────────────────────────────────────────────

export interface Condition {
  left: Operand;
  operator: OperatorType;
  right: Operand;
  right2?: Operand; // 'between' operatörü için
}

export interface ConditionGroup {
  logic: LogicType;
  conditions: Condition[];
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
  conditions: Condition[];
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
}

export interface StrategyUpdateRequest {
  name?: string;
  description?: string;
  parameters?: StrategyParameter[];
  entry_rules?: ConditionGroup;
  exit_rules?: ConditionGroup;
  timeframe_filters?: TimeframeFilter[];
  allow_short?: boolean;
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
}

export interface SignalResult {
  timestamp: number;
  signal: SignalType;
  price?: number;
  conditions_met: string[];
  entry_price?: number;
  pnl_percent?: number;
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
