import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createChart, ColorType, PriceScaleMode, CrosshairMode } from 'lightweight-charts';
import type { Time } from 'lightweight-charts';
import DrawingToolbar from './drawings/DrawingToolbar';
import DrawingEditPanel from './drawings/DrawingEditPanel';
import { DrawingsPrimitive, RECT_HANDLE_LABELS, POSITION_HANDLE_LABELS } from './drawings/DrawingPrimitive';
import {
  TOOL_CONFIG, generateDrawingId,
  DEFAULT_DRAWING_COLOR, DEFAULT_LINE_WIDTH, DEFAULT_OPACITY,
} from './drawings/types';
import type { Drawing, DrawingPoint, DrawingTool, DrawingEditOptions } from './drawings/types';
import { calculateEMA, calculateRSI, calculateMACD } from '../utils/indicators';
import type { IndicatorsState } from './IndicatorToolbar';
import { Loader2, Calendar, SlidersHorizontal, AlertCircle, BarChart3, RotateCcw, Scissors, Search, Bookmark, Plus, Bell, Trash2 } from 'lucide-react';
import { useReplayStore, replayStore } from '../store/replayStore';
import ReplayControls from '../replay/ReplayControls';
import SymbolSearchModal from '../components/SymbolSearchModal';
import { useWatchlistStore, watchlistStore } from '../store/watchlistStore';
import { useAlertStore, alertStore } from '../store/alertStore';





interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface CandleChartProps {
  data: CandleData[];
  logScale: boolean;
  setLogScale: (v: boolean) => void;
  indicators: IndicatorsState;
  onToggleIndicator: (key: keyof IndicatorsState) => void;
  provider: string;
  setProvider: (v: string) => void;
  symbol: string;
  setSymbol: (v: string) => void;
  timeframe: string;
  setTimeframe: (v: string) => void;
  start: string;
  setStart: (v: string) => void;
  end: string;
  setEnd: (v: string) => void;
  loading?: boolean;
  error?: string | null;
  onOpenSearchModal?: () => void;
  onSelectTab?: (tab: any) => void;
}


interface DragState {
  drawingId: string;
  handleIndex: number;
}

function findCandleIndexByTimestamp(candles: CandleData[], targetTimestamp: number): number {
  if (candles.length === 0) return 0;
  let matchIdx = -1;
  for (let i = 0; i < candles.length; i++) {
    if (candles[i].time <= targetTimestamp) {
      matchIdx = i;
    } else {
      break;
    }
  }
  if (matchIdx !== -1) return matchIdx;
  return 0;
}

