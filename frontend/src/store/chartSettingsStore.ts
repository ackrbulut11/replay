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

export interface EmaSettings {
  period: number;
  color: string;
  lineWidth: number;
}

export interface BbSettings {
  period: number;
  stdDev: number;
  upperColor: string;
  upperWidth: number;
  middleColor: string;
  middleWidth: number;
  lowerColor: string;
  lowerWidth: number;
}

export interface DetailedRsiSettings {
  period: number;
  overbought: number;
  oversold: number;
  color: string;
  lineWidth: number;
  overboughtColor: string;
  middleColor: string;
  oversoldColor: string;
}

export interface MacdSettings {
  fastPeriod: number;
  slowPeriod: number;
  signalPeriod: number;
  macdColor: string;
  macdWidth: number;
  signalColor: string;
  signalWidth: number;
  histUpColor: string;
  histDownColor: string;
}

export interface IndicatorSettingsMap {
  ema20: EmaSettings;
  ema50: EmaSettings;
  ema100: EmaSettings;
  ema200: EmaSettings;
  bb: BbSettings;
  rsi: DetailedRsiSettings;
  macd: MacdSettings;
}

export const DEFAULT_INDICATOR_SETTINGS: IndicatorSettingsMap = {
  ema20: { period: 20, color: '#f59e0b', lineWidth: 2 },
  ema50: { period: 50, color: '#06b6d4', lineWidth: 2 },
  ema100: { period: 100, color: '#8b5cf6', lineWidth: 2 },
  ema200: { period: 200, color: '#ec4899', lineWidth: 2 },
  bb: {
    period: 20,
    stdDev: 2,
    upperColor: '#eab308',
    upperWidth: 2,
    middleColor: '#94a3b8',
    middleWidth: 1,
    lowerColor: '#eab308',
    lowerWidth: 2,
  },
  rsi: {
    period: 14,
    overbought: 75,
    oversold: 25,
    color: '#38bdf8',
    lineWidth: 2,
    overboughtColor: 'rgba(239, 68, 68, 0.75)',
    middleColor: 'rgba(148, 163, 184, 0.4)',
    oversoldColor: 'rgba(16, 185, 129, 0.75)',
  },
  macd: {
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    macdColor: '#3b82f6',
    macdWidth: 2,
    signalColor: '#f59e0b',
    signalWidth: 1.5,
    histUpColor: '#10b981',
    histDownColor: '#ef4444',
  },
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
  indicators: IndicatorSettingsMap;
  drawingDefaults: Record<DrawingTool, DrawingEditOptions>;
}

const LOCAL_STORAGE_KEY = 'replay_chart_settings_v1';

function mergeIndicatorDefaults(saved?: any): IndicatorSettingsMap {
  const defaults = JSON.parse(JSON.stringify(DEFAULT_INDICATOR_SETTINGS)) as IndicatorSettingsMap;
  if (!saved) return defaults;
  return {
    ema20: { ...defaults.ema20, ...(saved.ema20 || {}) },
    ema50: { ...defaults.ema50, ...(saved.ema50 || {}) },
    ema100: { ...defaults.ema100, ...(saved.ema100 || {}) },
    ema200: { ...defaults.ema200, ...(saved.ema200 || {}) },
    bb: { ...defaults.bb, ...(saved.bb || {}) },
    rsi: { ...defaults.rsi, ...(saved.rsi || {}) },
    macd: { ...defaults.macd, ...(saved.macd || {}) },
  };
}

function loadInitialState(): ChartSettingsState {
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      const indicators = mergeIndicatorDefaults(parsed.indicators || (parsed.rsi?.indicators ? parsed.rsi.indicators : undefined));
      if (parsed.rsi) {
        if (parsed.rsi.period) indicators.rsi.period = parsed.rsi.period;
        if (parsed.rsi.overbought) indicators.rsi.overbought = parsed.rsi.overbought;
        if (parsed.rsi.oversold) indicators.rsi.oversold = parsed.rsi.oversold;
      }
      return {
        rsi: { period: indicators.rsi.period, overbought: indicators.rsi.overbought, oversold: indicators.rsi.oversold },
        indicators,
        drawingDefaults: { ...DEFAULT_DRAWING_DEFAULTS, ...(parsed.drawingDefaults || {}) },
      };
    }
  } catch (e) {
    console.error('Failed to load chart settings from localStorage', e);
  }
  return {
    rsi: { ...DEFAULT_RSI_SETTINGS },
    indicators: JSON.parse(JSON.stringify(DEFAULT_INDICATOR_SETTINGS)),
    drawingDefaults: { ...DEFAULT_DRAWING_DEFAULTS },
  };
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
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let syncedOnce = false;
let syncInFlight = false;
let lastPersistedJson = '';

