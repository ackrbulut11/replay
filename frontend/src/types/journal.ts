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
  /** Kalıcı kaydedildi mi — aynı paritedeki sonraki replaylerde de görünür. */
  is_saved?: boolean;
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
  /**
   * Seviyeler yüzdeyle de verilebilir; mutlak fiyata çevrimi backend yapar
   * (finansal hesap arayüze yazılmaz). Mutlak fiyat verilirse o kazanır.
   */
  stop_loss_pct?: number | null;
  take_profit_pct?: number | null;
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
  /**
   * Pozisyon büyüklüğüne göre ağırlıklı toplam getiri: toplam kâr/zarar bölü
   * işlemlere bağlanan toplam sermaye. Yüzdeleri düz ortalamak yanıltıcı
   * olurdu — 10 birimlik %10 kâr ile 1 birimlik %10 zarar birbirini götürmez.
   */
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

// ─── Manuel vs Otomatik Karşılaştırma ────────────────────────────────────────

/**
 * Manuel replay oturumunun aynı pencerede çalıştırılmış strateji ile
 * karşılaştırması (backend `engines/comparison.py`).
 *
 * İki taraf da aynı performans raporundan ve aynı başlangıç bakiyesinden
 * geçer; aksi halde fark stratejiden değil varsayımlardan gelirdi.
 */
export interface SessionComparison {
  symbol: string;
  timeframe: string;
  window: { start: string; end: string };
  manual: PerformanceReport;
  strategy: {
    performance: PerformanceReport;
    total_trades: number;
    total_pnl_percent: number;
    signals: Array<{ timestamp: number; signal: string; price?: number; pnl_percent?: number }>;
    buy_and_hold?: { return_pct: number | null } | null;
  };
  /** Strateji − manuel. Pozitifse strateji önde. */
  delta: {
    /**
     * Asıl kıyas ölçüsü: bağlanan sermayeye göre getiri.
     *
     * Net kâr kıyas için kullanılamaz — iki taraf aynı tutarı riske atmıyor.
     * Manuel işlemin miktarı kullanıcının girdiği adettir (varsayılan 1),
     * strateji ise bakiyenin tamamını kullanır; BTCUSDT'de "1 adet" 60.000 $,
     * THYAO'da 300 ₺ demek.
     */
    weighted_return_pct: number | null;
    /** Bilgi amaçlı; tek başına okunmamalı (bkz. weighted_return_pct). */
    net_profit: number | null;
    win_rate: number | null;
    profit_factor: number | null;
    max_drawdown_pct: number | null;
    total_trades: number | null;
  };
  verdict: 'strateji' | 'manuel' | 'berabere' | 'belirsiz';
}
