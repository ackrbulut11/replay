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
}): Promise<MarketCandle[]> {
  const query = new URLSearchParams({
    provider: params.provider,
    symbol: params.symbol,
    timeframe: params.timeframe,
    anchor: String(Math.floor(params.anchor)),
  });
  if (params.barsBefore !== undefined) query.set('bars_before', String(params.barsBefore));
  if (params.barsAfter !== undefined) query.set('bars_after', String(params.barsAfter));

  return request<MarketCandle[]>(`${API_BASE}/window?${query.toString()}`);
}
