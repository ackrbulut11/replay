/**
 * Admin API Servisi.
 *
 * Yalnızca ADMIN_EMAILS listesindeki hesaplar erişebilir; yetki her zaman
 * sunucuda kontrol edilir, buradaki çağrılar yetkisizse 403 alır.
 */

import { apiRequest } from './api';

const API_BASE = '/api/admin';

export interface AdminUserItem {
  id: string;
  email: string;
  name?: string | null;
  avatar_url?: string | null;
  created_at?: string | null;
  last_login_at?: string | null;
  strategies_count: number;
  alerts_count: number;
  /** Kullanıcının alarm kurduğu pariteler (tekrarsız, alfabetik) */
  alert_symbols: string[];
  /** İzleme listelerindeki tekrarsız parite sayısı */
  watchlist_count: number;
}

export interface CountItem {
  label: string;
  count: number;
}

export interface AdminStats {
  total_users: number;
  total_strategies: number;
  total_alerts: number;
  total_watchlist_symbols: number;
  latest_users: AdminUserItem[];
  /** Çizim aracı başına toplam kullanım sayısı (azalan sırada) */
  drawing_usage_by_tool: CountItem[];
  /** Parite başına toplam çizim sayısı (azalan sırada) */
  drawing_usage_by_symbol: CountItem[];
  /** En çok Favoriler'e eklenen pariteler (azalan sırada) */
  top_favorite_symbols: CountItem[];
}

export interface AdminAlertItem {
  id: string;
  symbol: string;
  provider: string;
  timeframe: string;
  target_type: string;
  condition: string;
  threshold_value: number;
  indicator_period?: number | null;
  indicator_period_fast?: number | null;
  indicator_period_slow?: number | null;
  indicator_field?: string | null;
  status: string;
  note?: string | null;
  created_at?: string | null;
  triggered_at?: string | null;
  /** Örn: "BTCUSDT fiyatı 100 üzerine çıkınca" */
  description: string;
}

export interface AdminStrategyItem {
  id: string;
  name: string;
  description?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  allow_short: boolean;
  take_profit_pct?: number | null;
  stop_loss_pct?: number | null;
  entry_rules_count: number;
  exit_rules_count: number;
  timeframe_filters: string[];
  /** Her giriş koşulunun okunabilir metni, örn. ["RSI(14) < 30", "EMA(20) ↑ kesişir EMA(50)"] */
  entry_rules_text: string[];
  /** Her çıkış koşulunun okunabilir metni */
  exit_rules_text: string[];
}

export interface AdminWatchlistItem {
  id: string;
  symbol: string;
  provider: string;
  name?: string | null;
}

export interface AdminUserDetail extends AdminUserItem {
  alerts: AdminAlertItem[];
  strategies: AdminStrategyItem[];
  watchlist_items: AdminWatchlistItem[];
}

export async function getAdminStats(): Promise<AdminStats> {
  return apiRequest<AdminStats>(`${API_BASE}/stats`);
}

export async function getAdminUsers(): Promise<AdminUserItem[]> {
  return apiRequest<AdminUserItem[]>(`${API_BASE}/users`);
}

export async function getAdminUserDetail(userId: string): Promise<AdminUserDetail> {
  return apiRequest<AdminUserDetail>(`${API_BASE}/users/${userId}/detail`);
}

/** Landing page'deki erken erişim formuna bırakılan bir e-posta kaydı. */
export interface AdminWaitlistEntry {
  email: string;
  source?: string | null;
  created_at?: string | null;
}

export async function getAdminWaitlist(): Promise<AdminWaitlistEntry[]> {
  return apiRequest<AdminWaitlistEntry[]>(`${API_BASE}/waitlist`);
}

/** Bir kullanıcı olayı: karşılaşılan hata veya etiketlenmiş aksiyon. */
export interface AdminEventEntry {
  id: string;
  user_id?: string | null;
  user_email?: string | null;
  event_type: string;
  level: string;
  message?: string | null;
  context?: Record<string, unknown> | null;
  created_at?: string | null;
}

export async function getAdminEvents(filters: {
  event_type?: string;
  level?: string;
  limit?: number;
} = {}): Promise<AdminEventEntry[]> {
  const params = new URLSearchParams();
  if (filters.event_type) params.set('event_type', filters.event_type);
  if (filters.level) params.set('level', filters.level);
  params.set('limit', String(filters.limit ?? 200));
  return apiRequest<AdminEventEntry[]>(`${API_BASE}/events?${params.toString()}`);
}

/** Bir kullanıcının stratejisini, admin panelinden bakan admin'in kendi hesabına kopyalar. */
export async function cloneStrategyToMe(strategyId: string): Promise<AdminStrategyItem> {
  return apiRequest<AdminStrategyItem>(`${API_BASE}/strategies/${strategyId}/clone-to-me`, {
    method: 'POST',
  });
}
