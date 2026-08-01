/**
 * Trade Journal API Servisi.
 *
 * Backend `/api/journal` uçlarıyla iletişim kurar. Bileşenler doğrudan
 * fetch çağırmaz (SKILLS.md Frontend); tüm erişim buradan geçer.
 */

import type {
  JournalTrade,
  PerformanceReport,
  TradeCloseRequest,
  TradeOpenRequest,
  TradeStatus,
  TradeUpdateRequest,
} from '../types/journal';

import { apiRequest as request } from './api';

const API_BASE = '/api/journal';

export interface TradeListFilters {
  symbol?: string;
  status?: TradeStatus;
  sessionId?: string;
  limit?: number;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

export async function getTrades(filters: TradeListFilters = {}): Promise<JournalTrade[]> {
  const query = buildQuery({
    symbol: filters.symbol,
    status: filters.status,
    session_id: filters.sessionId,
    limit: filters.limit,
  });
  return request<JournalTrade[]>(`${API_BASE}/trades${query}`);
}

export async function getTrade(tradeId: string): Promise<JournalTrade> {
  return request<JournalTrade>(`${API_BASE}/trades/${tradeId}`);
}

export async function openTrade(data: TradeOpenRequest): Promise<JournalTrade> {
  return request<JournalTrade>(`${API_BASE}/trades`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function closeTrade(
  tradeId: string,
  data: TradeCloseRequest
): Promise<JournalTrade> {
  return request<JournalTrade>(`${API_BASE}/trades/${tradeId}/close`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateTrade(
  tradeId: string,
  data: TradeUpdateRequest
): Promise<JournalTrade> {
  return request<JournalTrade>(`${API_BASE}/trades/${tradeId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteTrade(tradeId: string): Promise<void> {
  return request<void>(`${API_BASE}/trades/${tradeId}`, { method: 'DELETE' });
}

export async function getPerformance(
  options: { symbol?: string; sessionId?: string; startingBalance?: number } = {}
): Promise<PerformanceReport> {
  const query = buildQuery({
    symbol: options.symbol,
    session_id: options.sessionId,
    starting_balance: options.startingBalance,
  });
  return request<PerformanceReport>(`${API_BASE}/performance${query}`);
}
