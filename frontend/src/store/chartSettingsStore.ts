import { getSessionGeneration, SessionChangedError } from '../auth/authSession';
import { useState, useEffect } from 'react';
import { apiRequest } from '../services/api';
import { hasAccessToken } from '../auth/authSession';
import {
  DEFAULT_DRAWING_COLOR, DEFAULT_LINE_WIDTH, DEFAULT_OPACITY, DEFAULT_LINE_STYLE,
  DEFAULT_BRUSH_COLOR, DEFAULT_FIB_RETRACEMENT_LEVELS, DEFAULT_FIB_EXTENSION_LEVELS,
} from '../charts/drawings/types';
import type { Drawing, DrawingTool, DrawingEditOptions } from '../charts/drawings/types';

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

export interface ActiveIndicatorsState {
  ema20: boolean;
  ema50: boolean;
  ema100: boolean;
  ema200: boolean;
  rsi: boolean;
  macd: boolean;
  bb: boolean;
}

export const DEFAULT_ACTIVE_INDICATORS: ActiveIndicatorsState = {
  ema20: false,
  ema50: false,
  ema100: false,
  ema200: false,
  rsi: false,
  macd: false,
  bb: false,
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
  // Kalem elle çizildiği için biraz daha kalın; iki modu da aynı sarıyı kullanır.
  brush: { color: DEFAULT_BRUSH_COLOR, lineWidth: 3, opacity: DEFAULT_OPACITY, lineStyle: DEFAULT_LINE_STYLE },
  brushTemp: { color: DEFAULT_BRUSH_COLOR, lineWidth: 3, opacity: DEFAULT_OPACITY, lineStyle: DEFAULT_LINE_STYLE },
  // Fibonacci'de `color` yalnızca tutamaç konturunda kullanılır; seviye
  // çizgilerinin rengi fibLevels içinde tek tek tutulur.
  fibRetracement: {
    color: DEFAULT_DRAWING_COLOR, lineWidth: 1, opacity: DEFAULT_OPACITY, lineStyle: DEFAULT_LINE_STYLE,
    fibLevels: DEFAULT_FIB_RETRACEMENT_LEVELS.map((l) => ({ ...l })),
  },
  fibExtension: {
    color: DEFAULT_DRAWING_COLOR, lineWidth: 1, opacity: DEFAULT_OPACITY, lineStyle: DEFAULT_LINE_STYLE,
    fibLevels: DEFAULT_FIB_EXTENSION_LEVELS.map((l) => ({ ...l })),
  },
};

/** Çizimler "PROVIDER:SYMBOL" anahtarıyla saklanır (bkz. CandleChart currentDrawingKeyRef). */
export type DrawingsBySymbol = Record<string, Drawing[]>;

export interface ChartSettingsState {
  rsi: RsiSettings;
  indicators: IndicatorSettingsMap;
  activeIndicators: ActiveIndicatorsState;
  drawingDefaults: Record<DrawingTool, DrawingEditOptions>;
  logScale: boolean;
  drawings: DrawingsBySymbol;
  /**
   * Yalnızca syncFromServer sunucudan gerçek veri uyguladığında artar; yerel
   * çizim düzenlemelerinde değişmez. CandleChart bu sayaca abone olup yalnızca
   * sunucudan gelen veriyi imperatif olarak grafiğe uygular — aksi halde her
   * yerel düzenleme kendi kendini tetikleyen bir döngüye girer.
   */
  drawingsVersion: number;
}

const LOCAL_STORAGE_KEY = 'replay_chart_settings_v1';

