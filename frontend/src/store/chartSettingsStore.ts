import { useState, useEffect } from 'react';
import { apiRequest } from '../services/api';
import { TOKEN_STORAGE_KEY } from '../context/AuthContext';
import {
  DEFAULT_DRAWING_COLOR, DEFAULT_LINE_WIDTH, DEFAULT_OPACITY, DEFAULT_LINE_STYLE,
} from '../charts/drawings/types';
import type { DrawingTool, DrawingEditOptions } from '../charts/drawings/types';

export interface RsiSettings {
  period: number;
  overbought: number;
  oversold: number;
}

export const DEFAULT_RSI_SETTINGS: RsiSettings = {
  period: 14,
  overbought: 75,
  oversold: 25,
};

export const DEFAULT_DRAWING_DEFAULTS: Record<DrawingTool, DrawingEditOptions> = {
  pointer: { color: DEFAULT_DRAWING_COLOR, lineWidth: DEFAULT_LINE_WIDTH, opacity: DEFAULT_OPACITY, lineStyle: DEFAULT_LINE_STYLE },
  ruler: { color: '#2962ff', lineWidth: 2, opacity: 0.9, lineStyle: DEFAULT_LINE_STYLE },
  longPosition: { color: '#10b981', lineWidth: 2, opacity: DEFAULT_OPACITY, lineStyle: DEFAULT_LINE_STYLE },
  shortPosition: { color: '#ef4444', lineWidth: 2, opacity: DEFAULT_OPACITY, lineStyle: DEFAULT_LINE_STYLE },
  trendLine: { color: DEFAULT_DRAWING_COLOR, lineWidth: DEFAULT_LINE_WIDTH, opacity: DEFAULT_OPACITY, lineStyle: DEFAULT_LINE_STYLE },
  horizontalRay: { color: DEFAULT_DRAWING_COLOR, lineWidth: DEFAULT_LINE_WIDTH, opacity: DEFAULT_OPACITY, lineStyle: DEFAULT_LINE_STYLE },
  rectangle: { color: DEFAULT_DRAWING_COLOR, lineWidth: DEFAULT_LINE_WIDTH, opacity: DEFAULT_OPACITY, lineStyle: DEFAULT_LINE_STYLE, fillOpacity: 0.16 },
  parallelChannel: { color: DEFAULT_DRAWING_COLOR, lineWidth: DEFAULT_LINE_WIDTH, opacity: DEFAULT_OPACITY, lineStyle: DEFAULT_LINE_STYLE },
};

export interface ChartSettingsState {
  rsi: RsiSettings;
  drawingDefaults: Record<DrawingTool, DrawingEditOptions>;
}

const LOCAL_STORAGE_KEY = 'replay_chart_settings_v1';

function loadInitialState(): ChartSettingsState {
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        rsi: { ...DEFAULT_RSI_SETTINGS, ...(parsed.rsi || {}) },
        drawingDefaults: { ...DEFAULT_DRAWING_DEFAULTS, ...(parsed.drawingDefaults || {}) },
      };
    }
  } catch (e) {
    console.error('Failed to load chart settings from localStorage', e);
  }
  return { rsi: { ...DEFAULT_RSI_SETTINGS }, drawingDefaults: { ...DEFAULT_DRAWING_DEFAULTS } };
}

type Listener = (state: ChartSettingsState) => void;

let currentState: ChartSettingsState = loadInitialState();
const listeners: Set<Listener> = new Set();

function saveToLocalStorage() {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(currentState));
  } catch (e) {
    console.error('Failed to save chart settings to localStorage', e);
  }
}

// ─── Sunucu senkronizasyonu ────────────────────────────────────────────────
// Ayarlar kullanıcıya bağlı olarak veritabanında saklanır (bkz. watchlistStore
// ile aynı desen); localStorage yalnızca ilk boyamada anında içerik göstermek
// için önbellek olarak kullanılır.

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let syncedOnce = false;
let syncInFlight = false;
let lastPersistedJson = '';

