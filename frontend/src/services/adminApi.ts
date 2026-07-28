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

export interface AdminStats {
  total_users: number;
  total_strategies: number;
  total_alerts: number;
  total_watchlist_symbols: number;
  latest_users: AdminUserItem[];
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