function persistablePayload(state: ChartSettingsState) {
  return {
    rsi: {
      period: state.indicators.rsi.period,
      overbought: state.indicators.rsi.overbought,
      oversold: state.indicators.rsi.oversold,
      indicators: state.indicators,
    },
    drawing_defaults: state.drawingDefaults,
  };
}

function scheduleServerSave(delayMs = 800) {
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
    const newRsi = { ...currentState.rsi, ...rsi };
    const newIndicators = {
      ...currentState.indicators,
      rsi: {
        ...currentState.indicators.rsi,
        period: newRsi.period,
        overbought: newRsi.overbought,
        oversold: newRsi.oversold,
      },
    };
    applyState({ rsi: newRsi, indicators: newIndicators });
  },

  setIndicatorSettings: <K extends keyof IndicatorSettingsMap>(key: K, settings: Partial<IndicatorSettingsMap[K]>) => {
    const updatedKeySettings = { ...currentState.indicators[key], ...settings };
    const newIndicators = {
      ...currentState.indicators,
      [key]: updatedKeySettings,
    };
    const newRsi = key === 'rsi' ? {
      period: (updatedKeySettings as DetailedRsiSettings).period,
      overbought: (updatedKeySettings as DetailedRsiSettings).overbought,
      oversold: (updatedKeySettings as DetailedRsiSettings).oversold,
    } : currentState.rsi;

    applyState({ rsi: newRsi, indicators: newIndicators });
  },

  resetIndicatorSettings: (key?: keyof IndicatorSettingsMap) => {
    if (key) {
      const defaultKeySettings = JSON.parse(JSON.stringify(DEFAULT_INDICATOR_SETTINGS[key]));
      chartSettingsStore.setIndicatorSettings(key, defaultKeySettings);
    } else {
      const defaultIndicators = JSON.parse(JSON.stringify(DEFAULT_INDICATOR_SETTINGS));
      applyState({
        indicators: defaultIndicators,
        rsi: {
          period: defaultIndicators.rsi.period,
          overbought: defaultIndicators.rsi.overbought,
          oversold: defaultIndicators.rsi.oversold,
        },
      });
    }
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
      const data = await apiRequest<{ rsi: Partial<RsiSettings> & { indicators?: any }; drawing_defaults: Partial<Record<DrawingTool, DrawingEditOptions>> }>('/api/chart-settings');
      const hasServerData = data && (Object.keys(data.rsi || {}).length > 0 || Object.keys(data.drawing_defaults || {}).length > 0);

      if (hasServerData) {
        const indicators = mergeIndicatorDefaults(data.rsi?.indicators);
        if (data.rsi?.period) indicators.rsi.period = data.rsi.period;
        if (data.rsi?.overbought) indicators.rsi.overbought = data.rsi.overbought;
        if (data.rsi?.oversold) indicators.rsi.oversold = data.rsi.oversold;

        const merged: ChartSettingsState = {
          rsi: { period: indicators.rsi.period, overbought: indicators.rsi.overbought, oversold: indicators.rsi.oversold },
          indicators,
          drawingDefaults: { ...DEFAULT_DRAWING_DEFAULTS, ...(data.drawing_defaults || {}) },
        };
        lastPersistedJson = JSON.stringify(persistablePayload(merged));
        syncedOnce = true;
        currentState = merged;
        saveToLocalStorage();
        listeners.forEach((listener) => listener(currentState));
      } else {
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
    const defaultIndicators = JSON.parse(JSON.stringify(DEFAULT_INDICATOR_SETTINGS));
    currentState = {
      rsi: { ...DEFAULT_RSI_SETTINGS },
      indicators: defaultIndicators,
      drawingDefaults: { ...DEFAULT_DRAWING_DEFAULTS },
    };
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