export default function CandleChart({
  data,
  logScale,
  setLogScale,
  indicators,
  onToggleIndicator,
  provider,
  setProvider,
  symbol,
  setSymbol,
  timeframe,
  setTimeframe,
  start,
  setStart,
  end,
  setEnd,
  loading = false,
  error = null,
  onOpenSearchModal,
  onSelectTab,
}: CandleChartProps) {

  const [chartType, setChartType] = useState<'candlestick' | 'line'>('candlestick');

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const candleSeriesRef = useRef<ReturnType<ReturnType<typeof createChart>['addCandlestickSeries']> | null>(null);
  const mainLineSeriesRef = useRef<ReturnType<ReturnType<typeof createChart>['addLineSeries']> | null>(null);
  const volumeSeriesRef = useRef<ReturnType<ReturnType<typeof createChart>['addHistogramSeries']> | null>(null);
  const primitiveRef = useRef<DrawingsPrimitive | null>(null);

  // Gösterge Serisi Referansları
  const ema20Ref = useRef<ReturnType<ReturnType<typeof createChart>['addLineSeries']> | null>(null);
  const ema50Ref = useRef<ReturnType<ReturnType<typeof createChart>['addLineSeries']> | null>(null);
  const ema100Ref = useRef<ReturnType<ReturnType<typeof createChart>['addLineSeries']> | null>(null);
  const ema200Ref = useRef<ReturnType<ReturnType<typeof createChart>['addLineSeries']> | null>(null);

  const rsiRef = useRef<ReturnType<ReturnType<typeof createChart>['addLineSeries']> | null>(null);

  const macdLineRef = useRef<ReturnType<ReturnType<typeof createChart>['addLineSeries']> | null>(null);
  const macdSignalRef = useRef<ReturnType<ReturnType<typeof createChart>['addLineSeries']> | null>(null);
  const macdHistRef = useRef<ReturnType<ReturnType<typeof createChart>['addHistogramSeries']> | null>(null);

  const alertPriceLinesRef = useRef<Array<{ line: any; series: any }>>([]);
  const [alertState] = useAlertStore();


  // Alt panel boyutlandırma durumu
  const [subPaneRatio, setSubPaneRatio] = useState(0.28);
  const [rsiMacdSplit, setRsiMacdSplit] = useState(0.5);
  const [isDraggingDivider, setIsDraggingDivider] = useState(false);
  const [dividerHovered, setDividerHovered] = useState<'main' | 'sub' | null>(null);
  const isDraggingDividerRef = useRef(false);
  const activeDividerRef = useRef<'main' | 'sub' | null>(null);
  const subPaneRatioRef = useRef(0.28);
  subPaneRatioRef.current = subPaneRatio;

  const [activeTool, setActiveTool] = useState<DrawingTool>('pointer');
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [selectedDrawing, setSelectedDrawing] = useState<Drawing | null>(null);

  const [toolSettings, setToolSettings] = useState<Record<DrawingTool, DrawingEditOptions>>({
    pointer: { color: DEFAULT_DRAWING_COLOR, lineWidth: DEFAULT_LINE_WIDTH, opacity: DEFAULT_OPACITY },
    ruler: { color: '#2962ff', lineWidth: 2, opacity: 0.9 },
    longPosition: { color: '#10b981', lineWidth: 2, opacity: DEFAULT_OPACITY },
    shortPosition: { color: '#ef4444', lineWidth: 2, opacity: DEFAULT_OPACITY },
    trendLine: { color: DEFAULT_DRAWING_COLOR, lineWidth: DEFAULT_LINE_WIDTH, opacity: DEFAULT_OPACITY },
    horizontalRay: { color: DEFAULT_DRAWING_COLOR, lineWidth: DEFAULT_LINE_WIDTH, opacity: DEFAULT_OPACITY },
    rectangle: { color: DEFAULT_DRAWING_COLOR, lineWidth: DEFAULT_LINE_WIDTH, opacity: DEFAULT_OPACITY, fillOpacity: 0.16 },
    parallelChannel: { color: DEFAULT_DRAWING_COLOR, lineWidth: DEFAULT_LINE_WIDTH, opacity: DEFAULT_OPACITY },
  });

  const toolSettingsRef = useRef(toolSettings);
  toolSettingsRef.current = toolSettings;

  const [editOptions, setEditOptions] = useState<DrawingEditOptions>({
    color: DEFAULT_DRAWING_COLOR,
    lineWidth: DEFAULT_LINE_WIDTH,
    opacity: DEFAULT_OPACITY,
  });

  const activeToolRef = useRef<DrawingTool>('pointer');
  const snapEnabledRef = useRef(false);
  const drawingsRef = useRef<Drawing[]>([]);
  const currentPointsRef = useRef<DrawingPoint[]>([]);
  const selectedDrawingRef = useRef<Drawing | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const hoveredObjectIdRef = useRef<string | null>(null); // lightweight-charts'tan gelen hover ID
  const isDraggingDrawingRef = useRef(false); // gerçek sürükleme mi tıklama mı ayırt et
  // getPointFromPixel ve applyDrag useCallback ref'leri (global useEffect'ten erişim için)
  const getPointFromPixelRef = useRef<((x: number, y: number, snap: boolean) => DrawingPoint | null) | null>(null);
  const applyDragRef = useRef<((drawingId: string, handleIndex: number, point: DrawingPoint) => Drawing | null) | null>(null);

  const [ctrlPressed, setCtrlPressed] = useState(false);
  const ctrlPressedRef = useRef(false);
  const shiftPressedRef = useRef(false);

  const [plusMenu, setPlusMenu] = useState<{ y: number; price: number } | null>(null);
  const plusMenuRef = useRef<{ y: number; price: number } | null>(null);
  plusMenuRef.current = plusMenu;
  const plusButtonRef = useRef<HTMLButtonElement | null>(null);
  const currentCrosshairYRef = useRef<number | null>(null);
  const currentCrosshairPriceRef = useRef<number | null>(null);
  const isHoveringPlusButtonRef = useRef(false);

  const [currentCrosshairY, setCurrentCrosshairY] = useState<number | null>(null);
  const [alarmOverlays, setAlarmOverlays] = useState<Array<{ id: string; y: number; symbol: string; condSym: string; val: string }>>([]);
  const updateAlarmOverlaysRef = useRef<(() => void) | null>(null);

  const formatPriceLabel = useCallback((val?: number | null) => {
    if (val === undefined || val === null) return '—';
    return provider === 'binance' && val < 10
      ? val.toFixed(4)
      : val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }, [provider]);

  // Global Ctrl/Shift key listener to temporarily toggle snap/magnet and quick ruler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control') {
        ctrlPressedRef.current = true;
        setCtrlPressed(true);
      }
      if (e.key === 'Shift') {
        shiftPressedRef.current = true;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control') {
        ctrlPressedRef.current = false;
        setCtrlPressed(false);
      }
      if (e.key === 'Shift') {
        shiftPressedRef.current = false;
      }
    };

    const handleBlur = () => {
      ctrlPressedRef.current = false;
      shiftPressedRef.current = false;
      setCtrlPressed(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  const [chartHeight, setChartHeight] = useState(600);
  const [isIndicatorsOpen, setIsIndicatorsOpen] = useState(false);
  const [isDatesOpen, setIsDatesOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);


  // Reactive watchlist state — ensures bookmark button re-renders on add/remove
  const [watchlistState] = useWatchlistStore();
  const isBookmarked = watchlistState.lists.some((g) =>
    g.items.some((i) => i.id === `${provider.toLowerCase()}:${symbol.toUpperCase()}`)
  );


  // --- REPLAY ENGINE STATE & HANDLERS ---
  const [replayState, setReplayState] = useReplayStore();

  const isSelectingCutoffRef = useRef(false);
  isSelectingCutoffRef.current = replayState.isSelectingCutoff;

  const fullDataRef = useRef<CandleData[]>(data);
  fullDataRef.current = data;

  const prevVisibleLengthRef = useRef<number>(0);

  const visibleData = useMemo(() => {
    if (!replayState.isReplayActive || replayState.currentIndex === null) {
      return data;
    }
    const maxIdx = Math.min(replayState.currentIndex, data.length - 1);
    return data.slice(0, Math.max(0, maxIdx + 1));
  }, [data, replayState.isReplayActive, replayState.currentIndex]);

  // Replay playback timer effect
  useEffect(() => {
    if (!replayState.isReplayActive || !replayState.isPlaying) return;

    const timer = setInterval(() => {
      setReplayState((prev) => {
        if (prev.currentIndex === null) return { isPlaying: false };
        const nextIdx = prev.currentIndex + 1;
        if (nextIdx >= data.length) {
          return {
            isPlaying: false,
            currentIndex: data.length - 1,
            targetTimestamp: data[data.length - 1]?.time ?? null,
          };
        }
        return {
          currentIndex: nextIdx,
          targetTimestamp: data[nextIdx]?.time ?? null,
        };
      });
    }, replayState.speedMs);

    return () => clearInterval(timer);
  }, [replayState.isReplayActive, replayState.isPlaying, replayState.speedMs, data, setReplayState]);

  const handleStepForward = useCallback(() => {
    setReplayState((prev) => {
      if (prev.currentIndex === null) return {};
      const nextIdx = Math.min(prev.currentIndex + 1, data.length - 1);
      return {
        currentIndex: nextIdx,
        targetTimestamp: data[nextIdx]?.time ?? null,
      };
    });
  }, [data, setReplayState]);

  const handleTogglePlay = useCallback(() => {
    setReplayState((prev) => {
      if (prev.currentIndex !== null && prev.currentIndex >= data.length - 1) {
        const startIdx = prev.cutoffIndex ?? 0;
        return {
          isPlaying: true,
          currentIndex: startIdx,
          targetTimestamp: data[startIdx]?.time ?? null,
        };
      }
      return { isPlaying: !prev.isPlaying };
    });
  }, [data, setReplayState]);

  const handleStartSelection = useCallback(() => {
    setReplayState({ isSelectingCutoff: true, isPlaying: false });
  }, [setReplayState]);

  const handleToggleReplayMode = useCallback(() => {
    setReplayState((prev) => {
      if (prev.isReplayActive) {
        if (onSelectTab) onSelectTab('chart');
        return {
          isReplayActive: false,
          isSelectingCutoff: false,
          isPlaying: false,
          cutoffIndex: null,
          currentIndex: null,
          targetTimestamp: null,
        };
      } else {
        if (onSelectTab) onSelectTab('replay');
        const lastIdx = data.length > 0 ? data.length - 1 : null;
        const lastTime = lastIdx !== null ? data[lastIdx]?.time : null;
        return {
          isReplayActive: true,
          isSelectingCutoff: true,
          isPlaying: false,
          cutoffIndex: lastIdx,
          currentIndex: lastIdx,
          targetTimestamp: lastTime,
        };
      }
    });
  }, [data, setReplayState, onSelectTab]);

  const handleResetToCutoff = useCallback(() => {
    setReplayState((prev) => {
      const resetIdx = prev.cutoffIndex ?? 0;
      return {
        currentIndex: resetIdx,
        targetTimestamp: data[resetIdx]?.time ?? null,
        isPlaying: false,
      };
    });
  }, [data, setReplayState]);

  // Timeframe veya yeni veri yüklendiğinde Replay pozisyonunu koru
  useEffect(() => {
    if (!replayState.isReplayActive || !data || data.length === 0) return;

    if (replayState.targetTimestamp !== null) {
      const matchedIdx = findCandleIndexByTimestamp(data, replayState.targetTimestamp);
      const matchedTime = data[matchedIdx]?.time ?? null;
      setReplayState({
        cutoffIndex: matchedIdx,
        currentIndex: matchedIdx,
        targetTimestamp: matchedTime,
      });
    } else {
      const lastIdx = data.length - 1;
      setReplayState({
        cutoffIndex: lastIdx,
        currentIndex: lastIdx,
        targetTimestamp: data[lastIdx]?.time ?? null,
      });
    }
  }, [data, replayState.isReplayActive]);

  // Replay Kısayol Tuşları Dinleyicisi
  useEffect(() => {
    if (!replayState.isReplayActive) return;

    const handleReplayKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = e.key.toLowerCase();

      if (e.code === 'Space' || key === ' ') {
        e.preventDefault();
        handleStepForward();
      } else if (key === 'p') {
        e.preventDefault();
        handleTogglePlay();
      } else if (key === 'c') {
        e.preventDefault();
        handleStartSelection();
      } else if (key === 'r') {
        e.preventDefault();
        handleResetToCutoff();
      } else if (key === 'x') {
        e.preventDefault();
        handleToggleReplayMode();
      } else if (key === '1') {
        setReplayState({ speedMs: 200 });
      } else if (key === '2') {
        setReplayState({ speedMs: 500 });
      } else if (key === '3') {
        setReplayState({ speedMs: 1000 });
      } else if (key === '4') {
        setReplayState({ speedMs: 2000 });
      }
    };

    window.addEventListener('keydown', handleReplayKeyDown);
    return () => window.removeEventListener('keydown', handleReplayKeyDown);
  }, [
    replayState.isReplayActive,
    handleStepForward,
    handleTogglePlay,
    handleStartSelection,
    handleResetToCutoff,
    handleToggleReplayMode,
    setReplayState,
  ]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('#indicators-popover')) {
        setIsIndicatorsOpen(false);
      }
      if (!target.closest('#dates-popover')) {
        setIsDatesOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // --- Ayırıcı sürükleme yöneticisi ---
  const handleDividerMouseDown = useCallback((e: React.MouseEvent, which: 'main' | 'sub') => {
    isDraggingDividerRef.current = true;
    activeDividerRef.current = which;
    setIsDraggingDivider(true);
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // Ayırıcı sürükleme için pencere düzeyinde fare dinleyicileri
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Ayırıcı sürükleme
      if (isDraggingDividerRef.current && chartContainerRef.current && activeDividerRef.current) {
        const rect = chartContainerRef.current.getBoundingClientRect();
        const relativeY = e.clientY - rect.top;

        if (activeDividerRef.current === 'main') {
          const newRatio = 1 - relativeY / rect.height;
          setSubPaneRatio(Math.max(0.10, Math.min(0.80, newRatio)));
        } else {
          const curRatio = subPaneRatioRef.current;
          const subAreaStartPx = rect.height * (1 - curRatio);
          const subAreaHeightPx = rect.height * curRatio;
          if (subAreaHeightPx <= 0) return;
          const posInSubArea = (relativeY - subAreaStartPx) / subAreaHeightPx;
          setRsiMacdSplit(Math.max(0.15, Math.min(0.85, posInSubArea)));
        }
        return;
      }

      // Çizim handle sürükleme
      if (dragStateRef.current && chartContainerRef.current && primitiveRef.current) {
        isDraggingDrawingRef.current = true;
        const rect = chartContainerRef.current.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const point = getPointFromPixelRef.current?.(px, py, snapEnabledRef.current || ctrlPressedRef.current);
        if (point) {
          const modified = applyDragRef.current?.(
            dragStateRef.current.drawingId,
            dragStateRef.current.handleIndex,
            point
          );
          if (modified) {
            const idx = drawingsRef.current.findIndex(d => d.id === dragStateRef.current!.drawingId);
            if (idx >= 0) drawingsRef.current[idx] = modified;
            primitiveRef.current.setDrawings(drawingsRef.current);
          }
        }
      }
    };

    const handleMouseUp = () => {
      // Ayırıcı sürükleme bitişi
      if (isDraggingDividerRef.current) {
        isDraggingDividerRef.current = false;
        activeDividerRef.current = null;
        setIsDraggingDivider(false);
        setDividerHovered(null);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }

      // Çizim handle sürükleme bitişi
      if (dragStateRef.current) {
        dragStateRef.current = null;
        primitiveRef.current?.setPreview(null);
        isDraggingDrawingRef.current = false;
        document.body.style.cursor = '';
        chartRef.current?.applyOptions({
          handleScroll: true,
          handleScale: true,
        });
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancelDrawing = useCallback(() => {
    currentPointsRef.current = [];
    primitiveRef.current?.setPreview(null);
  }, []);

  const changeTool = useCallback((tool: DrawingTool) => {
    activeToolRef.current = tool;
    setActiveTool(tool);
    if (drawingsRef.current.some(d => d.tool === 'ruler')) {
      drawingsRef.current = drawingsRef.current.filter(d => d.tool !== 'ruler');
      primitiveRef.current?.setDrawings(drawingsRef.current);
    }
    if (tool === 'pointer') {
      cancelDrawing();
    } else {
      setSelectedDrawing(null);
      const settings = toolSettingsRef.current[tool] || { color: DEFAULT_DRAWING_COLOR, lineWidth: DEFAULT_LINE_WIDTH, opacity: DEFAULT_OPACITY };
      setEditOptions(settings);
    }
  }, [cancelDrawing]);

  const clearAll = useCallback(() => {
    if (!window.confirm('Tüm çizimler silinecek. Emin misiniz?')) return;
    drawingsRef.current = [];
    primitiveRef.current?.setDrawings([]);
    currentPointsRef.current = [];
    primitiveRef.current?.setPreview(null);
    setSelectedDrawing(null);
    primitiveRef.current?.setSelectedId(null);
  }, []);

  const toggleSnap = useCallback(() => {
    setSnapEnabled(prev => {
      const next = !prev;
      snapEnabledRef.current = next;
      return next;
    });
  }, []);

  const getPointFromPixel = useCallback((x: number, y: number, snap: boolean): DrawingPoint | null => {
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!chart || !series) return null;

    if (snap) {
      const time = chart.timeScale().coordinateToTime(x);
      const snapPrice = series.coordinateToPrice(y);

      if (time !== null && snapPrice !== null) {
        const timeVal = typeof time === 'number' ? time : (time as any);
        const candles = fullDataRef.current;
        const candle = candles.find(c => c.time === timeVal || (typeof c.time === 'object' && (c.time as any).timestamp === timeVal));

        if (candle) {
          // Mumun 4 temel noktası: Başlangıç (Open), Bitiş (Close), En Yüksek (High), En Düşük (Low)
          const points = [candle.open, candle.close, candle.high, candle.low];
          
          // Fare imlecinin fiyatına en yakın olan noktayı seç ve doğrudan o verinin olduğu yere yapış
          const price = points.reduce((best, p) =>
            Math.abs(p - snapPrice) < Math.abs(best - snapPrice) ? p : best
          );
          return { time: candle.time, price };
        }
      }

      const fallbackTime = chart.timeScale().coordinateToTime(x);
      const fallbackPrice = series.coordinateToPrice(y);
      if (fallbackTime === null || fallbackPrice === null) return null;
      return { time: fallbackTime as number, price: fallbackPrice };
    }

    const logical = chart.timeScale().coordinateToLogical(x);
    const price = series.coordinateToPrice(y);
    if (logical === null || price === null) return null;

    const barIdx = Math.floor(logical);
    const nextIdx = barIdx + 1;
    const fraction = logical - barIdx;

    const bar = series.dataByIndex(barIdx) as any;
    const nextBar = series.dataByIndex(nextIdx) as any;
    let time: number;
    if (bar && nextBar) {
      const t1 = bar.time as number;
      const t2 = nextBar.time as number;
      time = t1 + (t2 - t1) * fraction;
    } else if (bar) {
      const prevBar = series.dataByIndex(Math.max(0, barIdx - 1)) as any;
      const step = (prevBar && bar) ? ((bar.time as number) - (prevBar.time as number)) : 86400;
      time = (bar.time as number) + step * fraction;
    } else {
      const snapped = chart.timeScale().coordinateToTime(x);
      if (snapped === null) return null;
      time = snapped as number;
    }
    return { time, price };
  }, []);

  const selectDrawing = useCallback((drawingId: string) => {
    const drawing = drawingsRef.current.find(d => d.id === drawingId) || null;
    selectedDrawingRef.current = drawing;
    setSelectedDrawing(drawing);
    primitiveRef.current?.setSelectedId(drawingId);
    if (drawing) {
      setEditOptions({
        color: drawing.color,
        lineWidth: drawing.lineWidth,
        opacity: drawing.opacity,
        fillOpacity: drawing.fillOpacity,
      });
    }
  }, []);

  const deselectDrawing = useCallback(() => {
    selectedDrawingRef.current = null;
    setSelectedDrawing(null);
    primitiveRef.current?.setSelectedId(null);
  }, []);

  const deleteSelected = useCallback(() => {
    const sel = selectedDrawingRef.current;
    if (!sel) return;
    drawingsRef.current = drawingsRef.current.filter(d => d.id !== sel.id);
    primitiveRef.current?.setDrawings(drawingsRef.current);
    deselectDrawing();
  }, [deselectDrawing]);

  const updateSelectedOptions = useCallback((opts: DrawingEditOptions) => {
    setEditOptions(opts);
    const sel = selectedDrawingRef.current;
    if (sel) {
      sel.color = opts.color;
      sel.lineWidth = opts.lineWidth;
      sel.opacity = opts.opacity;
      sel.fillOpacity = opts.fillOpacity;
      drawingsRef.current = drawingsRef.current.map(d => d.id === sel.id ? sel : d);
      primitiveRef.current?.setDrawings(drawingsRef.current);

      setToolSettings(prev => ({
        ...prev,
        [sel.tool]: opts,
      }));
    } else if (activeToolRef.current !== 'pointer') {
      setToolSettings(prev => ({
        ...prev,
        [activeToolRef.current]: opts,
      }));
    }
  }, []);

  const applyDrag = useCallback((drawingId: string, handleIndex: number, newPoint: DrawingPoint): Drawing | null => {
    const drawing = drawingsRef.current.find(d => d.id === drawingId);
    if (!drawing) return null;

    if (drawing.tool === 'rectangle' || drawing.tool === 'ruler') {
      const oldTimeMin = Math.min(drawing.points[0].time, drawing.points[1].time);
      const oldTimeMax = Math.max(drawing.points[0].time, drawing.points[1].time);
      const oldPriceMin = Math.min(drawing.points[0].price, drawing.points[1].price);
      const oldPriceMax = Math.max(drawing.points[0].price, drawing.points[1].price);

      // p2: Yüksek Fiyat (Ekranın Üstü 't'), p1: Düşük Fiyat (Ekranın Altı 'b')
      let t1 = oldTimeMin, t2 = oldTimeMax, p1 = oldPriceMin, p2 = oldPriceMax;
      switch (RECT_HANDLE_LABELS[handleIndex]) {
        case 'tl': t1 = newPoint.time; p2 = newPoint.price; break;
        case 't':  p2 = newPoint.price; break;
        case 'tr': t2 = newPoint.time; p2 = newPoint.price; break;
        case 'r':  t2 = newPoint.time; break;
        case 'br': t2 = newPoint.time; p1 = newPoint.price; break;
        case 'b':  p1 = newPoint.price; break;
        case 'bl': t1 = newPoint.time; p1 = newPoint.price; break;
        case 'l':  t1 = newPoint.time; break;
      }

      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      if (p1 > p2) { const tmp = p1; p1 = p2; p2 = tmp; }

      return {
        ...drawing,
        points: [{ time: t1, price: p1 }, { time: t2, price: p2 }],
      };
    }

    if (drawing.tool === 'longPosition' || drawing.tool === 'shortPosition') {
      const tStart = drawing.points[0].time;
      const pEntry = drawing.points[0].price;
      const tEnd = drawing.points[1].time;
      const pTarget = drawing.points[1].price;
      const pStop = drawing.points.length >= 3 ? drawing.points[2].price : (pEntry - (pTarget - pEntry));

      let newEntry = pEntry;
      let newTarget = pTarget;
      let newStop = pStop;
      let newEnd = tEnd;

      switch (POSITION_HANDLE_LABELS[handleIndex]) {
        case 'target':
          newTarget = newPoint.price;
          break;
        case 'stop':
          newStop = newPoint.price;
          break;
        case 'entry': {
          const delta = newPoint.price - pEntry;
          newEntry = newPoint.price;
          newTarget = pTarget + delta;
          newStop = pStop + delta;
          break;
        }
        case 'right':
          newEnd = Math.max(tStart, newPoint.time);
          break;
      }

      return {
        ...drawing,
        points: [
          { time: tStart, price: newEntry },
          { time: newEnd, price: newTarget },
          { time: newEnd, price: newStop },
        ],
      };
    }

    const modified = { ...drawing, points: [...drawing.points] };
    modified.points[handleIndex] = newPoint;
    return modified;
  }, []);

  // Fonksiyon ref'lerini güncelle (global useEffect'ten erişim için)
  getPointFromPixelRef.current = getPointFromPixel;
  applyDragRef.current = applyDrag;

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#090d16' },
        textColor: '#94a3b8',
        fontSize: 12,
      },
      watermark: {
        visible: true,
        fontSize: 20,
        horzAlign: 'center',
        vertAlign: 'center',
        color: 'rgba(148, 163, 184, 0.05)',
        text: 'Trading Research Platform',
      },
      grid: {
        vertLines: { color: '#1e293b' },
        horzLines: { color: '#1e293b' },
      },
      rightPriceScale: {
        borderColor: '#1e293b',
        autoScale: true,
        mode: logScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
      },
      timeScale: {
        borderColor: '#1e293b',
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: {
          color: '#64748b',
          width: 1,
          style: 3,
          labelBackgroundColor: '#1e293b',
        },
        horzLine: {
          color: '#64748b',
          width: 1,
          style: 3,
          labelBackgroundColor: '#1e293b',
        },
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight || 600,
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
      visible: chartType === 'candlestick',
    });

    const mainLineSeries = chart.addLineSeries({
      color: '#ffffff',
      lineWidth: 2,
      crosshairMarkerVisible: true,
      visible: chartType === 'line',
    });
    mainLineSeriesRef.current = mainLineSeries;

    const volumeSeries = chart.addHistogramSeries({
      color: '#2563eb',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0.02 },
    });

    const primitive = new DrawingsPrimitive();
    candleSeries.attachPrimitive(primitive);
    primitive.setCandles(fullDataRef.current || data);
    primitiveRef.current = primitive;

    chart.subscribeClick((param) => {
      if (!param.point) return;

      // Handle Replay candle cutoff selection click
      if (isSelectingCutoffRef.current) {
        const logical = chart.timeScale().coordinateToLogical(param.point.x);
        if (logical !== null) {
          let barIdx = Math.round(logical);
          const total = fullDataRef.current.length;
          if (total > 0) {
            if (barIdx < 0) barIdx = 0;
            if (barIdx >= total) barIdx = total - 1;

            replayStore.setState({
              cutoffIndex: barIdx,
              currentIndex: barIdx,
              isSelectingCutoff: false,
              isPlaying: false,
            });
            return;
          }
        }
      }

      // Her tıklamada mevcut cetvel temizlenir (geçici ölçüm aracı)
      if (drawingsRef.current.some(d => d.tool === 'ruler')) {
        drawingsRef.current = drawingsRef.current.filter(d => d.tool !== 'ruler');
        primitive.setDrawings(drawingsRef.current);
        primitive.setPreview(null);
      }

      if (activeToolRef.current === 'pointer') {
        // Sürükleme yapılmışsa tıklama işlemini pas geç
        if (isDraggingDrawingRef.current) {
          isDraggingDrawingRef.current = false;
          return;
        }

        const hitId = param.hoveredObjectId as string | undefined;
        if (hitId && hitId.length > 2) {
          if (hitId.startsWith('h:')) {
            const rest = hitId.substring(2);
            const sep = rest.lastIndexOf(':');
            const drawingId = sep >= 0 ? rest.substring(0, sep) : rest;
            selectDrawing(drawingId);
          } else {
            selectDrawing(hitId.substring(2));
          }
        } else {
          dragStateRef.current = null;
          deselectDrawing();
        }
        return;
      }

      const tool = activeToolRef.current;
      const config = TOOL_CONFIG[tool];
      if (!config) return;

      const point = getPointFromPixel(param.point.x, param.point.y, snapEnabledRef.current || ctrlPressedRef.current);
      if (!point) return;

      const newPoints = [...currentPointsRef.current, point];
      currentPointsRef.current = newPoints;

      if (newPoints.length === config.pointsNeeded) {
        const settings = toolSettingsRef.current[tool] || {
          color: DEFAULT_DRAWING_COLOR,
          lineWidth: DEFAULT_LINE_WIDTH,
          opacity: DEFAULT_OPACITY,
        };

        let finalPoints = newPoints;
        if (tool === 'longPosition') {
          const t0 = newPoints[0].time;
          const pEntry = newPoints[0].price;
          const t1 = newPoints[1].time;
          const diff = Math.max(pEntry * 0.03, Math.abs(newPoints[1].price - pEntry));
          const pTarget = pEntry + diff; // Buy/Long: Target Her Zaman Girişin Üstünde (pTarget > pEntry)
          const pStop = pEntry - (diff / 2); // Buy/Long: Stop Loss Her Zaman Girişin Altında (1:2 R:R)
          finalPoints = [
            { time: t0, price: pEntry },
            { time: t1, price: pTarget },
            { time: t1, price: pStop },
          ];
        } else if (tool === 'shortPosition') {
          const t0 = newPoints[0].time;
          const pEntry = newPoints[0].price;
          const t1 = newPoints[1].time;
          const diff = Math.max(pEntry * 0.03, Math.abs(pEntry - newPoints[1].price));
          const pTarget = pEntry - diff; // Sell/Short: Target Her Zaman Girişin Altında (pTarget < pEntry)
          const pStop = pEntry + (diff / 2); // Sell/Short: Stop Loss Her Zaman Girişin Üstünde (1:2 R:R)
          finalPoints = [
            { time: t0, price: pEntry },
            { time: t1, price: pTarget },
            { time: t1, price: pStop },
          ];
        }

        const drawing: Drawing = {
          id: generateDrawingId(),
          tool,
          points: finalPoints,
          color: settings.color,
          lineWidth: settings.lineWidth,
          opacity: settings.opacity,
          fillOpacity: settings.fillOpacity ?? 0.18,
        };

        if (tool === 'ruler') {
          // Cetveli drawingsRef'e ekle (sonraki tıklamada silinecek)
          primitive.setPreview(null);
        }
        drawingsRef.current = [...drawingsRef.current, drawing];
        primitive.setDrawings(drawingsRef.current);
        currentPointsRef.current = [];
        activeToolRef.current = 'pointer';
        setActiveTool('pointer');
      }
    });

    chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      updateAlarmOverlaysRef.current?.();
    });

    chart.subscribeCrosshairMove((param) => {
      updateAlarmOverlaysRef.current?.();
      if (param.point) {
        setCurrentCrosshairY(param.point.y);
      } else {
        setCurrentCrosshairY(null);
      }

      if (isHoveringPlusButtonRef.current) {
        return;
      }

      if (param.point && candleSeriesRef.current) {
        const y = param.point.y;
        const price = candleSeriesRef.current.coordinateToPrice(y);
        if (price !== null && !isNaN(price)) {
          currentCrosshairYRef.current = y;
          currentCrosshairPriceRef.current = price;
          if (plusButtonRef.current) {
            plusButtonRef.current.style.top = `${y - 12}px`;
            if (!plusMenuRef.current) {
              plusButtonRef.current.style.display = 'flex';
            }
          }
        } else {
          if (plusButtonRef.current && !plusMenuRef.current) plusButtonRef.current.style.display = 'none';
        }
      } else {
        if (plusButtonRef.current && !plusMenuRef.current) plusButtonRef.current.style.display = 'none';
      }

      if (!param.point) return;

      if (activeToolRef.current === 'pointer') {
        const hitId = param.hoveredObjectId as string | undefined;
        hoveredObjectIdRef.current = hitId || null; // her zaman güncelle
        let hoveredId: string | null = null;
        if (hitId && hitId.length > 2) {
          hoveredId = hitId.substring(2);
        }
        primitive.setHoveredId(hoveredId);
        return;
      }

      const config = TOOL_CONFIG[activeToolRef.current];
      if (!config || currentPointsRef.current.length === 0) return;
      if (currentPointsRef.current.length >= config.pointsNeeded) return;

      const point = getPointFromPixel(param.point.x, param.point.y, snapEnabledRef.current || ctrlPressedRef.current);
      if (!point) return;

      let previewPoints = [...currentPointsRef.current, point];
      if (activeToolRef.current === 'longPosition' || activeToolRef.current === 'shortPosition') {
        const pEntry = currentPointsRef.current[0].price;
        const t0 = currentPointsRef.current[0].time;
        const t1 = point.time;
        let pTarget: number, pStop: number;

        if (activeToolRef.current === 'longPosition') {
          const diff = Math.max(pEntry * 0.03, Math.abs(point.price - pEntry));
          pTarget = pEntry + diff;
          pStop = pEntry - (diff / 2);
        } else {
          const diff = Math.max(pEntry * 0.03, Math.abs(pEntry - point.price));
          pTarget = pEntry - diff;
          pStop = pEntry + (diff / 2);
        }

        previewPoints = [
          { time: t0, price: pEntry },
          { time: t1, price: pTarget },
          { time: t1, price: pStop },
        ];
      }

      const settings = toolSettingsRef.current[activeToolRef.current];
      primitive.setPreview({
        id: 'preview',
        tool: activeToolRef.current,
        points: previewPoints,
        color: settings ? settings.color : 'rgba(59, 130, 246, 0.5)',
        lineWidth: settings ? settings.lineWidth : DEFAULT_LINE_WIDTH,
        opacity: settings ? settings.opacity : DEFAULT_OPACITY,
      });
    });

    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          chart.resize(width, height);
          setChartHeight(height);
        }
      }
    });

    if (chartContainerRef.current) {
      resizeObserver.observe(chartContainerRef.current);
    }

    // Grafik container'ına mousedown ekle: cetvel temizleme ve handle tutup sürükleme başlatma
    const handleChartMouseDown = (e: MouseEvent) => {
      // Sol tık kontrolü
      if (e.button !== 0) return;

      if (drawingsRef.current.some(d => d.tool === 'ruler')) {
        drawingsRef.current = drawingsRef.current.filter(d => d.tool !== 'ruler');
        primitive.setDrawings(drawingsRef.current);
        primitive.setPreview(null);
      }

      // Pointer modundaysak ve imleç bir çizim/tutamaç üzerindeyse sürüklemeyi (drag) başlat
      if (activeToolRef.current === 'pointer' && hoveredObjectIdRef.current) {
        const hitId = hoveredObjectIdRef.current;
        if (hitId.startsWith('h:')) {
          const rest = hitId.substring(2);
          const sep = rest.lastIndexOf(':');
          const drawingId = sep >= 0 ? rest.substring(0, sep) : rest;
          const handleIndex = sep >= 0 ? parseInt(rest.substring(sep + 1), 10) : -1;
          
          if (handleIndex >= 0) {
            selectDrawing(drawingId);
            dragStateRef.current = { drawingId, handleIndex };
            isDraggingDrawingRef.current = false; // henüz hareket etmedi
            
            // Grafiğin sağa-sola kaymasını (panning) engelle
            chartRef.current?.applyOptions({
              handleScroll: false,
              handleScale: false,
            });
            e.preventDefault();
            e.stopPropagation();
          }
        }
      }
    };
    chartContainerRef.current?.addEventListener('mousedown', handleChartMouseDown, true);

    // Sağ tıkla çizim aletinden imlece dön
    const handleChartContextMenu = (e: MouseEvent) => {
      if (activeToolRef.current !== 'pointer') {
        e.preventDefault();
        cancelDrawing();
        changeTool('pointer');
      }
    };
    chartContainerRef.current?.addEventListener('contextmenu', handleChartContextMenu);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (dragStateRef.current) {
          dragStateRef.current = null;
          primitive.setPreview(null);
        } else if (activeToolRef.current !== 'pointer') {
          cancelDrawing();
          changeTool('pointer');
        } else {
          deselectDrawing();
          if (drawingsRef.current.some(d => d.tool === 'ruler')) {
            drawingsRef.current = drawingsRef.current.filter(d => d.tool !== 'ruler');
            primitive.setDrawings(drawingsRef.current);
          }
        }
      }
      if (e.key === 'Delete' && selectedDrawingRef.current) {
        deleteSelected();
      }
      if (e.altKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        const currentPrice = currentCrosshairPriceRef.current ?? (fullDataRef.current.length > 0 ? fullDataRef.current[fullDataRef.current.length - 1].close : 0);
        if (currentPrice > 0) {
          const targetPrice = Number(currentPrice.toFixed(2));
          const lastPrice = fullDataRef.current.length > 0 ? fullDataRef.current[fullDataRef.current.length - 1].close : targetPrice;
          const condition = targetPrice >= lastPrice ? 'rises_above' : 'falls_below';
          alertStore.createAlert({
            symbol,
            provider,
            target_type: 'price',
            condition,
            threshold_value: targetPrice,
          });
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('keydown', handleKeyDown);
      chartContainerRef.current?.removeEventListener('mousedown', handleChartMouseDown, true);
      chartContainerRef.current?.removeEventListener('contextmenu', handleChartContextMenu);

      // Seri referanslarını temizle
      ema20Ref.current = null;
      ema50Ref.current = null;
      ema100Ref.current = null;
      ema200Ref.current = null;
      rsiRef.current = null;
      macdLineRef.current = null;
      macdSignalRef.current = null;
      macdHistRef.current = null;

      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      primitiveRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.applyOptions({
      rightPriceScale: {
        mode: logScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
      },
    });
  }, [logScale]);

  useEffect(() => {
    if (!chartRef.current) return;
    const isMagnet = snapEnabled || ctrlPressed;
    chartRef.current.applyOptions({
      crosshair: {
        mode: isMagnet ? CrosshairMode.Magnet : CrosshairMode.Normal,
      },
    });
  }, [snapEnabled, ctrlPressed]);

  useEffect(() => {
    if (candleSeriesRef.current) {
      candleSeriesRef.current.applyOptions({ visible: chartType === 'candlestick' });
    }
    if (mainLineSeriesRef.current) {
      mainLineSeriesRef.current.applyOptions({ visible: chartType === 'line' });
    }
  }, [chartType]);

  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || !chartRef.current) return;

    if (visibleData && visibleData.length > 0) {
      // Çakışan zaman damgalarını temizle
      const uniqueData: typeof visibleData = [];
      const seenTimes = new Set<number>();
      for (const d of visibleData) {
        if (!seenTimes.has(d.time)) {
          seenTimes.add(d.time);
          uniqueData.push(d);
        }
      }

      const chart = chartRef.current;
      const currentRange = chart ? chart.timeScale().getVisibleLogicalRange() : null;
      const prevLen = prevVisibleLengthRef.current;
      const currentLen = uniqueData.length;
      prevVisibleLengthRef.current = currentLen;

      const paddedCandles: any[] = uniqueData.map((d) => ({
        time: d.time as Time,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }));

      const paddedVolume: any[] = uniqueData.map((d) => ({
        time: d.time as Time,
        value: d.volume,
        color: d.close >= d.open ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)',
      }));

      if (uniqueData.length > 1) {
        const lastBar = uniqueData[uniqueData.length - 1];
        const prevBar = uniqueData[uniqueData.length - 2];
        const interval = lastBar.time - prevBar.time;

        for (let i = 1; i <= 1000; i++) {
          const futureTime = (lastBar.time + interval * i) as Time;
          paddedCandles.push({
            time: futureTime,
          });
          paddedVolume.push({
            time: futureTime,
          });
        }
      }

      candleSeriesRef.current.setData(paddedCandles);
      volumeSeriesRef.current.setData(paddedVolume);
      primitiveRef.current?.setCandles(uniqueData);

      if (mainLineSeriesRef.current) {
        const lineData = uniqueData.map((d) => ({
          time: d.time as Time,
          value: d.close,
        }));
        mainLineSeriesRef.current.setData(lineData);
      }

      
      if (chart) {
        if (replayState.isReplayActive && currentRange && prevLen > 0 && currentLen === prevLen + 1) {
          // Replay sırasında yeni mum eklendiğinde ve ekran sağ kenarda ise pürüzsüz 1 birim sağa kaydır
          if (currentRange.to >= prevLen - 3) {
            chart.timeScale().setVisibleLogicalRange({
              from: (currentRange.from + 1) as any,
              to: (currentRange.to + 1) as any,
            });
          }
        } else if (!currentRange || Math.abs(currentLen - prevLen) > 3) {
          // Sembol değişimi, ilk yükleme veya kesim seçimi yapıldığında görünüm eksenini hizala
          chart.priceScale('right').applyOptions({ autoScale: true });
          chart.timeScale().setVisibleLogicalRange({
            from: Math.max(0, currentLen - 150) as any,
            to: (currentLen + 5) as any,
          });
        }
      }
    } else {
      candleSeriesRef.current.setData([]);
      volumeSeriesRef.current.setData([]);
    }
  }, [visibleData, replayState.isReplayActive]);

  // Gösterge Hesaplamaları ve Seri Güncellemeleri (serileri oluşturur/kaldırır, verileri ayarlar)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !visibleData || visibleData.length === 0) return;

    // --- SERİLERİ OLUŞTUR / KALDIR ---

    // EMA 20
    if (indicators.ema20) {
      if (!ema20Ref.current) {
        ema20Ref.current = chart.addLineSeries({
          color: '#f59e0b',
          lineWidth: 2,
          lastValueVisible: false,
          priceLineVisible: false,
          title: '',
        });
      }
      const ema20 = calculateEMA(visibleData, 20);
      ema20Ref.current.setData(ema20.map(d => ({ time: d.time as Time, value: d.value })));
    } else if (ema20Ref.current) {
      chart.removeSeries(ema20Ref.current);
      ema20Ref.current = null;
    }

    // EMA 50
    if (indicators.ema50) {
      if (!ema50Ref.current) {
        ema50Ref.current = chart.addLineSeries({
          color: '#06b6d4',
          lineWidth: 2,
          lastValueVisible: false,
          priceLineVisible: false,
          title: '',
        });
      }
      const ema50 = calculateEMA(visibleData, 50);
      ema50Ref.current.setData(ema50.map(d => ({ time: d.time as Time, value: d.value })));
    } else if (ema50Ref.current) {
      chart.removeSeries(ema50Ref.current);
      ema50Ref.current = null;
    }

    // EMA 100
    if (indicators.ema100) {
      if (!ema100Ref.current) {
        ema100Ref.current = chart.addLineSeries({
          color: '#8b5cf6',
          lineWidth: 2,
          lastValueVisible: false,
          priceLineVisible: false,
          title: '',
        });
      }
      const ema100 = calculateEMA(visibleData, 100);
      ema100Ref.current.setData(ema100.map(d => ({ time: d.time as Time, value: d.value })));
    } else if (ema100Ref.current) {
      chart.removeSeries(ema100Ref.current);
      ema100Ref.current = null;
    }

    // EMA 200
    if (indicators.ema200) {
      if (!ema200Ref.current) {
        ema200Ref.current = chart.addLineSeries({
          color: '#ec4899',
          lineWidth: 2,
          lastValueVisible: false,
          priceLineVisible: false,
          title: '',
        });
      }
      const ema200 = calculateEMA(visibleData, 200);
      ema200Ref.current.setData(ema200.map(d => ({ time: d.time as Time, value: d.value })));
    } else if (ema200Ref.current) {
      chart.removeSeries(ema200Ref.current);
      ema200Ref.current = null;
    }


    // RSI (Alt panel)
    if (indicators.rsi) {
      if (!rsiRef.current) {
        rsiRef.current = chart.addLineSeries({
          color: '#ffffff',
          lineWidth: 2,
          priceScaleId: 'rsi',
          title: '',
          lastValueVisible: false,
          priceLineVisible: false,
          autoscaleInfoProvider: () => ({
            priceRange: { minValue: 0, maxValue: 100 },
            margins: { above: 2, below: 2 },
          }),
        });

        rsiRef.current.createPriceLine({ price: 70, color: 'rgba(239, 68, 68, 0.7)', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '' });
        rsiRef.current.createPriceLine({ price: 50, color: 'rgba(148, 163, 184, 0.4)', lineWidth: 1, lineStyle: 3, axisLabelVisible: true, title: '' });
        rsiRef.current.createPriceLine({ price: 30, color: 'rgba(16, 185, 129, 0.7)', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '' });
      }
      const rsi = calculateRSI(visibleData, 14);
      rsiRef.current.setData(rsi.map(d => ({ time: d.time as Time, value: d.value })));
    } else if (rsiRef.current) {
      chart.removeSeries(rsiRef.current);
      rsiRef.current = null;
    }

    // MACD (Alt panel)
    if (indicators.macd) {
      if (!macdHistRef.current || !macdLineRef.current || !macdSignalRef.current) {
        macdHistRef.current = chart.addHistogramSeries({ priceScaleId: 'macd', title: '', lastValueVisible: false, priceLineVisible: false });
        macdLineRef.current = chart.addLineSeries({ color: '#3b82f6', lineWidth: 2, priceScaleId: 'macd', title: '', lastValueVisible: false, priceLineVisible: false });
        macdSignalRef.current = chart.addLineSeries({ color: '#f59e0b', lineWidth: 1, priceScaleId: 'macd', title: '', lastValueVisible: false, priceLineVisible: false });
      }
      const macd = calculateMACD(visibleData, 12, 26, 9);
      macdHistRef.current.setData(macd.histogram.map(d => ({ time: d.time as Time, value: d.value, color: d.color })));
      macdLineRef.current.setData(macd.macd.map(d => ({ time: d.time as Time, value: d.value })));
      macdSignalRef.current.setData(macd.signal.map(d => ({ time: d.time as Time, value: d.value })));
    } else {
      if (macdHistRef.current) { chart.removeSeries(macdHistRef.current); macdHistRef.current = null; }
      if (macdLineRef.current) { chart.removeSeries(macdLineRef.current); macdLineRef.current = null; }
      if (macdSignalRef.current) { chart.removeSeries(macdSignalRef.current); macdSignalRef.current = null; }
    }
  }, [visibleData, indicators]);

  // --- MARJ YERLEŞİM ETKİSİ (serileri yeniden oluşturmadan subPaneRatio sürüklemesine yanıt vermesi için ayrıldı) ---
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const rsiActive = indicators.rsi;
    const macdActive = indicators.macd;
    const subPanesCount = (rsiActive ? 1 : 0) + (macdActive ? 1 : 0);

    if (subPanesCount === 0) {
      // Alt panel yok — ana grafik tüm alanı kullanır (zaman ekseni etiketinin görünürlüğü için küçük bir alan bırakır)
      chart.priceScale('right').applyOptions({
        visible: true,
        borderColor: '#1e293b',
        scaleMargins: { top: 0.02, bottom: 0.08 },
      });
      chart.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.82, bottom: 0.02 },
      });
    } else {
      // Ana grafiğin alt marjı tam olarak subPaneRatio kadardır
      chart.priceScale('right').applyOptions({
        visible: true,
        borderColor: '#1e293b',
        scaleMargins: { top: 0.02, bottom: subPaneRatio },
      });

      // Hacim, ana grafik alanının alt %15'ini kaplar.
      // Orantılı üst marj, top + bottom >= 1.0 çökmesini önler.
      const volumeTop = (1 - subPaneRatio) * 0.85;
      chart.priceScale('volume').applyOptions({
        scaleMargins: { top: volumeTop, bottom: subPaneRatio },
      });

      // Alt panel alanı tam olarak ana grafiğin bittiği yerde başlar
      const subTop = 1 - subPaneRatio;

      if (subPanesCount === 1) {
        if (rsiActive) {
          chart.priceScale('rsi').applyOptions({
            visible: true,
            autoScale: true,
            borderColor: '#1e293b',
            scaleMargins: { top: subTop, bottom: 0.02 },
          });
        }
        if (macdActive) {
          chart.priceScale('macd').applyOptions({
            visible: true,
            autoScale: true,
            borderColor: '#1e293b',
            scaleMargins: { top: subTop + 0.04, bottom: 0.02 },
          });
        }
      } else {
        // 2 alt panel — subPaneRatio yüksekliğinin rsiMacdSplit oranını kullanarak böl
        const mid = subTop + subPaneRatio * rsiMacdSplit;
        if (rsiActive) {
          chart.priceScale('rsi').applyOptions({
            visible: true,
            autoScale: true,
            borderColor: '#1e293b',
            scaleMargins: { top: subTop, bottom: 1 - mid },
          });
        }
        if (macdActive) {
          chart.priceScale('macd').applyOptions({
            visible: true,
            autoScale: true,
            borderColor: '#1e293b',
            // Ayırıcıya değmesini önlemek için üstte küçük bir boşluk bırakır, çökmeleri önlemek için 0.95 ile sınırlanmıştır
            scaleMargins: { top: Math.min(mid + 0.04, 0.95), bottom: 0.02 },
          });
        }
      }
    }
  }, [subPaneRatio, rsiMacdSplit, indicators]);


  const updateAlarmOverlays = useCallback(() => {
    const mainSeries = candleSeriesRef.current || mainLineSeriesRef.current;
    if (!mainSeries) {
      setAlarmOverlays([]);
      return;
    }

    const matchingAlerts = alertState.alerts.filter(
      (a) => a.symbol.toUpperCase() === symbol.toUpperCase() && (a.status === 'ACTIVE' || a.status === 'TRIGGERED')
    );

    const overlays: Array<{ id: string; y: number; symbol: string; condSym: string; val: string }> = [];

    matchingAlerts.forEach((alert) => {
      let targetSeries: any = mainSeries;
      if (alert.target_type === 'RSI' && rsiRef.current) {
        targetSeries = rsiRef.current;
      }
      if (!targetSeries) return;

      try {
        const y = targetSeries.priceToCoordinate(alert.threshold_value);
        if (y !== null && !isNaN(y) && y >= 0) {
          const isRises = alert.condition === 'rises_above';
          const condSym = isRises ? '>' : '<';
          const formattedVal = typeof alert.threshold_value === 'number'
            ? alert.threshold_value.toFixed(2)
            : alert.threshold_value;

          overlays.push({
            id: alert.id,
            y,
            symbol: alert.target_type === 'price' ? alert.symbol : alert.target_type,
            condSym,
            val: String(formattedVal),
          });
        }
      } catch (e) {
        // ignore
      }
    });

    setAlarmOverlays(overlays);
  }, [alertState.alerts, symbol]);

  updateAlarmOverlaysRef.current = updateAlarmOverlays;

  // Render alarm price lines on the chart
  useEffect(() => {
    // Clear old alert price lines
    alertPriceLinesRef.current.forEach(({ line, series }) => {
      try {
        series.removePriceLine(line);
      } catch (e) {
        // ignore
      }
    });
    alertPriceLinesRef.current = [];

    const mainSeries = candleSeriesRef.current || mainLineSeriesRef.current;
    if (!mainSeries) return;

    const matchingAlerts = alertState.alerts.filter(
      (a) => a.symbol.toUpperCase() === symbol.toUpperCase() && (a.status === 'ACTIVE' || a.status === 'TRIGGERED')
    );

    matchingAlerts.forEach((alert) => {
      let targetSeries: any = mainSeries;
      if (alert.target_type === 'RSI' && rsiRef.current) {
        targetSeries = rsiRef.current;
      }

      if (!targetSeries) return;

      try {
        const line = targetSeries.createPriceLine({
          price: alert.threshold_value,
          color: '#f59e0b',
          lineWidth: alert.status === 'TRIGGERED' ? 2 : 1,
          lineStyle: 2, // Dashed
          axisLabelVisible: true,
          axisLabelColor: '#f59e0b',
          title: '', // Sarı metin etiketleri kaldırıldı, sadece çizgi ve eksen göstergesi kalır
        });
        alertPriceLinesRef.current.push({ line, series: targetSeries });
      } catch (err) {
        console.warn('PriceLine create failed:', err);
      }
    });

    updateAlarmOverlays();
    const t1 = setTimeout(updateAlarmOverlays, 60);
    const t2 = setTimeout(updateAlarmOverlays, 250);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [alertState.alerts, symbol, data, indicators, updateAlarmOverlays]);

  // Check alerts against current visible price
  useEffect(() => {
    if (visibleData.length === 0) return;
    const last = visibleData[visibleData.length - 1];
    alertStore.checkAlerts(symbol, provider, last.close);
  }, [visibleData, symbol, provider]);


  // Ayırıcı konumlarını hesapla — marj yerleşim formülünü birebir yansıtır (sıfır boşluk)
  const hasSubPane = indicators.rsi || indicators.macd;
  const hasBothSubPanes = indicators.rsi && indicators.macd;

  const mainDividerY = chartHeight * (1 - subPaneRatio);

  const subTop = 1 - subPaneRatio;
  const subDividerY = hasBothSubPanes
    ? chartHeight * (subTop + subPaneRatio * rsiMacdSplit)
    : 0;

  const mainHighlight = isDraggingDivider && activeDividerRef.current === 'main' || dividerHovered === 'main';
  const subHighlight = isDraggingDivider && activeDividerRef.current === 'sub' || dividerHovered === 'sub';

  // Ortak ayırıcı oluşturucu (renderer)
  const renderDivider = (
    pixelY: number,
    which: 'main' | 'sub',
    highlight: boolean,
  ) => (
    // Dış konteyner: çakışmaları önlemek için tamamen pixelY (alt panel sınırı) üzerinde konumlandırılmıştır
    <div
      key={which}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: `${pixelY - 16}px`,  // Çizginin 16px üzerinden başlar
        height: '18px',            // Alt kenar pixelY + 2px konumundadır
        zIndex: 10,
        pointerEvents: 'none',
      }}
    >
      {/* Tutma şeridi: çizginin üstünde 15px yüksekliğinde tutma alanı */}
      <div
        onMouseDown={(e) => handleDividerMouseDown(e, which)}
        onMouseEnter={() => setDividerHovered(which)}
        onMouseLeave={() => { if (!isDraggingDividerRef.current) setDividerHovered(null); }}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: '21px',
          cursor: 'ns-resize',
          pointerEvents: 'auto',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          paddingBottom: '2px',
        }}
      >
        {/* Tutamak noktaları */}
        <div
          style={{
            display: 'flex',
            gap: '4px',
            opacity: highlight ? 1 : 0.5,
            transition: 'opacity 0.12s ease',
            pointerEvents: 'none',
          }}
        >
          <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: highlight ? '#60a5fa' : '#94a3b8' }} />
          <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: highlight ? '#60a5fa' : '#94a3b8' }} />
          <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: highlight ? '#60a5fa' : '#94a3b8' }} />
        </div>
      </div>

      {/* Görünür ayırıcı çizgi: konteynerin alt kenarına sabitlenmiştir (pixelY) */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: '2px',
          height: highlight ? '2px' : '1px',
          background: highlight ? '#3b82f6' : '#475569',
          transition: 'all 0.12s ease',
          boxShadow: highlight ? '0 0 6px rgba(59,130,246,0.5)' : 'none',
          pointerEvents: 'none',
        }}
      />
    </div>
  );


  return (
    <div className="relative w-full h-full border border-slate-800 rounded-xl overflow-hidden bg-[#090d16]">
      {/* Yüzen Kontrol Paneli Araç Çubuğu */}
      <div className="absolute top-2 left-2 right-2 h-12 z-30 flex items-center justify-between bg-[#0d1321]/95 border border-slate-800/80 rounded-xl px-3.5 shadow-xl backdrop-blur-md">
        {/* Sol Taraf: Logo & Sembol & Sağlayıcı & Zaman Dilimi */}
        <div className="flex items-center gap-3">
          {/* Logo / Başlık */}
          <div className="flex items-center gap-1.5 border-r border-slate-800/80 pr-3 h-5">
            <span className="text-xs font-bold bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent tracking-wider font-sans select-none">
              REPLAY
            </span>
          </div>

          {/* Sembol / Ticker Girişi ve Arama Butonu */}
          <div className="flex items-center gap-1">
            <button
              onClick={onOpenSearchModal || (() => setIsSearchModalOpen(true))}
              className="flex items-center gap-2 bg-[#070b13]/80 border border-slate-800 hover:border-indigo-500/50 rounded-lg px-2.5 py-1 transition-all group"
              title="Sembol Ara (BIST 100, NASDAQ, Crypto)"
            >
              <Search className="w-3.5 h-3.5 text-indigo-400 group-hover:scale-110 transition-transform" />
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-slate-500 font-bold uppercase select-none">Symbol:</span>
                <span className="text-xs font-bold text-slate-100 font-mono tracking-tight group-hover:text-indigo-300">
                  {symbol || 'ARA'}
                </span>
              </div>
            </button>


            {/* Quick Watchlist Bookmark Button — reactive via useWatchlistStore */}
            <button
              onClick={() => watchlistStore.toggleSymbol(symbol, provider)}
              className={`p-1.5 rounded-lg border transition-all ${
                isBookmarked
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 shadow-sm'
                  : 'bg-[#070b13]/80 border-slate-800 text-slate-500 hover:text-amber-400 hover:bg-slate-800'
              }`}
              title={isBookmarked ? 'İzleme Listesinden Çıkar' : 'İzleme Listesine Ekle'}
            >
              <Bookmark className={`w-3.5 h-3.5 ${isBookmarked ? 'fill-amber-400' : ''}`} />
            </button>
          </div>



          {/* Sağlayıcı Seçimi */}
          <div className="flex items-center gap-1 bg-[#070b13]/60 border border-slate-800 rounded-lg px-2.5 py-1">
            <span className="text-[9px] text-slate-500 font-bold uppercase select-none">Provider</span>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="bg-transparent border-none outline-none text-xs font-medium text-slate-300 cursor-pointer focus:ring-0"
            >
              <option value="binance" className="bg-[#070b13] text-slate-100">Binance</option>
              <option value="nasdaq" className="bg-[#070b13] text-slate-100">Nasdaq</option>
              <option value="bist" className="bg-[#070b13] text-slate-100">BIST</option>
            </select>
          </div>

          {/* Zaman Dilimi Seçimi */}
          <div className="flex items-center gap-1 bg-[#070b13]/60 border border-slate-800 rounded-lg px-2.5 py-1">
            <span className="text-[9px] text-slate-500 font-bold uppercase select-none">Interval</span>
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="bg-transparent border-none outline-none text-xs font-medium text-slate-300 cursor-pointer focus:ring-0"
            >
              <option value="1m" className="bg-[#070b13] text-slate-100">1m</option>
              <option value="5m" className="bg-[#070b13] text-slate-100">5m</option>
              <option value="15m" className="bg-[#070b13] text-slate-100">15m</option>
              <option value="1h" className="bg-[#070b13] text-slate-100">1h</option>
              <option value="4h" className="bg-[#070b13] text-slate-100">4h</option>
              <option value="1d" className="bg-[#070b13] text-slate-100">1d</option>
              <option value="1w" className="bg-[#070b13] text-slate-100">1w</option>
              <option value="1mo" className="bg-[#070b13] text-slate-100">1mo</option>
            </select>
          </div>

          {/* Grafik Tipi Seçimi (Mum / Çizgi) */}
          <div className="flex items-center gap-1 bg-[#070b13]/60 border border-slate-800 rounded-lg px-2.5 py-1">
            <span className="text-[9px] text-slate-500 font-bold uppercase select-none">Grafik</span>
            <select
              value={chartType}
              onChange={(e) => setChartType(e.target.value as 'candlestick' | 'line')}
              className="bg-transparent border-none outline-none text-xs font-medium text-slate-300 cursor-pointer focus:ring-0"
            >
              <option value="candlestick" className="bg-[#070b13] text-slate-100">Mum Grafiği</option>
              <option value="line" className="bg-[#070b13] text-slate-100">Çizgi Grafiği</option>
            </select>
          </div>

          {/* Replay Modu Butonu */}
          <button
            onClick={handleToggleReplayMode}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg border transition-all select-none ${
              replayState.isReplayActive
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-md shadow-amber-500/10'
                : 'bg-[#070b13]/80 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-slate-100'
            }`}
            title="Replay Motorunu Aç/Kapat (Kısayol: X)"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${replayState.isReplayActive ? 'text-amber-400' : 'text-indigo-400'}`} />
            <span>Replay</span>
          </button>
        </div>

        {/* Sağ Taraf: Göstergeler popover, Tarih aralığı popover, Log scale, Loading spinner */}
        <div className="flex items-center gap-2">
          {/* Göstergeler Popover */}
          <div className="relative" id="indicators-popover">
            <button
              onClick={() => setIsIndicatorsOpen(!isIndicatorsOpen)}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg border transition-all ${
                isIndicatorsOpen
                  ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30 font-semibold'
                  : 'bg-[#070b13]/80 border-slate-800 text-slate-300 hover:bg-slate-800/80 hover:text-slate-100'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400" />
              Indicators
            </button>

            {isIndicatorsOpen && (
              <div className="absolute right-0 top-9 mt-1 w-52 bg-[#0d1321]/95 border border-slate-850 rounded-xl p-2 shadow-2xl z-50 backdrop-blur-md space-y-0.5">
                <div className="text-[9px] text-slate-500 font-bold uppercase px-2 py-1 select-none">
                  Technical Indicators
                </div>
                <div className="w-full h-px bg-slate-800/60 my-1" />
                {Object.keys(indicators).map((key) => {
                  const indKey = key as keyof IndicatorsState;
                  const labels: Record<string, string> = {
                    ema20: 'EMA 20',
                    ema50: 'EMA 50',
                    ema100: 'EMA 100',
                    ema200: 'EMA 200',
                    rsi: 'RSI (14)',
                    macd: 'MACD (12, 26, 9)',
                  };
                  const colors: Record<string, string> = {
                    ema20: 'bg-amber-500',
                    ema50: 'bg-cyan-500',
                    ema100: 'bg-purple-500',
                    ema200: 'bg-pink-500',
                    rsi: 'bg-slate-300',
                    macd: 'bg-emerald-500',
                  };
                  return (
                    <label
                      key={indKey}
                      className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-800/50 cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${colors[indKey]} ${indicators[indKey] ? 'animate-pulse' : ''}`} />
                        <span className="text-xs text-slate-200">{labels[indKey]}</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={indicators[indKey]}
                        onChange={() => onToggleIndicator(indKey)}
                        className="w-3.5 h-3.5 accent-indigo-500 rounded border-slate-800 cursor-pointer bg-[#070b13]"
                      />
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Tarih Aralığı Popover */}
          <div className="relative" id="dates-popover">
            <button
              onClick={() => setIsDatesOpen(!isDatesOpen)}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg border transition-all ${
                isDatesOpen || start || end
                  ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30 font-semibold'
                  : 'bg-[#070b13]/80 border-slate-800 text-slate-300 hover:bg-slate-800/80 hover:text-slate-100'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 text-indigo-400" />
              {start || end ? `${start || '...'} to ${end || '...'}` : 'Dates'}
            </button>

            {isDatesOpen && (
              <div className="absolute right-0 top-9 mt-1 w-60 bg-[#0d1321]/95 border border-slate-850 rounded-xl p-3 shadow-2xl z-50 backdrop-blur-md space-y-3">
                <div className="text-[9px] text-slate-500 font-bold uppercase pb-1.5 border-b border-slate-800/60 select-none">
                  Select Date Range
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] text-slate-400 font-semibold uppercase select-none">Start Date</span>
                    <input
                      type="date"
                      value={start}
                      onChange={(e) => setStart(e.target.value)}
                      className="bg-[#070b13] border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 transition"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] text-slate-400 font-semibold uppercase select-none">End Date</span>
                    <input
                      type="date"
                      value={end}
                      onChange={(e) => setEnd(e.target.value)}
                      className="bg-[#070b13] border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 transition"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Log Scale Toggle */}
          <button
            onClick={() => setLogScale(!logScale)}
            className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${
              logScale
                ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30'
                : 'bg-[#070b13]/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
            }`}
          >
            LOG
          </button>

          {/* Loading Spinner */}
          {loading && (
            <div className="ml-1 text-indigo-400 animate-spin">
              <Loader2 className="w-4 h-4" />
            </div>
          )}
        </div>
      </div>

      {/* Dikey Çizim Toolbarı - Yüzen Kontrol Paneli Araç Çubuğunun Altında Konumlandırılmıştır */}
      <div className="absolute top-[62px] left-2 z-20 flex flex-col gap-1.5">
        <DrawingToolbar
          activeTool={activeTool}
          snapEnabled={snapEnabled}
          hasDrawings={drawingsRef.current.length > 0}
          onChangeTool={changeTool}
          onToggleSnap={toggleSnap}
          onClearAll={clearAll}
        />
        {selectedDrawing ? (
          <DrawingEditPanel
            title={`Düzenle (${TOOL_CONFIG[selectedDrawing.tool]?.label || 'Çizim'}):`}
            options={editOptions}
            onChange={updateSelectedOptions}
            onDelete={deleteSelected}
            isRuler={selectedDrawing.tool === 'ruler'}
            tool={selectedDrawing.tool}
          />
        ) : activeTool !== 'pointer' ? (
          <DrawingEditPanel
            title={`Stil (${TOOL_CONFIG[activeTool]?.label || 'Araç'}):`}
            options={editOptions}
            onChange={updateSelectedOptions}
            isRuler={activeTool === 'ruler'}
            tool={activeTool}
          />
        ) : null}
      </div>

      {/* Ana ayırıcı: fiyat grafiği ve alt paneller arasında */}
      {hasSubPane && renderDivider(mainDividerY, 'main', mainHighlight)}

      {/* Alt ayırıcı: RSI ve MACD arasında (yalnızca ikisi de aktifken) */}
      {hasBothSubPanes && renderDivider(subDividerY, 'sub', subHighlight)}

      {/* Durum Gösterge Katmanları */}
      {loading && (
        <div className="absolute inset-0 bg-[#070b13]/85 backdrop-blur-xs z-25 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-10 h-10 text-indigo-400 animate-spin" />
          <span className="text-slate-350 text-sm font-medium">Loading market data...</span>
        </div>
      )}

      {error && !loading && (
        <div className="absolute inset-0 bg-[#070b13]/95 z-25 flex items-center justify-center p-4">
          <div className="flex flex-col items-center text-center max-w-md p-6 space-y-3">
            <div className="p-3 bg-red-950/40 border border-red-900/60 rounded-full text-red-400">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-red-200">Veri Yüklenemedi</h3>
            <p className="text-slate-400 text-sm leading-relaxed">{error}</p>
            <p className="text-slate-500 text-xs">
              İpucu: Komut satırından `python scripts/download_data.py` çalıştırarak bu veriyi indirmiş olduğunuzdan emin olun.
            </p>
          </div>
        </div>
      )}

      {!error && data.length === 0 && !loading && (
        <div className="absolute inset-0 bg-[#090d16] z-25 flex items-center justify-center p-4">
          <div className="flex flex-col items-center text-center max-w-sm p-6 space-y-3">
            <div className="p-3 bg-[#0d1321]/80 border border-slate-800 rounded-full text-slate-400">
              <BarChart3 className="w-8 h-8 text-indigo-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-200">Chart Ready to Load</h3>
            <p className="text-slate-450 text-sm leading-relaxed">
              Select data provider, symbol, and timeframe from the floating control panel above.
            </p>
          </div>
        </div>
      )}

      {/* Yüzen Replay Araç Çubuğu Kontrolleri */}
      {replayState.isReplayActive && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30">
          <ReplayControls
            totalBars={data.length}
            onStepForward={handleStepForward}
            onTogglePlay={handleTogglePlay}
            onStartSelection={handleStartSelection}
            onExitReplay={handleToggleReplayMode}
            onResetToCutoff={handleResetToCutoff}
          />
        </div>
      )}

      {/* Mum Seçim İpucu Banner */}
      {replayState.isReplayActive && replayState.isSelectingCutoff && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 z-30 bg-amber-500/90 text-slate-950 font-bold text-xs px-4 py-1.5 rounded-full shadow-lg border border-amber-300/50 backdrop-blur-md animate-bounce flex items-center gap-2 select-none pointer-events-none">
          <Scissors className="w-4 h-4" />
          <span>Grafikte kestirmek istediğiniz muma tıklayın!</span>
        </div>
      )}

      {/* TradingView Tarzı Çizgi Üzerinde Açılan Alarm Rozeti ve Çöp Kutusu (Trash2) */}
      {alarmOverlays.map((item) => {
        const isNearLine = currentCrosshairY !== null && Math.abs(item.y - currentCrosshairY) <= 18;

        return (
          <div
            key={item.id}
            style={{ top: `${item.y - 14}px` }}
            className={`absolute left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-1 rounded-md bg-[#131722]/95 border border-slate-300 text-slate-100 text-xs font-mono font-medium shadow-2xl backdrop-blur-md transition-all duration-150 select-none group ${
              isNearLine ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none hover:opacity-100 hover:pointer-events-auto'
            }`}
          >
            <span>
              {item.symbol} Kesişme {item.val}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                alertStore.deleteAlert(item.id);
              }}
              className="p-0.5 text-slate-300 hover:text-red-400 active:scale-90 transition-colors cursor-pointer shrink-0 ml-0.5"
              title="Alarmı Sil"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}

      {/* Fiyat Göstergesi Yanındaki (+) Butonu - Doğrudan DOM Ref ile 0ms Gecikmesiz Konumlandırma */}
      <button
        ref={plusButtonRef}
        onMouseEnter={() => {
          isHoveringPlusButtonRef.current = true;
        }}
        onMouseLeave={() => {
          isHoveringPlusButtonRef.current = false;
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (currentCrosshairYRef.current !== null && currentCrosshairPriceRef.current !== null) {
            setPlusMenu({ y: currentCrosshairYRef.current, price: currentCrosshairPriceRef.current });
            if (plusButtonRef.current) plusButtonRef.current.style.display = 'none';
          }
        }}
        style={{ display: 'none' }}
        className="absolute right-[76px] z-30 w-6 h-6 rounded-full bg-[#1e222d] border border-slate-500 hover:border-amber-400 hover:bg-slate-800 text-slate-200 hover:text-amber-400 flex items-center justify-center shadow-xl cursor-pointer group"
        title="Alarm veya Seçenek Ekle (+)"
      >
        <Plus className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
      </button>

      {/* Popover Menü Açıkken Dışarı Tıklama Yakalayıcı Backdrop */}
      {plusMenu && (
        <div
          className="absolute inset-0 z-35 bg-transparent"
          onClick={() => setPlusMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setPlusMenu(null);
          }}
        />
      )}

      {/* (+) Butonuna Tıklandığında Açılan Hızlı İşlem Menüsü Popover */}
      {plusMenu && (
        <div
          style={{ top: `${Math.max(10, plusMenu.y - 18)}px` }}
          className="absolute right-[84px] z-40 bg-[#1e222d] border border-[#2a2e39] rounded-xl shadow-2xl py-1.5 min-w-[310px] text-xs animate-fadeIn select-none backdrop-blur-md"
        >
          {/* Alarm Ekle Menü Seçeneği - Modal Açmadan Doğrudan Anında Ekler */}
          <button
            onClick={async () => {
              const targetPrice = Number(plusMenu.price.toFixed(2));
              setPlusMenu(null);
              const lastPrice = fullDataRef.current.length > 0 ? fullDataRef.current[fullDataRef.current.length - 1].close : targetPrice;
              const condition = targetPrice >= lastPrice ? 'rises_above' : 'falls_below';

              try {
                await alertStore.createAlert({
                  symbol,
                  provider,
                  target_type: 'price',
                  condition,
                  threshold_value: targetPrice,
                });
              } catch (e) {
                console.error('Fast alert create error:', e);
              }
            }}
            className="w-full px-3 py-2 flex items-center justify-between text-slate-200 hover:bg-[#2a2e39] hover:text-white transition group cursor-pointer"
          >
            <div className="flex items-center gap-2.5 truncate pr-2">
              <Bell className="w-4 h-4 text-[#f59e0b] shrink-0" />
              <span className="truncate">
                {formatPriceLabel(plusMenu.price)} üzerinden {symbol} için alarm ekle
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono shrink-0 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700">
              Alt + A
            </span>
          </button>
        </div>
      )}

      <div ref={chartContainerRef} className="w-full h-full" />

      {/* Sembol Arama Modal Penceresi */}
      <SymbolSearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        onSelectSymbol={(newSymbol, newProvider) => {
          setSymbol(newSymbol);
          setProvider(newProvider);
        }}
        currentProvider={provider}
      />
    </div>
  );
}