function persistablePayload(state: ChartSettingsState) {
  return { rsi: state.rsi, drawing_defaults: state.drawingDefaults };
}

function scheduleServerSave(delayMs = 800) {
  // Kullanıcı henüz senkronize olmadıysa yazma: sunucudaki kaydı
  // varsayılanlarla ezme riski olur.
  if (!syncedOnce) return;

  const payload = JSON.stringify(persistablePayload(currentState));
  if (payload === lastPersistedJson) return;

  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    try {
      await apiRequest('/api/chart-settings', { method: 'PUT', body: payload });
      lastPersistedJson = payload;
    } catch (e) {
      console.warn('Grafik ayarları sunucuya kaydedilemedi:', e);
    }
  }, delayMs);
}

function applyState(partial: Partial<ChartSettingsState>) {
  currentState = { ...currentState, ...partial };
  saveToLocalStorage();
  scheduleServerSave();
  listeners.forEach((listener) => listener(currentState));
}

export const chartSettingsStore = {
  getState: (): ChartSettingsState => currentState,

  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  setRsiSettings: (rsi: Partial<RsiSettings>) => {
    applyState({ rsi: { ...currentState.rsi, ...rsi } });
  },

  setDrawingDefault: (tool: DrawingTool, options: DrawingEditOptions) => {
    applyState({ drawingDefaults: { ...currentState.drawingDefaults, [tool]: options } });
  },

  /** Giriş yapıldıktan sonra ayarları sunucudan yükler. */
  syncFromServer: async () => {
    if (!localStorage.getItem(TOKEN_STORAGE_KEY)) return;
    if (syncInFlight) return;
    syncInFlight = true;

    try {
      const data = await apiRequest<{ rsi: Partial<RsiSettings>; drawing_defaults: Partial<Record<DrawingTool, DrawingEditOptions>> }>('/api/chart-settings');
      const hasServerData = data && (Object.keys(data.rsi || {}).length > 0 || Object.keys(data.drawing_defaults || {}).length > 0);

      if (hasServerData) {
        const merged: ChartSettingsState = {
          rsi: { ...DEFAULT_RSI_SETTINGS, ...(data.rsi || {}) },
          drawingDefaults: { ...DEFAULT_DRAWING_DEFAULTS, ...(data.drawing_defaults || {}) },
        };
        lastPersistedJson = JSON.stringify(persistablePayload(merged));
        syncedOnce = true;
        currentState = merged;
        saveToLocalStorage();
        listeners.forEach((listener) => listener(currentState));
      } else {
        // Sunucu boş (yeni kullanıcı veya ilk geçiş): yereldekini yukarı taşı.
        const payload = JSON.stringify(persistablePayload(currentState));
        await apiRequest('/api/chart-settings', { method: 'PUT', body: payload });
        lastPersistedJson = payload;
        syncedOnce = true;
      }
    } catch (e) {
      console.warn('Grafik ayarları sunucudan alınamadı:', e);
    } finally {
      syncInFlight = false;
    }
  },

  resetForLogout: () => {
    syncedOnce = false;
    syncInFlight = false;
    lastPersistedJson = '';
    if (syncTimer) {
      clearTimeout(syncTimer);
      syncTimer = null;
    }
    currentState = { rsi: { ...DEFAULT_RSI_SETTINGS }, drawingDefaults: { ...DEFAULT_DRAWING_DEFAULTS } };
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    } catch (e) {
      console.error('Failed to clear chart settings localStorage on logout', e);
    }
    listeners.forEach((listener) => listener(currentState));
  },
};

if (typeof window !== 'undefined') {
  window.addEventListener('replay:session-cleared', () => {
    chartSettingsStore.resetForLogout();
  });
}

export function useChartSettingsStore(): [ChartSettingsState, typeof chartSettingsStore] {
  const [state, setState] = useState<ChartSettingsState>(chartSettingsStore.getState());

  useEffect(() => {
    const unsubscribe = chartSettingsStore.subscribe(setState);
    return unsubscribe;
  }, []);

  return [state, chartSettingsStore];
}
