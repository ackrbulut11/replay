/**
 * Piyasa verisi API servisi.
 *
 * Bileşenler doğrudan fetch çağırmaz (SKILLS.md Frontend); erişim buradan geçer.
 */

import { apiRequest as request } from './api';

const API_BASE = '/api/market';

/**
 * Bir zaman dilimi için önbellekteki tarih aralığı.
 *
 * `available: false` "veri yok" değil "bilinmiyor" demektir (önbellek henüz
 * oluşmamış); buna dayanarak kullanıcı engellenmemelidir.
 */
export interface MarketCoverage {
  available: boolean;
  provider: string;
  symbol: string;
  timeframe: string;
  /** ISO tarih — en eski mum. */
  first?: string;
  /** ISO tarih — en yeni mum. */
  last?: string;
  bars?: number;
}

export async function getCoverage(
  provider: string,
  symbol: string,
  timeframe: string
): Promise<MarketCoverage> {
  const params = new URLSearchParams({ provider, symbol, timeframe });
  return request<MarketCoverage>(`${API_BASE}/coverage?${params.toString()}`);
}

/** Grafik mumu — backend `_to_chart_candles` çıktısıyla birebir. */
export interface MarketCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /**
   * Mumun geldiği zaman dilimi. Yalnızca replay konumu istenen dilimin
   * ulaşabildiği geçmişten eskiyse gelir: pencere o dilimin EN ESKİ mumuna
   * çapalanır ve gerisine görsel süreklilik için bir üst dilimden dolgu
   * eklenir (bkz. backend loader `_prepend_display_fill`). Diğer tüm
   * pencerelerde alan hiç eklenmez.
   */
  tf?: string;
}

/**
 * `anchor` etrafındaki sabit sayıda mumu getirir (replay için).
 *
 * `/data` yerine bunu kullanmanın sebebi maliyetin çapanın ne kadar geride
 * olduğuna bağlı olmaması: `/data` bitişik önbellek tuttuğu için uzak bir
 * tarihte aradaki tüm boşluğu indiriyor (15dk'da 2019 = dakikalar), bu uç
 * ise hangi tarih olursa olsun ~0,65 s.
 *
 * `anchor` saniye cinsinden unix zaman damgasıdır (lightweight-charts biçimi).
 */
export async function getWindow(params: {
  provider: string;
  symbol: string;
  timeframe: string;
  anchor: number;
  barsBefore?: number;
  barsAfter?: number;
  signal?: AbortSignal;
}): Promise<MarketCandle[]> {
  const query = new URLSearchParams({
    provider: params.provider,
    symbol: params.symbol,
    timeframe: params.timeframe,
    anchor: String(Math.floor(params.anchor)),
  });
  if (params.barsBefore !== undefined) query.set('bars_before', String(params.barsBefore));
  if (params.barsAfter !== undefined) query.set('bars_after', String(params.barsAfter));

  return request<MarketCandle[]>(`${API_BASE}/window?${query.toString()}`, {
    signal: params.signal,
  });
}

/**
 * Bir tarih aralığındaki mumları getirir.
 *
 * Kıyaslama serileri için kullanılır: ana grafikte görünen aralık neyse
 * kıyaslanan sembol de aynı aralıkta çekilir.
 */
export async function getRange(params: {
  provider: string;
  symbol: string;
  timeframe: string;
  /** `YYYY-MM-DD` veya `YYYY-MM-DD HH:MM:SS`. */
  start: string;
  end: string;
  signal?: AbortSignal;
}): Promise<MarketCandle[]> {
  const query = new URLSearchParams({
    provider: params.provider,
    symbol: params.symbol,
    timeframe: params.timeframe,
    start: params.start,
    end: params.end,
  });

  return request<MarketCandle[]>(`${API_BASE}/data?${query.toString()}`, {
    signal: params.signal,
  });
}

/** Sembol katalog kaydı — backend `symbols.py` sözlükleriyle birebir. */
export interface MarketSymbol {
  symbol: string;
  name: string;
  sector?: string;
  exchange: string;
  ticker?: string;
}

/** Sembol kataloğunda arama yapar. Boş sorgu tüm katalogu döndürür. */
export async function searchSymbols(
  query: string,
  provider?: string
): Promise<MarketSymbol[]> {
  const params = new URLSearchParams({ q: query });
  if (provider) params.set('provider', provider);
  return request<MarketSymbol[]>(`${API_BASE}/search?${params.toString()}`);
}

/** Bir sembolün son fiyatı ve günlük değişimi. */
export interface MarketQuote {
  provider: string;
  symbol: string;
  lastPrice: number | null;
  change: number | null;
  changePercent: number | null;
}

/**
 * Birden fazla sembolün güncel fiyatını tek istekte getirir.
 *
 * `items`, "provider:symbol" biçiminde anahtarlardır (ör. `binance:BTCUSDT`).
 */
export async function getQuotes(items: string[]): Promise<MarketQuote[]> {
  if (items.length === 0) return [];
  const params = new URLSearchParams({ items: items.join(',') });
  return request<MarketQuote[]>(`${API_BASE}/quotes?${params.toString()}`);
}
