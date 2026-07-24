/**
 * Strateji Store.
 *
 * Mevcut projedeki store convention'ına uygun (replayStore gibi custom store).
 * Strateji listesi, aktif strateji, yükleme/hata durumu yönetimi.
 */

import { useState, useEffect } from 'react';
import type {
  Strategy,
  StrategyCreateRequest,
  StrategyUpdateRequest,
  EvaluateRequest,
  EvaluateResponse,
  IndicatorInfo,
} from '../types/strategy';
import { strategyApi } from '../services/strategyApi';

export interface StrategyState {
  strategies: Strategy[];
  activeStrategy: Strategy | null;
  indicators: IndicatorInfo[];
  evaluateResult: EvaluateResponse | null;
  isLoading: boolean;
  error: string | null;
}

export const INITIAL_STRATEGY_STATE: StrategyState = {
  strategies: [],
  activeStrategy: null,
  indicators: [],
  evaluateResult: null,
  isLoading: false,
  error: null,
};

type Listener = (state: StrategyState) => void;

let currentState: StrategyState = { ...INITIAL_STRATEGY_STATE };
const listeners: Set<Listener> = new Set();

function notify() {
  listeners.forEach((listener) => listener(currentState));
}

function setState(partial: Partial<StrategyState>) {
  currentState = { ...currentState, ...partial };
  notify();
}

export const strategyStore = {
  getState: (): StrategyState => currentState,

  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  // ─── Strateji Listesi ─────────────────────────────────────────────────

  fetchStrategies: async () => {
    setState({ isLoading: true, error: null });
    try {
      const strategies = await strategyApi.getStrategies();
      setState({ strategies, isLoading: false });
    } catch (err: any) {
      setState({ isLoading: false, error: err.message || 'Stratejiler yüklenemedi' });
    }
  },

  // ─── CRUD İşlemleri ───────────────────────────────────────────────────

  createStrategy: async (data: StrategyCreateRequest): Promise<Strategy | null> => {
    setState({ isLoading: true, error: null });
    try {
      const result = await strategyApi.createStrategy(data);
      const strategy = result.strategy;
      setState({
        strategies: [...currentState.strategies, strategy],
        activeStrategy: strategy,
        isLoading: false,
      });
      return strategy;
    } catch (err: any) {
      setState({ isLoading: false, error: err.message || 'Strateji oluşturulamadı' });
      return null;
    }
  },

  updateStrategy: async (id: string, data: StrategyUpdateRequest): Promise<Strategy | null> => {
    setState({ isLoading: true, error: null });
    try {
      const result = await strategyApi.updateStrategy(id, data);
      const updated = result.strategy;
      setState({
        strategies: currentState.strategies.map((s) => (s.id === id ? updated : s)),
        activeStrategy: currentState.activeStrategy?.id === id ? updated : currentState.activeStrategy,
        isLoading: false,
      });
      return updated;
    } catch (err: any) {
      setState({ isLoading: false, error: err.message || 'Strateji güncellenemedi' });
      return null;
    }
  },

  deleteStrategy: async (id: string): Promise<boolean> => {
    setState({ isLoading: true, error: null });
    try {
      await strategyApi.deleteStrategy(id);
      setState({
        strategies: currentState.strategies.filter((s) => s.id !== id),
        activeStrategy: currentState.activeStrategy?.id === id ? null : currentState.activeStrategy,
        isLoading: false,
      });
      return true;
    } catch (err: any) {
      setState({ isLoading: false, error: err.message || 'Strateji silinemedi' });
      return false;
    }
  },

  // ─── Aktif Strateji ───────────────────────────────────────────────────

  setActiveStrategy: (strategy: Strategy | null) => {
    setState({ activeStrategy: strategy, evaluateResult: null });
  },

  // ─── Değerlendirme ────────────────────────────────────────────────────

  evaluateStrategy: async (id: string, params: EvaluateRequest): Promise<EvaluateResponse | null> => {
    setState({ isLoading: true, error: null, evaluateResult: null });
    try {
      const result = await strategyApi.evaluateStrategy(id, params);
      setState({ evaluateResult: result, isLoading: false });
      return result;
    } catch (err: any) {
      setState({ isLoading: false, error: err.message || 'Değerlendirme başarısız' });
      return null;
    }
  },

  // ─── İndikatörler ─────────────────────────────────────────────────────

  fetchIndicators: async () => {
    try {
      const indicators = await strategyApi.getAvailableIndicators();
      setState({ indicators });
    } catch (err: any) {
      console.error('İndikatör listesi yüklenemedi:', err);
    }
  },

  // ─── Değerlendirme Temizleme ─────────────────────────────────────────

  clearEvaluateResult: () => {
    setState({ evaluateResult: null });
  },

  // ─── Hata Temizleme ───────────────────────────────────────────────────

  clearError: () => {
    setState({ error: null });
  },
};

// ─── React Hook ──────────────────────────────────────────────────────────────

export function useStrategyStore(): StrategyState {
  const [state, setLocalState] = useState<StrategyState>(strategyStore.getState());

  useEffect(() => {
    const unsubscribe = strategyStore.subscribe((newState) => {
      setLocalState(newState);
    });
    return unsubscribe;
  }, []);

  return state;
}
