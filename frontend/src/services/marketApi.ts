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
