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
  SingleEvaluationLogItem,
} from '../types/strategy';
import { strategyApi } from '../services/strategyApi';

export interface StrategyState {
  strategies: Strategy[];
  activeStrategy: Strategy | null;
  indicators: IndicatorInfo[];
  evaluateResult: EvaluateResponse | null;
  singleEvalHistory: SingleEvaluationLogItem[];
  isLoading: boolean;
  error: string | null;
}

function loadInitialEvalHistory(): SingleEvaluationLogItem[] {
  try {
    const raw = localStorage.getItem('replay_single_eval_history');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export const INITIAL_STRATEGY_STATE: StrategyState = {
  strategies: [],
  activeStrategy: null,
  indicators: [],
  evaluateResult: null,
  singleEvalHistory: loadInitialEvalHistory(),
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
      const savedOrderStr = localStorage.getItem('replay_strategy_order');
      if (savedOrderStr) {
        try {
          const savedOrder: string[] = JSON.parse(savedOrderStr);
          const map = new Map(strategies.map((s) => [s.id, s]));
          const ordered: Strategy[] = [];
          savedOrder.forEach((id) => {
            if (map.has(id)) {
              ordered.push(map.get(id)!);
              map.delete(id);
            }
          });
          map.forEach((s) => ordered.push(s));
          setState({ strategies: ordered, isLoading: false });
          return;
        } catch (e) {
          console.warn('Failed to parse strategy order:', e);
        }
      }
      // Yeni eklenenler alta gelecek şekilde eskiden yeniye doğru sırala (asc)
      const sorted = [...strategies].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      setState({ strategies: sorted, isLoading: false });
    } catch (err: any) {
      setState({ isLoading: false, error: err.message || 'Stratejiler yüklenemedi' });
    }
  },

  reorderStrategies: (fromIndex: number, toIndex: number) => {
    const list = [...currentState.strategies];
    if (fromIndex < 0 || fromIndex >= list.length || toIndex < 0 || toIndex >= list.length) return;
    const [moved] = list.splice(fromIndex, 1);
    list.splice(toIndex, 0, moved);
    localStorage.setItem('replay_strategy_order', JSON.stringify(list.map((s) => s.id)));
    setState({ strategies: list });
  },

  // ─── CRUD İşlemleri ───────────────────────────────────────────────────

  createStrategy: async (data: StrategyCreateRequest): Promise<Strategy | null> => {
    setState({ isLoading: true, error: null });
    try {
      const result = await strategyApi.createStrategy(data);
      const strategy = result.strategy;
      const updatedList = [...currentState.strategies, strategy];
      localStorage.setItem('replay_strategy_order', JSON.stringify(updatedList.map((s) => s.id)));
      setState({
        strategies: updatedList,
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
      result.symbol = params.symbol;
      result.provider = params.provider;
      result.timeframe = params.timeframe;

      const newLogItem: SingleEvaluationLogItem = {
        id: `${id}_${params.symbol}_${params.timeframe}_${Date.now()}`,
        strategy_id: id,
        strategy_name: result.strategy_name || currentState.activeStrategy?.name || 'Strateji',
        symbol: params.symbol,
        provider: params.provider,
        timeframe: params.timeframe,
        executed_at: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
        total_bars: result.total_bars,
        total_trades: result.total_trades || 0,
        win_rate: result.win_rate || 0,
        total_pnl_percent: result.total_pnl_percent || 0,
        result: result,
      };

      const updatedHistory = [newLogItem, ...currentState.singleEvalHistory.filter((h) => h.id !== newLogItem.id)].slice(0, 30);
      try {
        localStorage.setItem('replay_single_eval_history', JSON.stringify(updatedHistory));
      } catch (e) {
        console.warn('Failed to save single eval history:', e);
      }

      setState({
        evaluateResult: result,
        singleEvalHistory: updatedHistory,
        isLoading: false,
      });
      return result;
    } catch (err: any) {
      setState({ isLoading: false, error: err.message || 'Değerlendirme başarısız' });
      return null;
    }
  },

  loadSingleEvalHistoryItem: (item: SingleEvaluationLogItem) => {
    setState({ evaluateResult: item.result });
  },

  deleteSingleEvalHistoryItem: (id: string) => {
    const updated = currentState.singleEvalHistory.filter((h) => h.id !== id);
    try {
      localStorage.setItem('replay_single_eval_history', JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to save single eval history:', e);
    }
    setState({ singleEvalHistory: updated });
  },

  clearSingleEvalHistory: (strategyId?: string) => {
    let updated: SingleEvaluationLogItem[] = [];
    if (strategyId) {
      updated = currentState.singleEvalHistory.filter((h) => h.strategy_id !== strategyId);
    }
    try {
      localStorage.setItem('replay_single_eval_history', JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to clear single eval history:', e);
    }
    setState({ singleEvalHistory: updated });
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
