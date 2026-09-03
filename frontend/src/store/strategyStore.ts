import { SessionChangedError } from '../auth/authSession';
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
import { errorMessage } from '../utils/errors';

export interface StrategyState {
  strategies: Strategy[];
  activeStrategy: Strategy | null;
  indicators: IndicatorInfo[];
  evaluateResult: EvaluateResponse | null;
  singleEvalHistory: SingleEvaluationLogItem[];
  isLoading: boolean;
  isEvaluating: boolean;
  error: string | null;
}

/** Kayıt kimliği: aynı strateji + parite + timeframe için tek kayıt tutulur. */
function evalLogKey(item: SingleEvaluationLogItem): string {
  return `${item.strategy_id}|${item.provider}|${item.symbol}|${item.timeframe}`;
}

/**
 * Aynı strateji/parite/timeframe için birden fazla kayıt varsa sadece en günceli kalır.
 * Liste en yeni en üstte olduğundan ilk görülen kayıt en güncel olandır.
 */
function dedupeEvalHistory(history: SingleEvaluationLogItem[]): SingleEvaluationLogItem[] {
  const seen = new Set<string>();
  return history.filter((item) => {
    const key = evalLogKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Tekli test geçmişi artık veritabanında, kullanıcıya bağlı olarak tutuluyor.
// Bu anahtar yalnızca eski tarayıcı verisini bir kez sunucuya taşımak için okunur.
const LEGACY_EVAL_HISTORY_KEY = 'replay_single_eval_history';

/** Tarayıcıda kalmış eski geçmişi okur (tek seferlik geçiş için). */
function readLegacyEvalHistory(): SingleEvaluationLogItem[] {
  try {
    const raw = localStorage.getItem(LEGACY_EVAL_HISTORY_KEY);
    return raw ? dedupeEvalHistory(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export const INITIAL_STRATEGY_STATE: StrategyState = {
  strategies: [],
  activeStrategy: null,
  indicators: [],
  evaluateResult: null,
  // Giriş yapıldığında sunucudan yüklenir (fetchEvalHistory).
  singleEvalHistory: [],
  isLoading: false,
  isEvaluating: false,
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
      if (e instanceof SessionChangedError) return;
          console.warn('Failed to parse strategy order:', e);
        }
      }
      // Yeni eklenenler alta gelecek şekilde eskiden yeniye doğru sırala (asc)
      const sorted = [...strategies].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      setState({ strategies: sorted, isLoading: false });
    } catch (err: unknown) {
      if (err instanceof SessionChangedError) return;
      setState({ isLoading: false, error: errorMessage(err, 'Stratejiler yüklenemedi') });
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
    } catch (err: unknown) {
      if (err instanceof SessionChangedError) return null;
      setState({ isLoading: false, error: errorMessage(err, 'Strateji oluşturulamadı') });
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
    } catch (err: unknown) {
      if (err instanceof SessionChangedError) return null;
      setState({ isLoading: false, error: errorMessage(err, 'Strateji güncellenemedi') });
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
    } catch (err: unknown) {
      if (err instanceof SessionChangedError) return false;
      setState({ isLoading: false, error: errorMessage(err, 'Strateji silinemedi') });
      return false;
    }
  },

  // ─── Aktif Strateji ───────────────────────────────────────────────────

  setActiveStrategy: (strategy: Strategy | null) => {
    setState({ activeStrategy: strategy, evaluateResult: null });
  },

  // ─── Değerlendirme ────────────────────────────────────────────────────

  evaluateStrategy: async (id: string, params: EvaluateRequest): Promise<EvaluateResponse | null> => {
    setState({ isEvaluating: true, error: null, evaluateResult: null });
    try {
      const result = await strategyApi.evaluateStrategy(id, params);
      result.symbol = params.symbol;
      result.provider = params.provider;
      result.timeframe = params.timeframe;

      setState({ evaluateResult: result, isEvaluating: false });

      // Sunucu değerlendirmeyi kendisi geçmişe yazıyor (aynı strateji/parite/
      // timeframe için eski kaydın üzerine); güncel listeyi oradan tazele.
      strategyStore.fetchEvalHistory();

      return result;
    } catch (err: unknown) {
      if (err instanceof SessionChangedError) return null;
      setState({ isEvaluating: false, error: errorMessage(err, 'Değerlendirme başarısız') });
      return null;
    }
  },

  loadSingleEvalHistoryItem: (item: SingleEvaluationLogItem) => {
    if (!item.result) return;
    // Eski kayıtlarda sembol/provider/timeframe sonuca yazılmamış olabilir; log'dan tamamla.
    const restored: EvaluateResponse = {
      ...item.result,
      symbol: item.result.symbol || item.symbol,
      provider: item.result.provider || item.provider,
      timeframe: item.result.timeframe || item.timeframe,
    };
    setState({ evaluateResult: restored, error: null, isEvaluating: false });
  },

  /**
   * Test geçmişini sunucudan yükler.
   *
   * Sunucu boşsa ve tarayıcıda eski kayıtlar varsa bunlar bir kez yukarı
   * taşınır; böylece localStorage'daki mevcut geçmiş kaybolmaz.
   */
  fetchEvalHistory: async () => {
    try {
      let history = await strategyApi.getEvaluationHistory();

      if (history.length === 0) {
        const legacy = readLegacyEvalHistory();
        if (legacy.length > 0) {
          await strategyApi.importEvaluationHistory(legacy);
          history = await strategyApi.getEvaluationHistory();
        }
      }

      // Aktarım sonrası tarayıcıdaki kopya artık gereksiz; tek kaynak sunucu.
      localStorage.removeItem(LEGACY_EVAL_HISTORY_KEY);
      setState({ singleEvalHistory: dedupeEvalHistory(history) });
    } catch (err) {
      if (err instanceof SessionChangedError) return;
      console.warn('Test geçmişi alınamadı:', err);
    }
  },

  deleteSingleEvalHistoryItem: async (id: string) => {
    // Arayüz anında tepki versin; hata olursa sunucudaki gerçek liste geri yüklenir.
    setState({ singleEvalHistory: currentState.singleEvalHistory.filter((h) => h.id !== id) });
    try {
      await strategyApi.deleteEvaluation(id);
    } catch (err) {
      if (err instanceof SessionChangedError) return;
      console.warn('Test kaydı silinemedi:', err);
      strategyStore.fetchEvalHistory();
    }
  },

  clearSingleEvalHistory: async (strategyId?: string) => {
    const previous = currentState.singleEvalHistory;
    setState({
      singleEvalHistory: strategyId
        ? previous.filter((h) => h.strategy_id !== strategyId)
        : [],
    });
    try {
      await strategyApi.clearEvaluationHistory(strategyId);
    } catch (err) {
      if (err instanceof SessionChangedError) return;
      console.warn('Test geçmişi temizlenemedi:', err);
      strategyStore.fetchEvalHistory();
    }
  },

  // ─── İndikatörler ─────────────────────────────────────────────────────

  fetchIndicators: async () => {
    try {
      const indicators = await strategyApi.getAvailableIndicators();
      setState({ indicators });
    } catch (err: unknown) {
      if (err instanceof SessionChangedError) return;
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

window.addEventListener('replay:session-cleared', () => {
  currentState = { ...INITIAL_STRATEGY_STATE };
  notify();
});