function mergeIndicatorDefaults(raw?: unknown): IndicatorSettingsMap {
  const defaults = JSON.parse(JSON.stringify(DEFAULT_INDICATOR_SETTINGS)) as IndicatorSettingsMap;
  if (!raw || typeof raw !== 'object') return defaults;
  // Sunucudaki kayıt eski bir sürümden kalmış olabilir: her alan ayrı ayrı,
  // varsayılanın üstüne yazılarak birleştirilir.
  const saved = raw as Partial<Record<keyof IndicatorSettingsMap, object>>;
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

function mergeActiveIndicators(saved?: unknown): ActiveIndicatorsState {
  return {
    ...DEFAULT_ACTIVE_INDICATORS,
    ...(saved || {}),
  };
}

function loadInitialState(): ChartSettingsState {
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      const indicators = mergeIndicatorDefaults(parsed.indicators || (parsed.rsi?.indicators ? parsed.rsi.indicators : undefined));
      const activeIndicators = mergeActiveIndicators(parsed.activeIndicators || parsed.rsi?.active_indicators);

      if (parsed.rsi) {
        if (parsed.rsi.period) indicators.rsi.period = parsed.rsi.period;
        if (parsed.rsi.overbought) indicators.rsi.overbought = parsed.rsi.overbought;
        if (parsed.rsi.oversold) indicators.rsi.oversold = parsed.rsi.oversold;
      }
      return {
        rsi: { period: indicators.rsi.period, overbought: indicators.rsi.overbought, oversold: indicators.rsi.oversold },
        indicators,
        activeIndicators,
        drawingDefaults: { ...DEFAULT_DRAWING_DEFAULTS, ...(parsed.drawingDefaults || {}) },
        logScale: parsed.logScale ?? false,
        drawings: parsed.drawings || {},
        drawingsVersion: 0,
      };
    }
  } catch (e) {
    console.error('Failed to load chart settings from localStorage', e);
  }
  return {
    rsi: { ...DEFAULT_RSI_SETTINGS },
    indicators: JSON.parse(JSON.stringify(DEFAULT_INDICATOR_SETTINGS)),
    activeIndicators: { ...DEFAULT_ACTIVE_INDICATORS },
    drawingDefaults: { ...DEFAULT_DRAWING_DEFAULTS },
    logScale: false,
    drawings: {},
    drawingsVersion: 0,
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
      active_indicators: state.activeIndicators,
    },
    drawing_defaults: state.drawingDefaults,
    log_scale: state.logScale,
    drawings: state.drawings,
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
      if (e instanceof SessionChangedError) return;
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

  toggleActiveIndicator: (key: keyof ActiveIndicatorsState) => {
    const updated = {
      ...currentState.activeIndicators,
      [key]: !currentState.activeIndicators[key],
    };
    applyState({ activeIndicators: updated });
  },

  setActiveIndicators: (active: Partial<ActiveIndicatorsState>) => {
    const updated = {
      ...currentState.activeIndicators,
      ...active,
    };
    applyState({ activeIndicators: updated });
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

  setLogScale: (value: boolean) => {
    applyState({ logScale: value });
  },

  /** Bir paritenin çizim setini değiştirir (ör. yeni çizim, silme, sürükleme sonu). */
  setSymbolDrawings: (key: string, drawings: Drawing[]) => {
    applyState({ drawings: { ...currentState.drawings, [key]: drawings } });
  },

  /** Giriş yapıldıktan sonra ayarları sunucudan yükler. */
  syncFromServer: async () => {
    const generation = getSessionGeneration();
    if (!hasAccessToken()) return;
    if (syncInFlight) return;
    syncInFlight = true;

    try {
      const data = await apiRequest<{
        // Sunucudan gelen ham JSON; şekli merge yardımcıları içinde
        // doğrulanıyor (eski kayıtlar eksik/fazla alan taşıyabilir).
        rsi: Partial<RsiSettings> & { indicators?: unknown; active_indicators?: unknown };
        drawing_defaults: Partial<Record<DrawingTool, DrawingEditOptions>>;
        log_scale?: boolean;
        drawings?: DrawingsBySymbol;
      }>('/api/chart-settings');
      const hasServerData = data && (
        Object.keys(data.rsi || {}).length > 0
        || Object.keys(data.drawing_defaults || {}).length > 0
        || Object.keys(data.drawings || {}).length > 0
        || data.log_scale === true
      );

      if (hasServerData) {
        const indicators = mergeIndicatorDefaults(data.rsi?.indicators);
        const activeIndicators = mergeActiveIndicators(data.rsi?.active_indicators);
        if (data.rsi?.period) indicators.rsi.period = data.rsi.period;
        if (data.rsi?.overbought) indicators.rsi.overbought = data.rsi.overbought;
        if (data.rsi?.oversold) indicators.rsi.oversold = data.rsi.oversold;

        const merged: ChartSettingsState = {
          rsi: { period: indicators.rsi.period, overbought: indicators.rsi.overbought, oversold: indicators.rsi.oversold },
          indicators,
          activeIndicators,
          drawingDefaults: { ...DEFAULT_DRAWING_DEFAULTS, ...(data.drawing_defaults || {}) },
          logScale: data.log_scale ?? false,
          drawings: data.drawings || {},
          drawingsVersion: currentState.drawingsVersion + 1,
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
      if (e instanceof SessionChangedError) return;
      console.warn('Grafik ayarları sunucudan alınamadı:', e);
    } finally {
      if (generation === getSessionGeneration()) syncInFlight = false;
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
      activeIndicators: { ...DEFAULT_ACTIVE_INDICATORS },
      drawingDefaults: { ...DEFAULT_DRAWING_DEFAULTS },
      logScale: false,
      drawings: {},
      drawingsVersion: 0,
    };
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    } catch (e) {
      if (e instanceof SessionChangedError) return;
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


