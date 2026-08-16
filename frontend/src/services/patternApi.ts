/**
 * Örüntü Arama API Servisi (Faz 3.5).
 *
 * Bir koşulun geçmişte doğru olduğu bar aralıklarını sorar. Strateji
 * değerlendirmesinden farkı: pozisyon, çıkış kuralı ve kâr/zarar yok —
 * yalnızca "bu durum ne zaman oluştu?".
 */

import type {
  ConditionGroup,
  StrategyParameter,
  PatternSearchResponse,
} from '../types/strategy';

import { apiRequest as request } from './api';

const API_BASE = '/api/patterns';

export interface PatternSearchRequest {
  provider: string;
  symbol: string;
  timeframe: string;
  condition_group: ConditionGroup;
  parameters?: StrategyParameter[];
  start?: string;
  end?: string;
  limit_bars?: number;
}

export async function searchPatterns(
  payload: PatternSearchRequest,
): Promise<PatternSearchResponse> {
  return request<PatternSearchResponse>(`${API_BASE}/search`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export const patternApi = { searchPatterns };
