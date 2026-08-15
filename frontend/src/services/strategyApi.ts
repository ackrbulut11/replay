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
  ScanHistoryItem,
  SaveScanRequest,
  SingleEvaluationLogItem,
  IndicatorInfo,
} from '../types/strategy';

import { apiRequest as request } from './api';

const API_BASE = '/api/strategy';

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

/** Toplu taramayı arka planda başlatır; anında "running" durumunda bir kayıt döner. */
export async function batchEvaluateStrategy(
  id: string,
  params: BatchEvaluateRequest
): Promise<ScanHistoryItem> {
  return request(`${API_BASE}/${id}/batch-evaluate`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** Arka planda çalışan (veya biten) bir taramanın güncel durumunu sorgular. */
export async function getScanStatus(id: string, scanId: string): Promise<ScanHistoryItem> {
  return request(`${API_BASE}/${id}/scans/${scanId}/status`);
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

// ─── Tekli Test Geçmişi ──────────────────────────────────────────────────────

export async function getEvaluationHistory(): Promise<SingleEvaluationLogItem[]> {
  const data = await request<{ evaluations: SingleEvaluationLogItem[]; count: number }>(
    `${API_BASE}/evaluations`
  );
  return data.evaluations;
}

/** Tarayıcıda kalmış eski geçmişi bir kez sunucuya taşır. */
export async function importEvaluationHistory(
  items: SingleEvaluationLogItem[]
): Promise<{ message: string; imported: number }> {
  return request(`${API_BASE}/evaluations/import`, {
    method: 'POST',
    body: JSON.stringify({ items }),
  });
}

export async function deleteEvaluation(
  evaluationId: string
): Promise<{ message: string; evaluation_id: string }> {
  return request(`${API_BASE}/evaluations/${evaluationId}`, { method: 'DELETE' });
}

export async function clearEvaluationHistory(
  strategyId?: string
): Promise<{ message: string; deleted: number }> {
  const query = strategyId ? `?strategy_id=${encodeURIComponent(strategyId)}` : '';
  return request(`${API_BASE}/evaluations${query}`, { method: 'DELETE' });
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
  getScanStatus,
  getScanHistory,
  saveScanResult,
  getEvaluationHistory,
  importEvaluationHistory,
  deleteEvaluation,
  clearEvaluationHistory,
  getAvailableIndicators,
};



/** Hazır strateji şablonu — kopyalanıp düzenlenecek çalışır bir başlangıç. */
export interface StrategyTemplate {
  key: string;
  name: string;
  description: string;
  strategy: StrategyCreateRequest;
}

/** Hazır şablonları getirir (boş editörden başlamamak için). */
export async function getTemplates(): Promise<StrategyTemplate[]> {
  const data = await request<{ templates: StrategyTemplate[] }>(`${API_BASE}/templates`);
  return data.templates || [];
}
