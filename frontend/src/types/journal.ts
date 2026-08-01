/**
 * Trade Journal tipleri — backend `app/journal/models.py` ile birebir eşleşir.
 */

export type TradeSide = 'long' | 'short';
export type TradeStatus = 'OPEN' | 'CLOSED';
export type ExitReason = 'stop_loss' | 'take_profit' | 'manual';

export interface JournalTrade {
  id: string;
  user_id: string;
  session_id?: string | null;
  symbol: string;
  provider?: string | null;
  timeframe?: string | null;
  side: TradeSide;
  status?: TradeStatus | null;
  entry_price: number;
  exit_price?: number | null;
  quantity?: number | null;
  stop_loss?: number | null;
  take_profit?: number | null;
  /** Açık pozisyonda null — "gerçekleşmedi" ile "başabaş kapandı" ayrılsın diye. */
  pnl?: number | null;
  pnl_percent?: number | null;
  exit_reason?: ExitReason | null;
  reason?: string | null;
  notes?: string | null;
  screenshot?: string | null;
  entry_bar_index?: number | null;
  exit_bar_index?: number | null;
  entry_time?: string | null;
  exit_time?: string | null;
  created_at?: string | null;
  closed_at?: string | null;
}

export interface TradeOpenRequest {
  symbol: string;
  provider?: string;
  timeframe?: string;
  side: TradeSide;
  entry_price: number;
  quantity?: number;
  stop_loss?: number | null;
  take_profit?: number | null;
  entry_bar_index?: number | null;
  entry_time?: string | null;
  session_id?: string | null;
  reason?: string | null;
  notes?: string | null;
  screenshot?: string | null;
}

export interface TradeCloseRequest {
  exit_price: number;
  exit_bar_index?: number | null;
  exit_time?: string | null;
  exit_reason?: ExitReason;
}

export interface TradeUpdateRequest {
  reason?: string | null;
  notes?: string | null;
  screenshot?: string | null;
  stop_loss?: number | null;
  take_profit?: number | null;
}

/**
 * Performans raporu. Tanımsız metrikler `null` gelir — örneğin hiç zarar eden
 * işlem yokken Profit Factor sonsuz olurdu ve JSON'a yazılamazdı.
 */
export interface PerformanceReport {
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  breakeven_trades: number;
  win_rate: number | null;
  loss_rate: number | null;
  net_profit: number;
  net_profit_pct: number | null;
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
