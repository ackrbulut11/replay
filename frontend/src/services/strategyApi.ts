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

import { TOKEN_STORAGE_KEY, notifyUnauthorized } from '../context/AuthContext';

const API_BASE = '/api/strategy';

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
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
    // Token yok/geçersiz/süresi dolmuş: oturumu düşür, giriş ekranına dön.
    if (response.status === 401) {
      notifyUnauthorized();
      throw new Error('Oturumunuz sona erdi. Lütfen tekrar giriş yapın.');
    }

    // Yakalanmamış sunucu hataları düz metin döner; response.json() burada
    // patlar ve hata mesajı kaybolurdu. Önce metni okuyup JSON'a çevirmeyi
    // deniyoruz ki gerçek sebep arayüzde görünsün.
    const raw = await response.text().catch(() => '');
    let detail = '';
    try {
      detail = JSON.parse(raw)?.detail ?? '';
    } catch {
      detail = raw.trim();
    }
    throw new Error(detail || `API hatası: ${response.status}`);
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

