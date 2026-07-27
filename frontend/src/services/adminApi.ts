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
  replay_sessions_count: number;
}

export interface AdminStats {
  total_users: number;
  total_strategies: number;
  total_alerts: number;
  total_replay_sessions: number;
  latest_users: AdminUserItem[];
}

export async function getAdminStats(): Promise<AdminStats> {
  return apiRequest<AdminStats>(`${API_BASE}/stats`);
}

export async function getAdminUsers(): Promise<AdminUserItem[]> {
  return apiRequest<AdminUserItem[]>(`${API_BASE}/users`);
}
