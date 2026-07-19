import { useEffect, useRef, useState, useCallback } from 'react';
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
  logScale?: boolean;
}

interface DragState {
  drawingId: string;
  handleIndex: number;
}

export default function CandleChart({ data, logScale = false }: CandleChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const candleSeriesRef = useRef<ReturnType<ReturnType<typeof createChart>['addCandlestickSeries']> | null>(null);
  const volumeSeriesRef = useRef<ReturnType<ReturnType<typeof createChart>['addHistogramSeries']> | null>(null);
  const primitiveRef = useRef<DrawingsPrimitive | null>(null);

  const [activeTool, setActiveTool] = useState<DrawingTool>('pointer');
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [selectedDrawing, setSelectedDrawing] = useState<Drawing | null>(null);
  const [editOptions, setEditOptions] = useState<DrawingEditOptions>({
    color: DEFAULT_DRAWING_COLOR,
    lineWidth: DEFAULT_LINE_WIDTH,
    opacity: DEFAULT_OPACITY,
  });

  const activeToolRef = useRef<DrawingTool>('pointer');
  const snapEnabledRef = useRef(true);
  const drawingsRef = useRef<Drawing[]>([]);
  const currentPointsRef = useRef<DrawingPoint[]>([]);
  const selectedDrawingRef = useRef<Drawing | null>(null);
  const dragStateRef = useRef<DragState | null>(null);

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
      setEditOptions({ color: DEFAULT_DRAWING_COLOR, lineWidth: DEFAULT_LINE_WIDTH, opacity: DEFAULT_OPACITY });
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
    if (!sel) return;
    sel.color = opts.color;
    sel.lineWidth = opts.lineWidth;
    sel.opacity = opts.opacity;
    drawingsRef.current = drawingsRef.current.map(d => d.id === sel.id ? sel : d);
    primitiveRef.current?.setDrawings(drawingsRef.current);
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
      height: 500,
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
      priceScaleId: '',
    });

    chart.priceScale('').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    const primitive = new DrawingsPrimitive();
    candleSeries.attachPrimitive(primitive);
    primitiveRef.current = primitive;

    chart.subscribeClick((param) => {
      if (!param.point) return;

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
        const drawing: Drawing = {
          id: generateDrawingId(),
          tool,
          points: newPoints,
          color: DEFAULT_DRAWING_COLOR,
          lineWidth: DEFAULT_LINE_WIDTH,
          opacity: DEFAULT_OPACITY,
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
      primitive.setPreview({
        id: 'preview',
        tool: activeToolRef.current,
        points: previewPoints,
        color: 'rgba(59, 130, 246, 0.5)',
        lineWidth: DEFAULT_LINE_WIDTH,
        opacity: 0.6,
      });
    });

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

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
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
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

    if (data && data.length > 0) {
      candleSeriesRef.current.setData(
        data.map((d) => ({ time: d.time as Time, open: d.open, high: d.high, low: d.low, close: d.close }))
      );
      volumeSeriesRef.current.setData(
        data.map((d) => ({
          time: d.time as Time,
          value: d.volume,
          color: d.close >= d.open ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)',
        }))
      );
      chartRef.current.timeScale().fitContent();
    }
  }, [data]);

  return (
    <div className="relative w-full h-[500px] border border-slate-800 rounded-xl overflow-hidden bg-[#090d16]">
      <div className="absolute top-2 left-2 z-20 flex flex-col gap-1.5">
        <DrawingToolbar
          activeTool={activeTool}
          snapEnabled={snapEnabled}
          hasDrawings={drawingsRef.current.length > 0}
          onChangeTool={changeTool}
          onToggleSnap={toggleSnap}
          onClearAll={clearAll}
        />
        {selectedDrawing && (
          <DrawingEditPanel
            options={editOptions}
            onChange={updateSelectedOptions}
            onDelete={deleteSelected}
          />
        )}
      </div>
      <div ref={chartContainerRef} className="w-full h-full" />
    </div>
  );
}
