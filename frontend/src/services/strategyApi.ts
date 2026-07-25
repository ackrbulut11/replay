/**
 * Strateji API Servisi.
 *
 * Backend strategy endpointleriyle iletişim kurar.
 */

import type {
  Strategy,
  StrategyCreateRequest,
  StrategyUpdateRequest,
  EvaluateRequest,
  EvaluateResponse,
  BatchEvaluateRequest,
  BatchEvaluateResponse,
  ScanHistoryItem,
  SaveScanRequest,
  IndicatorInfo,
} from '../types/strategy';

const API_BASE = '/api/strategy';

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('replay_access_token') || localStorage.getItem('replay_auth_token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const headers = { ...getAuthHeaders(), ...(options?.headers as Record<string, string> || {}) };
  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(err.detail || `API hatası: ${response.status}`);
  }

  return response.json();
}

// ─── Strategy CRUD ───────────────────────────────────────────────────────────

export async function getStrategies(): Promise<Strategy[]> {
  const data = await request<{ strategies: Strategy[]; count: number }>(`${API_BASE}/list`);
  return data.strategies;
}

export async function getStrategy(id: string): Promise<Strategy> {
  return request<Strategy>(`${API_BASE}/${id}`);
}

export async function createStrategy(
  data: StrategyCreateRequest
): Promise<{ message: string; strategy: Strategy }> {
  return request(`${API_BASE}`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateStrategy(
  id: string,
  data: StrategyUpdateRequest
): Promise<{ message: string; strategy: Strategy }> {
  return request(`${API_BASE}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteStrategy(id: string): Promise<{ message: string }> {
  return request(`${API_BASE}/${id}`, {
    method: 'DELETE',
  });
}

// ─── Değerlendirme ───────────────────────────────────────────────────────────

export async function evaluateStrategy(
  id: string,
  params: EvaluateRequest
): Promise<EvaluateResponse> {
  return request(`${API_BASE}/${id}/evaluate`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function batchEvaluateStrategy(
  id: string,
  params: BatchEvaluateRequest
): Promise<BatchEvaluateResponse> {
  return request(`${API_BASE}/${id}/batch-evaluate`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function getScanHistory(
  id: string
): Promise<{ strategy_id: string; scans: ScanHistoryItem[]; latest: ScanHistoryItem | null }> {
  return request(`${API_BASE}/${id}/scans`);
}

export async function saveScanResult(
  id: string,
  data: SaveScanRequest
): Promise<{ message: string; scan: ScanHistoryItem }> {
  return request(`${API_BASE}/${id}/scans`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ─── İndikatörler ────────────────────────────────────────────────────────────

export async function getAvailableIndicators(): Promise<IndicatorInfo[]> {
  const data = await request<{ indicators: IndicatorInfo[] }>(`${API_BASE}/indicators`);
  return data.indicators;
}

export const strategyApi = {
  getStrategies,
  getStrategy,
  createStrategy,
  updateStrategy,
  deleteStrategy,
  evaluateStrategy,
  batchEvaluateStrategy,
  getScanHistory,
  saveScanResult,
  getAvailableIndicators,
};

