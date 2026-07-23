import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createChart, ColorType, PriceScaleMode, CrosshairMode } from 'lightweight-charts';
import type { Time } from 'lightweight-charts';
import DrawingToolbar from './drawings/DrawingToolbar';
import DrawingEditPanel from './drawings/DrawingEditPanel';
import { DrawingsPrimitive, RECT_HANDLE_LABELS } from './drawings/DrawingPrimitive';
import {
  TOOL_CONFIG, generateDrawingId,
  DEFAULT_DRAWING_COLOR, DEFAULT_LINE_WIDTH, DEFAULT_OPACITY,
} from './drawings/types';
import type { Drawing, DrawingPoint, DrawingTool, DrawingEditOptions } from './drawings/types';
import { calculateEMA, calculateRSI, calculateMACD } from '../utils/indicators';
import type { IndicatorsState } from './IndicatorToolbar';
import { Loader2, Calendar, SlidersHorizontal, AlertCircle, BarChart3, RotateCcw, Scissors, Search, Bookmark } from 'lucide-react';
import { useReplayStore, replayStore } from '../store/replayStore';
import ReplayControls from '../replay/ReplayControls';
import SymbolSearchModal from '../components/SymbolSearchModal';
import { watchlistStore } from '../store/watchlistStore';




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
}: CandleChartProps) {

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const candleSeriesRef = useRef<ReturnType<ReturnType<typeof createChart>['addCandlestickSeries']> | null>(null);
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
    trendLine: { color: DEFAULT_DRAWING_COLOR, lineWidth: DEFAULT_LINE_WIDTH, opacity: DEFAULT_OPACITY },
    horizontalRay: { color: DEFAULT_DRAWING_COLOR, lineWidth: DEFAULT_LINE_WIDTH, opacity: DEFAULT_OPACITY },
    rectangle: { color: DEFAULT_DRAWING_COLOR, lineWidth: DEFAULT_LINE_WIDTH, opacity: DEFAULT_OPACITY },
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

  const [chartHeight, setChartHeight] = useState(600);
  const [isIndicatorsOpen, setIsIndicatorsOpen] = useState(false);
  const [isDatesOpen, setIsDatesOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);


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
        return {
          isReplayActive: false,
          isSelectingCutoff: false,
          isPlaying: false,
          cutoffIndex: null,
          currentIndex: null,
          targetTimestamp: null,
        };
      } else {
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
  }, [data, setReplayState]);

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
      if (!isDraggingDividerRef.current || !chartContainerRef.current || !activeDividerRef.current) return;
      const rect = chartContainerRef.current.getBoundingClientRect();
      const relativeY = e.clientY - rect.top;

      if (activeDividerRef.current === 'main') {
        const newRatio = 1 - relativeY / rect.height;
        setSubPaneRatio(Math.max(0.10, Math.min(0.80, newRatio)));
      } else {
        // Alt ayırıcı: alt panel alanındaki konum
        const curRatio = subPaneRatioRef.current;
        const subAreaStartPx = rect.height * (1 - curRatio);
        const subAreaHeightPx = rect.height * curRatio;
        if (subAreaHeightPx <= 0) return;
        const posInSubArea = (relativeY - subAreaStartPx) / subAreaHeightPx;
        setRsiMacdSplit(Math.max(0.15, Math.min(0.85, posInSubArea)));
      }
    };

    const handleMouseUp = () => {
      if (isDraggingDividerRef.current) {
        isDraggingDividerRef.current = false;
        activeDividerRef.current = null;
        setIsDraggingDivider(false);
        setDividerHovered(null);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const cancelDrawing = useCallback(() => {
    currentPointsRef.current = [];
    primitiveRef.current?.setPreview(null);
  }, []);

  const changeTool = useCallback((tool: DrawingTool) => {
    activeToolRef.current = tool;
    setActiveTool(tool);
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
      const logical = chart.timeScale().coordinateToLogical(x);
      if (logical !== null) {
        const barIdx = Math.round(logical);
        const bar = series.dataByIndex(barIdx) as any;
        if (bar) {
          const barTime = bar.time as number;
          const barPixelX = chart.timeScale().timeToCoordinate(barTime as Time);
          const snapPrice = series.coordinateToPrice(y);
          if (barPixelX !== null && snapPrice !== null) {
            const visibleRange = chart.timeScale().getVisibleLogicalRange();
            let threshold = 20;
            if (visibleRange) {
              const spacing = chart.timeScale().width() / (visibleRange.to - visibleRange.from);
              threshold = Math.max(8, Math.min(40, spacing * 0.45));
            }
            if (Math.abs(x - barPixelX) <= threshold) {
              const ohlc = [bar.open as number, bar.high as number, bar.low as number, bar.close as number];
              const price = ohlc.reduce((best, p) =>
                Math.abs(p - snapPrice) < Math.abs(best - snapPrice) ? p : best
              );
              return { time: barTime, price };
            }
          }
        }
      }
      const time = chart.timeScale().coordinateToTime(x);
      const price = series.coordinateToPrice(y);
      if (time === null || price === null) return null;
      return { time: time as number, price };
    }

    const logical = chart.timeScale().coordinateToLogical(x);
    const price = series.coordinateToPrice(y);
    if (logical === null || price === null) return null;

    const barIdx = Math.floor(logical);
    const nextIdx = Math.ceil(logical);
    const fraction = logical - barIdx;

    const bar = series.dataByIndex(barIdx) as any;
    const nextBar = series.dataByIndex(nextIdx) as any;
    let time: number;
    if (bar && nextBar) {
      const t1 = bar.time as number;
      const t2 = nextBar.time as number;
      time = t1 + (t2 - t1) * fraction;
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

    if (drawing.tool === 'rectangle') {
      const oldTimeMin = Math.min(drawing.points[0].time, drawing.points[1].time);
      const oldTimeMax = Math.max(drawing.points[0].time, drawing.points[1].time);
      const oldPriceMin = Math.min(drawing.points[0].price, drawing.points[1].price);
      const oldPriceMax = Math.max(drawing.points[0].price, drawing.points[1].price);

      let t1 = oldTimeMin, t2 = oldTimeMax, p1 = oldPriceMin, p2 = oldPriceMax;
      switch (RECT_HANDLE_LABELS[handleIndex]) {
        case 'tl': t1 = newPoint.time; p1 = newPoint.price; break;
        case 't':  p1 = newPoint.price; break;
        case 'tr': t2 = newPoint.time; p1 = newPoint.price; break;
        case 'r':  t2 = newPoint.time; break;
        case 'br': t2 = newPoint.time; p2 = newPoint.price; break;
        case 'b':  p2 = newPoint.price; break;
        case 'bl': t1 = newPoint.time; p2 = newPoint.price; break;
        case 'l':  t1 = newPoint.time; break;
      }

      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      if (p1 > p2) { const tmp = p1; p1 = p2; p2 = tmp; }

      return {
        ...drawing,
        points: [{ time: t1, price: p1 }, { time: t2, price: p2 }],
      };
    }

    const modified = { ...drawing, points: [...drawing.points] };
    modified.points[handleIndex] = newPoint;
    return modified;
  }, []);

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
    });

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

      if (activeToolRef.current === 'pointer') {
        if (dragStateRef.current) {
          const point = getPointFromPixel(param.point.x, param.point.y, snapEnabledRef.current);
          if (point) {
            const modified = applyDrag(dragStateRef.current.drawingId, dragStateRef.current.handleIndex, point);
            if (modified) {
              const idx = drawingsRef.current.findIndex(d => d.id === dragStateRef.current!.drawingId);
              if (idx >= 0) drawingsRef.current[idx] = modified;
              primitive.setDrawings(drawingsRef.current);
            }
          }
          dragStateRef.current = null;
          primitive.setPreview(null);
          return;
        }

        const hitId = param.hoveredObjectId as string | undefined;
        if (hitId && hitId.length > 2) {
          if (hitId.startsWith('h:')) {
            const rest = hitId.substring(2);
            const sep = rest.lastIndexOf(':');
            const drawingId = sep >= 0 ? rest.substring(0, sep) : rest;
            const handleIndex = sep >= 0 ? parseInt(rest.substring(sep + 1), 10) : -1;
            selectDrawing(drawingId);
            if (handleIndex >= 0) {
              dragStateRef.current = { drawingId, handleIndex };
            }
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

      const point = getPointFromPixel(param.point.x, param.point.y, snapEnabledRef.current);
      if (!point) return;

      const newPoints = [...currentPointsRef.current, point];
      currentPointsRef.current = newPoints;

      if (newPoints.length === config.pointsNeeded) {
        const settings = toolSettingsRef.current[tool] || {
          color: DEFAULT_DRAWING_COLOR,
          lineWidth: DEFAULT_LINE_WIDTH,
          opacity: DEFAULT_OPACITY,
        };

        const drawing: Drawing = {
          id: generateDrawingId(),
          tool,
          points: newPoints,
          color: settings.color,
          lineWidth: settings.lineWidth,
          opacity: settings.opacity,
        };
        drawingsRef.current = [...drawingsRef.current, drawing];
        primitive.setDrawings(drawingsRef.current);
        currentPointsRef.current = [];

        activeToolRef.current = 'pointer';
        setActiveTool('pointer');
      }
    });

    chart.subscribeCrosshairMove((param) => {
      if (!param.point) return;

      if (activeToolRef.current === 'pointer') {
        const hitId = param.hoveredObjectId as string | undefined;
        let hoveredId: string | null = null;
        if (hitId && hitId.length > 2) {
          hoveredId = hitId.substring(2);
        }
        primitive.setHoveredId(hoveredId);

        if (dragStateRef.current) {
          const point = getPointFromPixel(param.point.x, param.point.y, snapEnabledRef.current);
          if (point) {
            const modified = applyDrag(dragStateRef.current.drawingId, dragStateRef.current.handleIndex, point);
            if (modified) {
              primitive.setPreview({
                ...modified,
                id: 'drag-preview',
                color: 'rgba(59, 130, 246, 0.5)',
                opacity: 0.6,
              });
            }
          }
        }
        return;
      }

      const config = TOOL_CONFIG[activeToolRef.current];
      if (!config || currentPointsRef.current.length === 0) return;
      if (currentPointsRef.current.length >= config.pointsNeeded) return;

      const point = getPointFromPixel(param.point.x, param.point.y, snapEnabledRef.current);
      if (!point) return;

      const previewPoints = [...currentPointsRef.current, point];
      const settings = toolSettingsRef.current[activeToolRef.current];
      primitive.setPreview({
        id: 'preview',
        tool: activeToolRef.current,
        points: previewPoints,
        color: settings ? settings.color : 'rgba(59, 130, 246, 0.5)',
        lineWidth: settings ? settings.lineWidth : DEFAULT_LINE_WIDTH,
        opacity: settings ? settings.opacity * 0.7 : 0.6,
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

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (dragStateRef.current) {
          dragStateRef.current = null;
          primitive.setPreview(null);
        } else if (activeToolRef.current !== 'pointer') {
          cancelDrawing();
          changeTool('pointer');
        } else if (selectedDrawingRef.current) {
          deselectDrawing();
        }
      }
      if (e.key === 'Delete' && selectedDrawingRef.current) {
        deleteSelected();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('keydown', handleKeyDown);

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
    chartRef.current.applyOptions({
      crosshair: {
        mode: snapEnabled ? CrosshairMode.Magnet : CrosshairMode.Normal,
      },
    });
  }, [snapEnabled]);

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

      candleSeriesRef.current.setData(
        uniqueData.map((d) => ({ time: d.time as Time, open: d.open, high: d.high, low: d.low, close: d.close }))
      );
      volumeSeriesRef.current.setData(
        uniqueData.map((d) => ({
          time: d.time as Time,
          value: d.volume,
          color: d.close >= d.open ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)',
        }))
      );
      
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
          lineWidth: 1,
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


            {/* Quick Watchlist Bookmark Button */}
            <button
              onClick={() => watchlistStore.toggleSymbol(symbol, provider)}
              className={`p-1.5 rounded-lg border transition-all ${
                watchlistStore.isSymbolInActiveList(symbol, provider)
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 shadow-sm'
                  : 'bg-[#070b13]/80 border-slate-800 text-slate-500 hover:text-amber-400 hover:bg-slate-800'
              }`}
              title={watchlistStore.isSymbolInActiveList(symbol, provider) ? 'İzleme Listesinden Çıkar' : 'İzleme Listesine Ekle'}
            >
              <Bookmark className={`w-3.5 h-3.5 ${watchlistStore.isSymbolInActiveList(symbol, provider) ? 'fill-amber-400' : ''}`} />
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
          />
        ) : activeTool !== 'pointer' ? (
          <DrawingEditPanel
            title={`Stil (${TOOL_CONFIG[activeTool]?.label || 'Araç'}):`}
            options={editOptions}
            onChange={updateSelectedOptions}
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

