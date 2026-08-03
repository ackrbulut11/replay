import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  createChart, ColorType, PriceScaleMode, CrosshairMode,
  CandlestickSeries, LineSeries, HistogramSeries,
} from 'lightweight-charts';
import { createSeriesMarkers, createTextWatermark } from 'lightweight-charts';
import type { Time, ISeriesApi, ISeriesMarkersPluginApi } from 'lightweight-charts';
import DrawingToolbar from './drawings/DrawingToolbar';
import DrawingEditPanel from './drawings/DrawingEditPanel';
import { DrawingsPrimitive, RECT_HANDLE_LABELS, POSITION_HANDLE_LABELS, CHANNEL_HANDLE_LABELS } from './drawings/DrawingPrimitive';
import {
  TOOL_CONFIG, generateDrawingId,
  DEFAULT_DRAWING_COLOR, DEFAULT_LINE_WIDTH, DEFAULT_OPACITY, DEFAULT_LINE_STYLE,
} from './drawings/types';
import type { Drawing, DrawingPoint, DrawingTool, DrawingEditOptions } from './drawings/types';
import { logDrawingUsage } from '../services/chartAnalytics';
import { calculateEMA, calculateRSI, calculateMACD, calculateBollingerBands } from '../utils/indicators';
import type { IndicatorsState } from './IndicatorToolbar';
import { Loader2, Calendar, SlidersHorizontal, AlertCircle, AlertTriangle, BarChart3, RotateCcw, Scissors, Search, Bookmark, Plus, Bell, Trash2, X, Zap, Settings2, ChevronRight } from 'lucide-react';
import { useReplayStore, replayStore } from '../store/replayStore';
import ReplayControls from '../replay/ReplayControls';
import ReplayTradePanel from '../replay/ReplayTradePanel';
import SymbolSearchModal from '../components/SymbolSearchModal';
import { useWatchlistStore, watchlistStore } from '../store/watchlistStore';
import { useAlertStore, alertStore } from '../store/alertStore';
import { useStrategyStore, strategyStore } from '../store/strategyStore';
import { useChartSettingsStore } from '../store/chartSettingsStore';
import { journalStore, useJournalStore } from '../store/journalStore';
import { getCoverage } from '../services/marketApi';
import type { IndicatorSettingsMap } from '../store/chartSettingsStore';
import IndicatorSettingsModal from './IndicatorSettingsModal';





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

/**
 * Hedef zamana denk gelen (ondan önceki son) mumun indeksini döndürür.
 *
 * Hedef tüm mumlardan ÖNCEYSE -1 döner. Eskiden bu durumda 0 dönüyordu; bu
 * sessiz kırpma yüzünden replay konumu zaman dilimi değişiminde alakasız bir
 * mumun üzerine kayıyor ve hedef zaman damgası da o mumun zamanıyla
 * eziliyordu (yani kullanıcının konumu kalıcı olarak kayboluyordu).
 */
function findCandleIndexByTimestamp(candles: CandleData[], targetTimestamp: number): number {
  let matchIdx = -1;
  for (let i = 0; i < candles.length; i++) {
    if (candles[i].time <= targetTimestamp) {
      matchIdx = i;
    } else {
      break;
    }
  }
  return matchIdx;
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
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const mainLineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const primitiveRef = useRef<DrawingsPrimitive | null>(null);
  // v5'te setMarkers seriden kaldirildi; isaretler ayri bir eklenti uzerinden yonetilir.
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  // Gösterge Serisi Referansları
  const ema20Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const ema50Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const ema100Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const ema200Ref = useRef<ISeriesApi<'Line'> | null>(null);

  const rsiRef = useRef<ISeriesApi<'Line'> | null>(null);
  const rsiPriceLinesRef = useRef<{ overbought?: any; middle?: any; oversold?: any }>({});

  const macdLineRef = useRef<ISeriesApi<'Line'> | null>(null);
  const macdSignalRef = useRef<ISeriesApi<'Line'> | null>(null);
  const macdHistRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  const bbUpperRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbMiddleRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbLowerRef = useRef<ISeriesApi<'Line'> | null>(null);

  const alertPriceLinesRef = useRef<Array<{ line: any; series: any }>>([]);
  const [alertState] = useAlertStore();


  // Alt panel boyutlandırma durumu

  const [activeTool, setActiveTool] = useState<DrawingTool>('pointer');
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [selectedDrawing, setSelectedDrawing] = useState<Drawing | null>(null);

  // Çizim araçlarının varsayılan stilleri (renk/kalınlık/opaklık/çizgi tipi) ve
  // gösterge ayarları kullanıcıya bağlı olarak sunucuda saklanır (bkz. chartSettingsStore).
  const [chartSettings, chartSettingsApi] = useChartSettingsStore();
  const toolSettings = chartSettings.drawingDefaults;
  const indicatorSettings = chartSettings.indicators;
  const [editingIndicator, setEditingIndicator] = useState<keyof IndicatorSettingsMap | null>(null);
  const [isLegendExpanded, setIsLegendExpanded] = useState(false);

  const toolSettingsRef = useRef(toolSettings);
  toolSettingsRef.current = toolSettings;

  // Bağımlılık dizisi boş olan (mount'ta bir kez çalışan) efektlerden erişim
  // için: chartSettingsApi kararlı bir referans olsa da doğrudan kullanmak
  // exhaustive-deps uyarısı üretir (diğer ref'lerle aynı desen, bkz. yukarı).
  const chartSettingsApiRef = useRef(chartSettingsApi);
  chartSettingsApiRef.current = chartSettingsApi;

  const [editOptions, setEditOptions] = useState<DrawingEditOptions>({
    color: DEFAULT_DRAWING_COLOR,
    lineWidth: DEFAULT_LINE_WIDTH,
    opacity: DEFAULT_OPACITY,
    lineStyle: DEFAULT_LINE_STYLE,
  });

  const activeToolRef = useRef<DrawingTool>('pointer');
  const snapEnabledRef = useRef(false);
  const drawingsRef = useRef<Drawing[]>([]);
  // Çizimler parite bazında saklanır (RULES.md: her sembolün kendi göstergesi)
  // ve kullanıcıya bağlı olarak sunucuda kalıcılaştırılır (bkz.
  // chartSettingsStore.drawings). Grafik bileşeni sembol değişse de yeniden
  // mount olmadığı için bu adım olmadan bir önceki paritenin çizimleri yeni
  // paritede kalır.
  const currentDrawingKeyRef = useRef<string>(`${provider}:${symbol}`.toUpperCase());
  const currentPointsRef = useRef<DrawingPoint[]>([]);
  const selectedDrawingRef = useRef<Drawing | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const hoveredObjectIdRef = useRef<string | null>(null); // lightweight-charts'tan gelen hover ID
  const isDraggingDrawingRef = useRef(false); // gerçek sürükleme mi tıklama mı ayırt et
  // getPointFromPixel ve applyDrag useCallback ref'leri (global useEffect'ten erişim için)
  const getPointFromPixelRef = useRef<((x: number, y: number, snap: boolean) => DrawingPoint | null) | null>(null);
  const applyDragRef = useRef<((drawingId: string, handleIndex: number, point: DrawingPoint) => Drawing | null) | null>(null);
  const persistDrawingsRef = useRef<((key: string, drawings: Drawing[]) => void) | null>(null);

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
  const [isHoveringPlusButton, setIsHoveringPlusButton] = useState(false);

  const [currentCrosshairY, setCurrentCrosshairY] = useState<number | null>(null);
  const [alarmOverlays, setAlarmOverlays] = useState<Array<{ id: string; y: number; symbol: string; condSym: string; val: string }>>([]);
  const updateAlarmOverlaysRef = useRef<(() => void) | null>(null);

  const formatPriceLabel = useCallback((val?: number | null) => {
    if (val === undefined || val === null) return '—';
    return (provider === 'binance' || provider === 'forex' || provider === 'fx')
      ? val.toFixed(4)
      : val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }, [provider]);


  // Strateji sinyallerini grafik üzerinde oklar (BUY/SELL) olarak çizdir
  const { evaluateResult } = useStrategyStore();
  const { trades: journalTrades } = useJournalStore();

  /**
   * Manuel işlemlerin giriş/çıkış işaretleri.
   *
   * Bilinçli olarak sade: küçük bir ok ve fiyat. Stop/hedef seviyeleri veya
   * kâr/zarar burada gösterilmez — grafik kalabalıklaşmasın.
   */
  const buildTradeMarkers = useCallback((): any[] => {
    if (!data || data.length === 0 || journalTrades.length === 0) return [];

    // Mum aralığı: işaretin yüklü veriye gerçekten denk gelip gelmediğini
    // ölçmek için. Sabit bir tolerans zaman dilimine göre yanlış olurdu.
    const barSpacing =
      data.length > 1 ? Math.abs(data[data.length - 1].time - data[data.length - 2].time) : 86400;
    const maxSnapDistance = barSpacing * 2;

    /**
     * ISO zamanı en yakın mumun zamanına oturtur.
     *
     * Yüklü aralığın dışında kalan işlemler için `null` döner; aksi halde en
     * yakın mum bulunur ve grafiğin kenarına alakasız bir işaret çizilirdi.
     */
    const snapToBar = (iso?: string | null): Time | null => {
      if (!iso) return null;
      const seconds = Math.floor(new Date(iso).getTime() / 1000);
      if (!Number.isFinite(seconds)) return null;

      let closest: CandleData | null = null;
      let minDiff = Infinity;
      for (const candle of data) {
        const diff = Math.abs(candle.time - seconds);
        if (diff < minDiff) {
          minDiff = diff;
          closest = candle;
        }
      }
      return closest && minDiff <= maxSnapDistance ? (closest.time as Time) : null;
    };

    const markers: any[] = [];

    journalTrades.forEach((trade) => {
      if (trade.symbol?.toUpperCase() !== symbol?.toUpperCase()) return;

      const isLong = trade.side === 'long';

      const entryTime = snapToBar(trade.entry_time);
      if (entryTime !== null) {
        markers.push({
          time: entryTime,
          position: isLong ? ('belowBar' as const) : ('aboveBar' as const),
          color: isLong ? '#34d399' : '#f87171',
          shape: isLong ? ('arrowUp' as const) : ('arrowDown' as const),
          text: formatPriceLabel(trade.entry_price),
        });
      }

      // Çıkış yalnızca kapanmış işlemlerde var.
      const exitTime = snapToBar(trade.exit_time);
      if (exitTime !== null && trade.exit_price != null) {
        markers.push({
          time: exitTime,
          position: isLong ? ('aboveBar' as const) : ('belowBar' as const),
          color: '#a1a1aa',
          shape: isLong ? ('arrowDown' as const) : ('arrowUp' as const),
          text: formatPriceLabel(trade.exit_price),
        });
      }
    });

    return markers;
  }, [journalTrades, data, symbol, formatPriceLabel]);

  const applyStrategyMarkers = useCallback(() => {
    const targetSeries = candleSeriesRef.current || mainLineSeriesRef.current;
    if (!targetSeries) return;

    // Manuel işlem işaretleri strateji sinyallerinden bağımsız yaşar; tek bir
    // eklenti olduğu için ikisi burada birleştirilir, aksi halde biri
    // diğerinin işaretlerini silerdi.
    const tradeMarkers = buildTradeMarkers();

    const setMarkers = (strategyMarkers: any[]) => {
      const merged = [...tradeMarkers, ...strategyMarkers].sort(
        (a, b) => Number(a.time) - Number(b.time)
      );
      if (!markersPluginRef.current) {
        markersPluginRef.current = createSeriesMarkers(targetSeries, merged);
      } else {
        markersPluginRef.current.setMarkers(merged);
      }
    };

    if (!evaluateResult || !Array.isArray(evaluateResult.signals) || evaluateResult.signals.length === 0) {
      try {
        setMarkers([]);
      } catch {}
      return;
    }

    if (!data || data.length === 0) return;

    // Sembol kontrolü
    if (evaluateResult.symbol && symbol && evaluateResult.symbol.toUpperCase() !== symbol.toUpperCase()) {
      try {
        setMarkers([]);
      } catch {}
      return;
    }

    const markersMap = new Map<Time, any>();

    evaluateResult.signals.forEach((sig) => {
      if (!sig) return;
      let targetTime: Time | null = null;

      // Tam zaman eşleşmesi
      const exactMatch = data.find((d) => d.time === sig.timestamp);
      if (exactMatch) {
        targetTime = exactMatch.time as Time;
      } else {
        // En yakın mumu bul (en fazla 2 gün fark)
        let minDiff = Infinity;
        let closest: CandleData | null = null;
        for (const candle of data) {
          const diff = Math.abs(candle.time - sig.timestamp);
          if (diff < minDiff) {
            minDiff = diff;
            closest = candle;
          }
        }
        if (closest && minDiff <= 86400 * 2) {
          targetTime = closest.time as Time;
        }
      }

      if (!targetTime) return;

      const isBuy = sig.signal === 'BUY';
      const priceText = typeof sig.price === 'number' && !isNaN(sig.price) ? sig.price.toFixed(2) : '';
      let labelText = `${sig.signal || ''}`;

      if (priceText) {
        labelText += ` @ ${priceText}`;
      }
      if (!isBuy && typeof sig.pnl_percent === 'number' && !isNaN(sig.pnl_percent)) {
        labelText += ` (${sig.pnl_percent >= 0 ? '+' : ''}${sig.pnl_percent.toFixed(2)}%)`;
      }

      markersMap.set(targetTime, {
        time: targetTime,
        position: isBuy ? ('belowBar' as const) : ('aboveBar' as const),
        color: isBuy ? '#22d3ee' : '#f97316',
        shape: isBuy ? ('arrowUp' as const) : ('arrowDown' as const),
        text: labelText,
      });
    });

    const markers = Array.from(markersMap.values()).sort((a, b) => Number(a.time) - Number(b.time));

    try {
      setMarkers(markers);
    } catch (err) {
      console.warn('Set strategy markers error:', err);
    }
  }, [evaluateResult, symbol, data, buildTradeMarkers]);

  useEffect(() => {
    applyStrategyMarkers();
  }, [applyStrategyMarkers]);

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

  // Manuel işlem işaretleri yalnızca replay modunda anlamlıdır. Store panel
  // kapandıktan sonra da veriyi tuttuğu için, replay'den çıkıldığında temizlenmezse
  // giriş/çıkış okları normal grafik görünümünde asılı kalıyordu. Mum kesme
  // sırasında panel geçici olarak gizlenir ama replay hâlâ aktiftir; bu yüzden
  // temizlik panelin unmount'una değil, replay modunun kapanmasına bağlanır.
  useEffect(() => {
    if (!replayState.isReplayActive) {
      journalStore.reset();
    }
  }, [replayState.isReplayActive]);

  // ─── Replay'de zaman dilimi değişimi ────────────────────────────────────
  // Replay'de geriye gidildiğinde zaman dilimi değiştirmek konumu korumalıdır.
  // Ancak düşük çözünürlüklü veriler çok daha kısa bir geçmiş saklar
  // (RULES.md #24-27): 4h yıllar öncesine giderken 5m yalnızca birkaç ay geriye
  // gider. Hedef tarih yeni zaman diliminde hiç yoksa geçişe izin verilmez;
  // aksi halde replay sessizce alakasız bir tarihe sıçrıyordu.
  const [timeframeWarning, setTimeframeWarning] = useState<string | null>(null);

  const handleTimeframeChange = useCallback(
    async (nextTimeframe: string) => {
      const { isReplayActive, targetTimestamp } = replayStore.getState();

      if (!isReplayActive || targetTimestamp === null) {
        setTimeframeWarning(null);
        setTimeframe(nextTimeframe);
        return;
      }

      try {
        const coverage = await getCoverage(provider, symbol, nextTimeframe);
        // `available: false` "bilinmiyor" demektir (önbellek yok) — engelleme.
        if (coverage.available && coverage.first) {
          const firstSeconds = Math.floor(new Date(coverage.first).getTime() / 1000);
          if (Number.isFinite(firstSeconds) && targetTimestamp < firstSeconds) {
            const hedef = new Date(targetTimestamp * 1000).toLocaleDateString('tr-TR');
            const enEski = new Date(coverage.first).toLocaleDateString('tr-TR');
            setTimeframeWarning(
              `${nextTimeframe} verisi yalnızca ${enEski} tarihine kadar geriye gidiyor; ` +
                `replay konumunuz (${hedef}) bu aralığın dışında. Zaman dilimi değiştirilmedi.`
            );
            return;
          }
        }
      } catch {
        // Kapsama sorgusu başarısızsa kullanıcıyı engelleme; geçişe izin ver.
      }

      setTimeframeWarning(null);
      setTimeframe(nextTimeframe);
    },
    [provider, symbol, setTimeframe]
  );

  // Uyarı yalnızca replay sürerken anlamlı; moddan çıkınca temizlenir.
  useEffect(() => {
    if (!replayState.isReplayActive) setTimeframeWarning(null);
  }, [replayState.isReplayActive]);

  const fullDataRef = useRef<CandleData[]>(data);
  fullDataRef.current = data;

  const prevVisibleLengthRef = useRef<number>(0);
  // Arkaplanda geçmişe dönük veri ekstansiyonunu (prepend) sembol/interval
  // değişiminden ve replay adımlarından ayırt edebilmek için önceki verinin
  // ilk/son zaman damgalarını tutar.
  const prevDataBoundsRef = useRef<{ firstTime: number; lastTime: number } | null>(null);

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

      // Hedef, yüklü verinin başlangıcından daha eski: henüz eşleşecek mum yok.
      // Konumu ilk muma kırpmak yerine hedefi OLDUĞU GİBİ KORU — arkaplanda
      // daha eski mumlar yüklendiğinde bu efekt yeniden çalışıp doğru mumu
      // bulacak. Hedefi ezmek, kullanıcının gittiği yeri kalıcı olarak silerdi.
      if (matchedIdx === -1) return;

      setReplayState({
        cutoffIndex: matchedIdx,
        currentIndex: matchedIdx,
        targetTimestamp: data[matchedIdx]?.time ?? replayState.targetTimestamp,
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
      if (
        plusMenuRef.current &&
        !target.closest('#plus-menu-popover') &&
        !(plusButtonRef.current && plusButtonRef.current.contains(target))
      ) {
        setPlusMenu(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Çizim tutamacı sürüklemesi için pencere düzeyinde fare dinleyicileri
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
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
      // Çizim handle sürükleme bitişi
      if (dragStateRef.current) {
        persistDrawingsRef.current?.(currentDrawingKeyRef.current, drawingsRef.current);
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

  // Çizim setini kullanıcıya bağlı olarak sunucuda kalıcılaştırır. Cetvel
  // (ruler) her tıklamada zaten temizlenen geçici bir ölçüm aracı olduğu
  // için hiç kaydedilmez — aksi halde bir sonraki girişte anlamsız bir
  // ölçüm çizgisiyle karşılaşılır.
  const persistDrawings = useCallback((key: string, drawings: Drawing[]) => {
    chartSettingsApi.setSymbolDrawings(key, drawings.filter(d => d.tool !== 'ruler'));
  }, [chartSettingsApi]);
  persistDrawingsRef.current = persistDrawings;

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
      const settings = toolSettingsRef.current[tool] || { color: DEFAULT_DRAWING_COLOR, lineWidth: DEFAULT_LINE_WIDTH, opacity: DEFAULT_OPACITY, lineStyle: DEFAULT_LINE_STYLE };
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
    persistDrawings(currentDrawingKeyRef.current, []);
  }, [persistDrawings]);

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

    const candles = fullDataRef.current;
    if (!candles || candles.length === 0) return null;

    const snapPrice = series.coordinateToPrice(y);
    if (snapPrice === null) return null;

    if (snap) {
      const time = chart.timeScale().coordinateToTime(x);
      if (time !== null) {
        const timeVal = typeof time === 'number' ? time : (time as any);
        const candle = candles.find(c => c.time === timeVal || (typeof c.time === 'object' && (c.time as any).timestamp === timeVal));

        if (candle) {
          const points = [candle.open, candle.close, candle.high, candle.low];
          const price = points.reduce((best, p) =>
            Math.abs(p - snapPrice) < Math.abs(best - snapPrice) ? p : best
          );
          return { time: candle.time, price };
        }
      }
    }

    const logical = chart.timeScale().coordinateToLogical(x);
    if (logical === null) return null;

    const totalBars = candles.length;
    const lastIdx = totalBars - 1;
    const lastCandle = candles[lastIdx];
    const prevCandle = candles[Math.max(0, lastIdx - 1)];
    const step = (totalBars > 1 && lastCandle.time > prevCandle.time)
      ? (lastCandle.time - prevCandle.time)
      : 86400;

    let time: number;

    if (logical > lastIdx) {
      // Future bars extrapolation (up to 1000+ bars ahead)
      const barsAhead = logical - lastIdx;
      time = Math.round(lastCandle.time + step * barsAhead);
    } else if (logical < 0) {
      // Past bars extrapolation
      const firstCandle = candles[0];
      time = Math.round(firstCandle.time + step * logical);
    } else {
      // In-range bar interpolation
      const barIdx = Math.floor(logical);
      const fraction = logical - barIdx;
      const c1 = candles[barIdx];
      const c2 = candles[Math.min(lastIdx, barIdx + 1)];

      if (c1 && c2 && barIdx < lastIdx) {
        time = Math.round(c1.time + (c2.time - c1.time) * fraction);
      } else if (c1) {
        time = Math.round(c1.time + step * fraction);
      } else {
        time = lastCandle.time;
      }
    }

    return { time, price: snapPrice };
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
        lineStyle: drawing.lineStyle,
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
    persistDrawings(currentDrawingKeyRef.current, drawingsRef.current);
    deselectDrawing();
  }, [deselectDrawing, persistDrawings]);

  const updateSelectedOptions = useCallback((opts: DrawingEditOptions) => {
    setEditOptions(opts);
    const sel = selectedDrawingRef.current;
    if (sel) {
      sel.color = opts.color;
      sel.lineWidth = opts.lineWidth;
      sel.opacity = opts.opacity;
      sel.lineStyle = opts.lineStyle;
      sel.fillOpacity = opts.fillOpacity;
      drawingsRef.current = drawingsRef.current.map(d => d.id === sel.id ? sel : d);
      primitiveRef.current?.setDrawings(drawingsRef.current);
      persistDrawings(currentDrawingKeyRef.current, drawingsRef.current);

      chartSettingsApi.setDrawingDefault(sel.tool, opts);
    } else if (activeToolRef.current !== 'pointer') {
      chartSettingsApi.setDrawingDefault(activeToolRef.current, opts);
    }
  }, [chartSettingsApi, persistDrawings]);

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

    if (drawing.tool === 'parallelChannel' && drawing.points.length >= 3) {
      // Kanal üç noktayla saklanır: taban çizginin iki ucu (p0, p1) ve ofset
      // çizginin sol ucu (p2). Ofset çizginin sağ ucu render'da p2 + (p1 - p0)
      // olarak türetildiği için iki çizgi tanım gereği paraleldir.
      //
      // Dört köşe de tek bir kurala uyar: sürüklenen köşe imlece gider, karşı
      // kenar sabit kalır ve kanal genişliği korunur — yani köşenin dikey eşi
      // (üst köşe sürükleniyorsa alttaki, alt köşe sürükleniyorsa üstteki) aynı
      // miktarda kayar. Kanalı genişletip daraltan tek hareket orta
      // tutamaçlardır.
      let p0 = drawing.points[0];
      let p1 = drawing.points[1];
      let p2 = drawing.points[2];
      // Kanal genişliği: ofset çizginin taban çizgiye olan fiyat farkı.
      // Köşe sürüklemelerinde sabit tutulur, bu yüzden mutasyondan önce alınır.
      const width = p2.price - p0.price;

      switch (CHANNEL_HANDLE_LABELS[handleIndex]) {
        case 'start':
          // Üst-sol köşe: sol kenarın tamamı imlece taşınır, sağ kenar sabit.
          p2 = { time: newPoint.time, price: newPoint.price + width };
          p0 = newPoint;
          break;
        case 'end':
          // Üst-sağ köşe: alt-sağ köşe p2 + (p1 - p0) ile türetildiği için
          // p1'i taşımak onu da aynı miktarda kaydırır; p2'ye dokunulmaz.
          p1 = newPoint;
          break;
        case 'offsetStart':
          // Alt-sol köşe: üst-sol köşenin aynadaki eşi. Alt-sol köşe doğrudan
          // p2 olduğu için imlece o gider, p0 genişlik kadar yukarıda kalır.
          p0 = { time: newPoint.time, price: newPoint.price - width };
          p2 = newPoint;
          break;
        case 'offsetEnd':
          // Alt-sağ köşe: üst-sağ köşenin aynadaki eşi. Bu köşe p1'den
          // türetildiği için gerçekte taşınan nokta p1'dir — p2 + (p1 - p0)
          // ifadesi imlece eşitlenip p1 çözülür.
          p1 = {
            time: newPoint.time - p2.time + p0.time,
            price: newPoint.price - width,
          };
          break;
        // Orta tutamaçlar: ilgili çizgiyi yalnızca dikey kaydırır (genişliği
        // değiştirir), zaman ekseninde hiç hareket etmezler.
        case 'baseMid': {
          const delta = newPoint.price - (p0.price + p1.price) / 2;
          p0 = { ...p0, price: p0.price + delta };
          p1 = { ...p1, price: p1.price + delta };
          break;
        }
        case 'offsetMid': {
          const currentMidPrice = p2.price + (p1.price - p0.price) / 2;
          p2 = { ...p2, price: p2.price + (newPoint.price - currentMidPrice) };
          break;
        }
      }

      return {
        ...drawing,
        points: [p0, p1, p2],
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
        rightOffset: 25,
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

    // v5'te watermark bir chart secenegi degil, pane eklentisidir.
    createTextWatermark(chart.panes()[0], {
      horzAlign: 'center',
      vertAlign: 'center',
      lines: [{ text: 'Trading Research Platform', color: 'rgba(148, 163, 184, 0.05)', fontSize: 20 }],
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
      visible: chartType === 'candlestick',
    });

    const mainLineSeries = chart.addSeries(LineSeries, {
      color: '#ffffff',
      lineWidth: 2,
      crosshairMarkerVisible: true,
      visible: chartType === 'line',
    });
    mainLineSeriesRef.current = mainLineSeries;

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#2563eb',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume_overlay',
    });

    try {
      chart.priceScale('volume_overlay').applyOptions({
        scaleMargins: { top: 0.75, bottom: 0 },
      });
    } catch (e) {
      console.warn('Volume price scale options error:', e);
    }

    const primitive = new DrawingsPrimitive();
    candleSeries.attachPrimitive(primitive);
    primitive.setCandles(fullDataRef.current || data);
    primitiveRef.current = primitive;

    // Bu paritenin daha önce kaydedilmiş çizimlerini yükle (localStorage'dan
    // anlık, sunucudan syncFromServer tamamlandığında aşağıdaki
    // drawingsVersion efektiyle güncellenir).
    const initialDrawings = chartSettingsApiRef.current.getState().drawings[currentDrawingKeyRef.current] || [];
    drawingsRef.current = initialDrawings;
    primitive.setDrawings(initialDrawings);

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
          lineStyle: DEFAULT_LINE_STYLE,
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
        } else if (tool === 'parallelChannel') {
          // Üçüncü tıklama yalnızca dikey ofseti belirler; ofset çizgi taban
          // çizgiyle aynı zaman aralığını kapsasın diye zamanı p0'a sabitlenir.
          finalPoints = [
            newPoints[0],
            newPoints[1],
            { time: newPoints[0].time, price: newPoints[2].price },
          ];
        }

        const drawing: Drawing = {
          id: generateDrawingId(),
          tool,
          points: finalPoints,
          color: settings.color,
          lineWidth: settings.lineWidth,
          opacity: settings.opacity,
          lineStyle: settings.lineStyle ?? DEFAULT_LINE_STYLE,
          fillOpacity: settings.fillOpacity ?? 0.18,
        };

        // Çizim tamamlandı: yarı saydam önizleme ("hayalet") her araçta
        // hemen temizlenmeli, yoksa kalıcı çizimin üzerinde durmaya devam
        // edip ancak bir sonraki çizimde siliniyor.
        primitive.setPreview(null);

        if (tool !== 'ruler') {
          // Cetvel geçici bir ölçüm aracı olduğu için istatistiklere dahil edilmez.
          const [drawingProvider, drawingSymbol] = currentDrawingKeyRef.current.split(':');
          logDrawingUsage(tool, drawingSymbol, drawingProvider.toLowerCase());
        }
        drawingsRef.current = [...drawingsRef.current, drawing];
        primitive.setDrawings(drawingsRef.current);
        if (tool !== 'ruler') {
          persistDrawingsRef.current?.(currentDrawingKeyRef.current, drawingsRef.current);
        }
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
      } else if (activeToolRef.current === 'parallelChannel' && currentPointsRef.current.length === 2) {
        // Ofset aşamasının önizlemesi: fare yalnızca dikey ofseti belirler.
        previewPoints = [
          currentPointsRef.current[0],
          currentPointsRef.current[1],
          { time: currentPointsRef.current[0].time, price: point.price },
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
      bbUpperRef.current = null;
      bbMiddleRef.current = null;
      bbLowerRef.current = null;

      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      primitiveRef.current = null;
    };
  }, []);

  // Sembol veya sağlayıcı değiştiğinde: aktif paritenin çizimlerini kaydet,
  // devam eden çizimi/seçimi iptal et, yeni paritenin (varsa) kayıtlı
  // çizimlerini yükle. Grafik bileşeni sembol değişince yeniden mount olmadığı
  // için bu adım olmadan çizimler tüm paritelerde ortak görünürdü.
  useEffect(() => {
    const newKey = `${provider}:${symbol}`.toUpperCase();
    const prevKey = currentDrawingKeyRef.current;
    if (newKey === prevKey) return;

    persistDrawings(prevKey, drawingsRef.current);

    currentPointsRef.current = [];
    selectedDrawingRef.current = null;
    setSelectedDrawing(null);
    primitiveRef.current?.setPreview(null);
    primitiveRef.current?.setSelectedId(null);

    const nextDrawings = chartSettingsApi.getState().drawings[newKey] || [];
    drawingsRef.current = nextDrawings;
    primitiveRef.current?.setDrawings(nextDrawings);

    currentDrawingKeyRef.current = newKey;
  }, [symbol, provider, chartSettingsApi, persistDrawings]);

  // Sunucudan gelen çizimler (bkz. syncFromServer) yalnızca aktif paritenin
  // grafiğe zaten uygulanmış hâliyle senkron değilse imperatif olarak
  // uygulanır. drawingsVersion yalnızca gerçek sunucu verisiyle arttığı için
  // yerel düzenlemeler bu efekti tetiklemez.
  useEffect(() => {
    if (!primitiveRef.current) return;
    if (dragStateRef.current || currentPointsRef.current.length > 0) return;
    const persisted = chartSettingsApi.getState().drawings[currentDrawingKeyRef.current] || [];
    drawingsRef.current = persisted;
    primitiveRef.current.setDrawings(persisted);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartSettings.drawingsVersion]);

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
      const prevBounds = prevDataBoundsRef.current;
      const newFirstTime = uniqueData[0].time as number;
      const newLastTime = uniqueData[uniqueData.length - 1].time as number;
      // Arkaplanda geçmişe dönük veri eklendiğinde (prepend) son mum aynı kalır,
      // sadece ilk mum daha eskiye gider — sembol/interval değişiminde veya replay
      // adımında ise son mumun zamanı da değişir, bu yüzden bu iki durumla
      // karışmaz.
      const isBackgroundPrepend =
        !!prevBounds &&
        prevLen > 0 &&
        newLastTime === prevBounds.lastTime &&
        newFirstTime < prevBounds.firstTime;
      const savedTimeRange = isBackgroundPrepend && chart ? chart.timeScale().getVisibleRange() : null;
      prevVisibleLengthRef.current = currentLen;
      prevDataBoundsRef.current = { firstTime: newFirstTime, lastTime: newLastTime };

      const candles: any[] = uniqueData.map((d) => ({
        time: d.time as Time,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }));

      const volumeData: any[] = uniqueData.map((d) => ({
        time: d.time as Time,
        value: d.volume,
        color: d.close >= d.open ? 'rgba(16, 185, 129, 0.65)' : 'rgba(239, 68, 68, 0.65)',
      }));

      candleSeriesRef.current.setData(candles);
      volumeSeriesRef.current.setData(volumeData);
      primitiveRef.current?.setCandles(uniqueData);

      if (mainLineSeriesRef.current) {
        const lineData = uniqueData.map((d) => ({
          time: d.time as Time,
          value: d.close,
        }));
        mainLineSeriesRef.current.setData(lineData);
      }

      // Re-apply strategy markers after series setData
      applyStrategyMarkers();

      
      if (chart) {
        if (isBackgroundPrepend) {
          // Arkaplanda daha eski veri eklendi: kullanıcının baktığı zaman aralığını
          // aynen koru (index'ler kaydığı için logical range değil, zaman bazlı
          // aralık kullanılır) — sıçrama/kayma yaşanmaz.
          if (savedTimeRange) {
            chart.timeScale().setVisibleRange(savedTimeRange);
          }
        } else if (replayState.isReplayActive && currentRange && prevLen > 0 && currentLen === prevLen + 1) {
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
        ema20Ref.current = chart.addSeries(LineSeries, {
          color: indicatorSettings.ema20.color,
          lineWidth: indicatorSettings.ema20.lineWidth as any,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
          title: '',
        });
      } else {
        ema20Ref.current.applyOptions({
          color: indicatorSettings.ema20.color,
          lineWidth: indicatorSettings.ema20.lineWidth as any,
        });
      }
      const ema20 = calculateEMA(visibleData, indicatorSettings.ema20.period);
      ema20Ref.current.setData(ema20.map(d => ({ time: d.time as Time, value: d.value })));
    } else if (ema20Ref.current) {
      chart.removeSeries(ema20Ref.current);
      ema20Ref.current = null;
    }

    // EMA 50
    if (indicators.ema50) {
      if (!ema50Ref.current) {
        ema50Ref.current = chart.addSeries(LineSeries, {
          color: indicatorSettings.ema50.color,
          lineWidth: indicatorSettings.ema50.lineWidth as any,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
          title: '',
        });
      } else {
        ema50Ref.current.applyOptions({
          color: indicatorSettings.ema50.color,
          lineWidth: indicatorSettings.ema50.lineWidth as any,
        });
      }
      const ema50 = calculateEMA(visibleData, indicatorSettings.ema50.period);
      ema50Ref.current.setData(ema50.map(d => ({ time: d.time as Time, value: d.value })));
    } else if (ema50Ref.current) {
      chart.removeSeries(ema50Ref.current);
      ema50Ref.current = null;
    }

    // EMA 100
    if (indicators.ema100) {
      if (!ema100Ref.current) {
        ema100Ref.current = chart.addSeries(LineSeries, {
          color: indicatorSettings.ema100.color,
          lineWidth: indicatorSettings.ema100.lineWidth as any,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
          title: '',
        });
      } else {
        ema100Ref.current.applyOptions({
          color: indicatorSettings.ema100.color,
          lineWidth: indicatorSettings.ema100.lineWidth as any,
        });
      }
      const ema100 = calculateEMA(visibleData, indicatorSettings.ema100.period);
      ema100Ref.current.setData(ema100.map(d => ({ time: d.time as Time, value: d.value })));
    } else if (ema100Ref.current) {
      chart.removeSeries(ema100Ref.current);
      ema100Ref.current = null;
    }

    // EMA 200
    if (indicators.ema200) {
      if (!ema200Ref.current) {
        ema200Ref.current = chart.addSeries(LineSeries, {
          color: indicatorSettings.ema200.color,
          lineWidth: indicatorSettings.ema200.lineWidth as any,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
          title: '',
        });
      } else {
        ema200Ref.current.applyOptions({
          color: indicatorSettings.ema200.color,
          lineWidth: indicatorSettings.ema200.lineWidth as any,
        });
      }
      const ema200 = calculateEMA(visibleData, indicatorSettings.ema200.period);
      ema200Ref.current.setData(ema200.map(d => ({ time: d.time as Time, value: d.value })));
    } else if (ema200Ref.current) {
      chart.removeSeries(ema200Ref.current);
      ema200Ref.current = null;
    }

    // RSI ve MACD kendi pane'lerinde (v5 çoklu panel API'si) yaşar
    const rsiPaneIndex = 1;
    const macdPaneIndex = indicators.rsi ? 2 : 1;

    if (indicators.rsi) {
      if (!rsiRef.current) {
        rsiRef.current = chart.addSeries(LineSeries, {
          color: indicatorSettings.rsi.color,
          lineWidth: indicatorSettings.rsi.lineWidth as any,
          title: '',
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
          // Ana fiyat ekseninden ayrı bir fiyat ölçeği: RSI'ın "Logaritmik"
          // görünümden (rightPriceScale) etkilenmemesi için ayrı tutuluyor.
          priceScaleId: 'rsi_scale',
        }, rsiPaneIndex);
        // Fiyat cetveli gibi davransın: sabit 0-100 bandına kilitlenmek yerine
        // görünen veriye göre otomatik ölçeklenir, kullanıcı sürükleyerek
        // yakınlaştırıp kaydırabilir (fiyat ekseniyle aynı davranış).
        chart.priceScale('rsi_scale').applyOptions({
          mode: PriceScaleMode.Normal,
          autoScale: true,
          scaleMargins: { top: 0.1, bottom: 0.1 },
        });

        rsiPriceLinesRef.current.overbought = rsiRef.current.createPriceLine({
          price: indicatorSettings.rsi.overbought,
          color: indicatorSettings.rsi.overboughtColor,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: '',
        });
        rsiPriceLinesRef.current.middle = rsiRef.current.createPriceLine({
          price: 50,
          color: indicatorSettings.rsi.middleColor,
          lineWidth: 1,
          lineStyle: 3,
          axisLabelVisible: true,
          title: '',
        });
        rsiPriceLinesRef.current.oversold = rsiRef.current.createPriceLine({
          price: indicatorSettings.rsi.oversold,
          color: indicatorSettings.rsi.oversoldColor,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: '',
        });
      } else {
        rsiRef.current.applyOptions({
          color: indicatorSettings.rsi.color,
          lineWidth: indicatorSettings.rsi.lineWidth as any,
        });
        rsiPriceLinesRef.current.overbought?.applyOptions({
          price: indicatorSettings.rsi.overbought,
          color: indicatorSettings.rsi.overboughtColor,
        });
        rsiPriceLinesRef.current.middle?.applyOptions({
          color: indicatorSettings.rsi.middleColor,
        });
        rsiPriceLinesRef.current.oversold?.applyOptions({
          price: indicatorSettings.rsi.oversold,
          color: indicatorSettings.rsi.oversoldColor,
        });
      }
      const rsi = calculateRSI(visibleData, indicatorSettings.rsi.period);
      rsiRef.current.setData(rsi.map(d => ({ time: d.time as Time, value: d.value })));
    } else if (rsiRef.current) {
      chart.removeSeries(rsiRef.current);
      rsiRef.current = null;
      rsiPriceLinesRef.current = {};
    }

    if (indicators.macd) {
      if (!macdHistRef.current || !macdLineRef.current || !macdSignalRef.current) {
        // MACD sıfır etrafında salınan bir momentum göstergesidir; ana fiyat
        // ekseniyle (rightPriceScale) aynı ölçeği paylaşırsa "Logaritmik" görünüm
        // bu ekseni de anlamsızca bozar — kendi ayrı ölçeğinde kalmalı.
        macdHistRef.current = chart.addSeries(HistogramSeries, { title: '', lastValueVisible: false, priceLineVisible: false, priceScaleId: 'macd_scale' }, macdPaneIndex);
        macdLineRef.current = chart.addSeries(LineSeries, { color: indicatorSettings.macd.macdColor, lineWidth: indicatorSettings.macd.macdWidth as any, title: '', lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false, priceScaleId: 'macd_scale' }, macdPaneIndex);
        macdSignalRef.current = chart.addSeries(LineSeries, { color: indicatorSettings.macd.signalColor, lineWidth: indicatorSettings.macd.signalWidth as any, title: '', lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false, priceScaleId: 'macd_scale' }, macdPaneIndex);
        chart.priceScale('macd_scale').applyOptions({ mode: PriceScaleMode.Normal });
      } else {
        for (const s of [macdHistRef.current, macdLineRef.current, macdSignalRef.current]) {
          if (s.getPane().paneIndex() !== macdPaneIndex) s.moveToPane(macdPaneIndex);
        }
        macdLineRef.current.applyOptions({
          color: indicatorSettings.macd.macdColor,
          lineWidth: indicatorSettings.macd.macdWidth as any,
        });
        macdSignalRef.current.applyOptions({
          color: indicatorSettings.macd.signalColor,
          lineWidth: indicatorSettings.macd.signalWidth as any,
        });
      }
      const macd = calculateMACD(
        visibleData,
        indicatorSettings.macd.fastPeriod,
        indicatorSettings.macd.slowPeriod,
        indicatorSettings.macd.signalPeriod
      );
      macdHistRef.current.setData(macd.histogram.map(d => ({
        time: d.time as Time,
        value: d.value,
        color: d.value >= 0 ? indicatorSettings.macd.histUpColor : indicatorSettings.macd.histDownColor,
      })));
      macdLineRef.current.setData(macd.macd.map(d => ({ time: d.time as Time, value: d.value })));
      macdSignalRef.current.setData(macd.signal.map(d => ({ time: d.time as Time, value: d.value })));
    } else {
      if (macdHistRef.current) { chart.removeSeries(macdHistRef.current); macdHistRef.current = null; }
      if (macdLineRef.current) { chart.removeSeries(macdLineRef.current); macdLineRef.current = null; }
      if (macdSignalRef.current) { chart.removeSeries(macdSignalRef.current); macdSignalRef.current = null; }
    }

    // Bollinger Bands (BB)
    if (indicators.bb) {
      if (!bbUpperRef.current || !bbMiddleRef.current || !bbLowerRef.current) {
        bbUpperRef.current = chart.addSeries(LineSeries, {
          color: indicatorSettings.bb.upperColor,
          lineWidth: indicatorSettings.bb.upperWidth as any,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
          title: '',
        });
        bbMiddleRef.current = chart.addSeries(LineSeries, {
          color: indicatorSettings.bb.middleColor,
          lineWidth: indicatorSettings.bb.middleWidth as any,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
          title: '',
        });
        bbLowerRef.current = chart.addSeries(LineSeries, {
          color: indicatorSettings.bb.lowerColor,
          lineWidth: indicatorSettings.bb.lowerWidth as any,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
          title: '',
        });
      } else {
        bbUpperRef.current.applyOptions({
          color: indicatorSettings.bb.upperColor,
          lineWidth: indicatorSettings.bb.upperWidth as any,
        });
        bbMiddleRef.current.applyOptions({
          color: indicatorSettings.bb.middleColor,
          lineWidth: indicatorSettings.bb.middleWidth as any,
        });
        bbLowerRef.current.applyOptions({
          color: indicatorSettings.bb.lowerColor,
          lineWidth: indicatorSettings.bb.lowerWidth as any,
        });
      }
      const bb = calculateBollingerBands(visibleData, indicatorSettings.bb.period, indicatorSettings.bb.stdDev);
      bbUpperRef.current.setData(bb.upper.map(d => ({ time: d.time as Time, value: d.value })));
      bbMiddleRef.current.setData(bb.middle.map(d => ({ time: d.time as Time, value: d.value })));
      bbLowerRef.current.setData(bb.lower.map(d => ({ time: d.time as Time, value: d.value })));
    } else {
      if (bbUpperRef.current) { chart.removeSeries(bbUpperRef.current); bbUpperRef.current = null; }
      if (bbMiddleRef.current) { chart.removeSeries(bbMiddleRef.current); bbMiddleRef.current = null; }
      if (bbLowerRef.current) { chart.removeSeries(bbLowerRef.current); bbLowerRef.current = null; }
    }
  }, [visibleData, indicators, indicatorSettings]);



  const latestIndicatorValues = useMemo(() => {
    if (!visibleData || visibleData.length === 0) return {};
    const res: Record<string, any> = {};

    if (indicators.ema20) {
      const ema = calculateEMA(visibleData, indicatorSettings.ema20.period);
      res.ema20 = ema.length > 0 ? ema[ema.length - 1].value : null;
    }
    if (indicators.ema50) {
      const ema = calculateEMA(visibleData, indicatorSettings.ema50.period);
      res.ema50 = ema.length > 0 ? ema[ema.length - 1].value : null;
    }
    if (indicators.ema100) {
      const ema = calculateEMA(visibleData, indicatorSettings.ema100.period);
      res.ema100 = ema.length > 0 ? ema[ema.length - 1].value : null;
    }
    if (indicators.ema200) {
      const ema = calculateEMA(visibleData, indicatorSettings.ema200.period);
      res.ema200 = ema.length > 0 ? ema[ema.length - 1].value : null;
    }
    if (indicators.bb) {
      const bb = calculateBollingerBands(visibleData, indicatorSettings.bb.period, indicatorSettings.bb.stdDev);
      if (bb.upper.length > 0) {
        res.bb = {
          upper: bb.upper[bb.upper.length - 1].value,
          middle: bb.middle[bb.middle.length - 1].value,
          lower: bb.lower[bb.lower.length - 1].value,
        };
      }
    }
    if (indicators.rsi) {
      const rsi = calculateRSI(visibleData, indicatorSettings.rsi.period);
      res.rsi = rsi.length > 0 ? rsi[rsi.length - 1].value : null;
    }
    if (indicators.macd) {
      const macd = calculateMACD(visibleData, indicatorSettings.macd.fastPeriod, indicatorSettings.macd.slowPeriod, indicatorSettings.macd.signalPeriod);
      if (macd.macd.length > 0) {
        res.macd = {
          macd: macd.macd[macd.macd.length - 1].value,
          signal: macd.signal[macd.signal.length - 1].value,
          hist: macd.histogram[macd.histogram.length - 1].value,
        };
      }
    }
    return res;
  }, [visibleData, indicators, indicatorSettings]);


  // --- PANE YERLEŞİMİ ---
  // v5'te RSI/MACD ayrı pane'lerde durur; her pane kendi fiyat cetvelini yönetir.
  // Burada yalnızca pane yükseklik oranları ve hacim overlay marjı ayarlanır.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const panes = chart.panes();
    if (panes.length > 0) panes[0].setStretchFactor(3);
    for (let i = 1; i < panes.length; i++) panes[i].setStretchFactor(1);

    try {
      chart.priceScale('volume_overlay').applyOptions({
        scaleMargins: { top: 0.82, bottom: 0.02 },
      });
    } catch (e) {
      console.warn('Volume price scale error:', e);
    }
  }, [indicators]);


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


  
  return (
    <div className="relative w-full h-full border border-white/[0.06] rounded-xl overflow-hidden bg-[#090d16]">
      {/* Yüzen Kontrol Paneli Araç Çubuğu */}
      <div className="absolute top-2 left-2 right-2 h-12 z-30 flex items-center justify-between bg-[#0a0b0e]/95 border border-white/[0.08] rounded-xl px-3.5 shadow-2xl backdrop-blur-md text-zinc-100">
        {/* Sol Taraf: Logo & Sembol & Sağlayıcı & Zaman Dilimi */}
        <div className="flex items-center gap-3">
          {/* Logo / Başlık */}
          <div className="flex items-center gap-1.5 border-r border-white/[0.06] pr-3 h-5">
            <span
              className="text-xs font-extrabold tracking-[0.14em] font-sans select-none bg-clip-text text-transparent"
              style={{
                backgroundImage: 'linear-gradient(90deg, rgba(42, 123, 155, 1) 0%, rgba(87, 199, 133, 1) 35%, rgba(151, 79, 196, 1) 88%)',
              }}
            >
              REPLAY
            </span>
          </div>

          {/* Sembol / Ticker Girişi ve Arama Butonu */}
          <div className="flex items-center gap-1">
            <button
              onClick={onOpenSearchModal || (() => setIsSearchModalOpen(true))}
              className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.08] hover:border-emerald-500/40 rounded-lg px-2.5 py-1 transition-all group"
              title="Sembol Ara (BIST 100, NASDAQ, Crypto)"
            >
              <Search className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform" />
              <div className="flex items-center gap-1">
                <span className="font-mono text-[9px] text-zinc-500 font-semibold uppercase select-none">Symbol:</span>
                <span className="text-xs font-semibold text-zinc-100 font-mono tracking-tight group-hover:text-emerald-400">
                  {symbol || 'ARA'}
                </span>
              </div>
            </button>

            {/* Quick Watchlist Bookmark Button — reactive via useWatchlistStore */}
            <button
              onClick={() => watchlistStore.toggleSymbol(symbol, provider)}
              className={`p-1.5 rounded-lg border transition-all ${
                isBookmarked
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30 shadow-xs'
                  : 'bg-white/[0.03] border-white/[0.08] text-zinc-500 hover:text-amber-400 hover:bg-white/[0.06]'
              }`}
              title={isBookmarked ? 'İzleme Listesinden Çıkar' : 'İzleme Listesine Ekle'}
            >
              <Bookmark className={`w-3.5 h-3.5 ${isBookmarked ? 'fill-amber-400' : ''}`} />
            </button>
          </div>

          {/* Zaman Dilimi Seçimi */}
          <div className="flex items-center gap-1 bg-white/[0.03] border border-white/[0.08] rounded-lg px-2.5 py-1">
            <span className="font-mono text-[9px] text-zinc-500 font-semibold uppercase select-none">Interval</span>
            <select
              value={timeframe}
              onChange={(e) => handleTimeframeChange(e.target.value)}
              className="bg-transparent border-none outline-none text-xs font-medium text-zinc-200 cursor-pointer focus:ring-0"
            >
              <option value="1m" className="bg-[#0a0b0e] text-zinc-100">1m</option>
              <option value="5m" className="bg-[#0a0b0e] text-zinc-100">5m</option>
              <option value="15m" className="bg-[#0a0b0e] text-zinc-100">15m</option>
              <option value="1h" className="bg-[#0a0b0e] text-zinc-100">1h</option>
              <option value="4h" className="bg-[#0a0b0e] text-zinc-100">4h</option>
              <option value="1d" className="bg-[#0a0b0e] text-zinc-100">1d</option>
              <option value="1w" className="bg-[#0a0b0e] text-zinc-100">1w</option>
              <option value="1mo" className="bg-[#0a0b0e] text-zinc-100">1mo</option>
            </select>
          </div>

          {/* Grafik Tipi Seçimi (Mum / Çizgi) */}
          <div className="flex items-center gap-1 bg-white/[0.03] border border-white/[0.08] rounded-lg px-2.5 py-1">
            <span className="font-mono text-[9px] text-zinc-500 font-semibold uppercase select-none">Grafik</span>
            <select
              value={chartType}
              onChange={(e) => setChartType(e.target.value as 'candlestick' | 'line')}
              className="bg-transparent border-none outline-none text-xs font-medium text-zinc-200 cursor-pointer focus:ring-0"
            >
              <option value="candlestick" className="bg-[#0a0b0e] text-zinc-100">Mum Grafiği</option>
              <option value="line" className="bg-[#0a0b0e] text-zinc-100">Çizgi Grafiği</option>
            </select>
          </div>

          {/* Replay Modu Butonu */}
          <button
            onClick={handleToggleReplayMode}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg border transition-all select-none ${
              replayState.isReplayActive
                ? 'bg-amber-500/15 text-amber-300 border-amber-500/40 shadow-xs'
                : 'bg-white/[0.03] border-white/[0.08] text-zinc-300 hover:bg-white/[0.06] hover:text-zinc-100'
            }`}
            title="Replay Motorunu Aç/Kapat (Kısayol: X)"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${replayState.isReplayActive ? 'text-amber-400' : 'text-emerald-400'}`} />
            <span>Replay</span>
          </button>

          {/* Strateji Sinyalleri Temizleme Rozeti */}
          {evaluateResult && Array.isArray(evaluateResult.signals) && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shadow-xs">
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              <span>Strateji ({evaluateResult.signals.length} Sinyal)</span>
              <button
                onClick={() => strategyStore.clearEvaluateResult()}
                className="ml-1 p-0.5 hover:bg-emerald-500/30 text-emerald-300 hover:text-white rounded transition-colors"
                title="Strateji sinyallerini grafikten kaldır ve grafiği eski temiz haline getir"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Sağ Taraf: Göstergeler popover, Tarih aralığı popover, Log scale, Loading spinner */}
        <div className="flex items-center gap-2">
          {/* Göstergeler Popover */}
          <div className="relative" id="indicators-popover">
            <button
              onClick={() => setIsIndicatorsOpen(!isIndicatorsOpen)}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg border transition-all ${
                isIndicatorsOpen
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 font-semibold'
                  : 'bg-white/[0.03] border-white/[0.08] text-zinc-300 hover:bg-white/[0.06] hover:text-zinc-100'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" />
              Indicators
            </button>

            {isIndicatorsOpen && (
              <div className="absolute right-0 top-9 mt-1 w-56 bg-[#0a0b0e] border border-white/[0.1] rounded-xl p-2.5 shadow-2xl z-50 backdrop-blur-md space-y-0.5 text-zinc-100">
                <div className="font-mono text-[9px] text-zinc-500 font-semibold uppercase px-2 py-1 select-none">
                  Technical Indicators
                </div>
                <div className="w-full h-px bg-white/[0.06] my-1" />
                {Object.keys(indicators).map((key) => {
                  const indKey = key as keyof IndicatorsState;
                  const labels: Record<string, string> = {
                    ema20: `EMA ${indicatorSettings.ema20.period}`,
                    ema50: `EMA ${indicatorSettings.ema50.period}`,
                    ema100: `EMA ${indicatorSettings.ema100.period}`,
                    ema200: `EMA ${indicatorSettings.ema200.period}`,
                    rsi: `RSI (${indicatorSettings.rsi.period})`,
                    macd: `MACD (${indicatorSettings.macd.fastPeriod}, ${indicatorSettings.macd.slowPeriod}, ${indicatorSettings.macd.signalPeriod})`,
                    bb: `Bollinger (${indicatorSettings.bb.period}, ${indicatorSettings.bb.stdDev})`,
                  };
                  const dotColors: Record<string, string> = {
                    ema20: indicatorSettings.ema20.color,
                    ema50: indicatorSettings.ema50.color,
                    ema100: indicatorSettings.ema100.color,
                    ema200: indicatorSettings.ema200.color,
                    rsi: indicatorSettings.rsi.color,
                    macd: indicatorSettings.macd.macdColor,
                    bb: indicatorSettings.bb.upperColor,
                  };
                  return (
                    <div key={indKey}>
                      <label
                        className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.04] cursor-pointer select-none"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${indicators[indKey] ? 'animate-pulse' : ''}`}
                            style={{ backgroundColor: dotColors[indKey] }}
                          />
                          <span className="text-xs text-zinc-200 font-medium">{labels[indKey]}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {indicators[indKey] && (
                            <button
                              type="button"
                              title={`${labels[indKey]} ayarları`}
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditingIndicator(indKey as keyof IndicatorSettingsMap); }}
                              className="p-0.5 rounded transition-colors text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.08]"
                            >
                              <Settings2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <input
                            type="checkbox"
                            checked={indicators[indKey]}
                            onChange={() => onToggleIndicator(indKey)}
                            className="w-3.5 h-3.5 accent-emerald-400 rounded border-white/[0.1] cursor-pointer bg-white/[0.03]"
                          />
                        </div>
                      </label>
                    </div>
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
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 font-semibold'
                  : 'bg-white/[0.03] border-white/[0.08] text-zinc-300 hover:bg-white/[0.06] hover:text-zinc-100'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 text-emerald-400" />
              {start || end ? `${start || '...'} to ${end || '...'}` : 'Dates'}
            </button>

            {isDatesOpen && (
              <div className="absolute right-0 top-9 mt-1 w-64 bg-[#0a0b0e] border border-white/[0.1] rounded-xl p-3 shadow-2xl z-50 backdrop-blur-md space-y-3 text-zinc-100">
                <div className="font-mono text-[9px] text-zinc-500 font-semibold uppercase pb-1.5 border-b border-white/[0.06] select-none">
                  Select Date Range
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-1">
                    <span className="font-mono text-[9px] text-zinc-400 font-semibold uppercase select-none">Start Date</span>
                    <input
                      type="date"
                      value={start}
                      onChange={(e) => setStart(e.target.value)}
                      className="bg-white/[0.03] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500/50 transition"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="font-mono text-[9px] text-zinc-400 font-semibold uppercase select-none">End Date</span>
                    <input
                      type="date"
                      value={end}
                      onChange={(e) => setEnd(e.target.value)}
                      className="bg-white/[0.03] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500/50 transition"
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

        {/* Göstergeler İçin Canlı Lejant ve Hızlı Ayarlar (TradingView Tarzı) — çizim
            araç çubuğunun altında, aynı sütunda; üst üste binmesin diye ayrı bir
            absolute katman değil, bu sütunun bir parçası. */}
        {(() => {
          const activeLegendKeys = (['ema20', 'ema50', 'ema100', 'ema200', 'bb'] as const).filter((key) => indicators[key]);
          const shouldCollapse = activeLegendKeys.length > 2;
          const showItems = !shouldCollapse || isLegendExpanded;

          return (
            <div className="flex flex-col gap-1.5 pointer-events-auto items-start">
              {shouldCollapse && (
                <button
                  type="button"
                  title={isLegendExpanded ? 'Göstergeleri Gizle' : 'Göstergeleri Göster'}
                  onClick={() => setIsLegendExpanded((v) => !v)}
                  className="flex items-center justify-center w-5 h-5 rounded-md bg-[#0a0b0e]/90 border border-white/[0.08] text-zinc-400 hover:text-emerald-400 hover:border-emerald-500/30 transition-colors shadow-md backdrop-blur-md cursor-pointer"
                >
                  <ChevronRight className={`w-3 h-3 transition-transform ${isLegendExpanded ? 'rotate-90' : ''}`} />
                </button>
              )}
              {showItems &&
                activeLegendKeys.map((key) => {
                  const conf = indicatorSettings[key] as any;
                  const val = latestIndicatorValues[key];
                  const label = key === 'bb' ? `BB (${conf.period}, ${conf.stdDev})` : `EMA ${conf.period}`;
                  const color = key === 'bb' ? conf.upperColor : conf.color;

                  return (
                    <div
                      key={key}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0a0b0e]/90 border border-white/[0.08] text-[11px] shadow-md backdrop-blur-md select-none text-zinc-100"
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="font-medium text-zinc-200">{label}</span>
                      {val !== undefined && val !== null && (
                        <span className="font-mono text-zinc-400 text-[10px]">
                          {typeof val === 'number' ? formatPriceLabel(val) : formatPriceLabel(val.upper)}
                        </span>
                      )}
                      <button
                        type="button"
                        title={`${label} Ayarları`}
                        onClick={() => setEditingIndicator(key)}
                        className="p-0.5 text-zinc-400 hover:text-emerald-400 transition-colors cursor-pointer"
                      >
                        <Settings2 className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        title="Kapat"
                        onClick={() => onToggleIndicator(key)}
                        className="p-0.5 text-zinc-500 hover:text-red-400 transition-colors ml-0.5 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
            </div>
          );
        })()}
      </div>

      {/* Durum Gösterge Katmanları */}
      {loading && (
        <div className="absolute inset-0 bg-[#0a0b0e]/85 backdrop-blur-xs z-20 flex flex-col items-center justify-center gap-3 text-zinc-100">
          <Loader2 className="w-10 h-10 text-emerald-400 animate-spin" />
          <span className="text-zinc-300 text-sm font-medium">Piyasa verileri yükleniyor...</span>
        </div>
      )}

      {error && !loading && (
        <div className="absolute inset-0 bg-[#0a0b0e]/95 z-20 flex items-center justify-center p-4 text-zinc-100">
          <div className="flex flex-col items-center text-center max-w-md p-6 space-y-3">
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-full text-red-400">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-red-300">Veri Yüklenemedi</h3>
            <p className="text-zinc-300 text-sm leading-relaxed">{error}</p>
            <p className="text-zinc-500 text-xs">
              Lütfen İnternet bağlantınızı kontrol edin veya yukarıdaki sembol aramasından başka bir parite seçin.
            </p>
          </div>
        </div>
      )}

      {!error && data.length === 0 && !loading && (
        <div className="absolute inset-0 bg-[#0a0b0e] z-20 flex items-center justify-center p-4 text-zinc-100">
          <div className="flex flex-col items-center text-center max-w-sm p-6 space-y-3">
            <div className="p-3 bg-white/[0.03] border border-white/[0.08] rounded-full text-zinc-400">
              <BarChart3 className="w-8 h-8 text-emerald-400" />
            </div>
            <h3 className="text-lg font-semibold text-zinc-100">Grafik Yüklenmeye Hazır</h3>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Yukarıdaki kontrol panelinden sembol (örn: BTCUSDT, THYAO, AAPL) veya zaman dilimi seçin.
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

      {/* Manuel İşlem Paneli (Faz 4) — replay sırasında pozisyon aç/kapat */}
      {replayState.isReplayActive && !replayState.isSelectingCutoff && data.length > 0 && (
        <div className="absolute top-16 right-3 z-30">
          <ReplayTradePanel
            symbol={symbol}
            provider={provider}
            timeframe={timeframe}
            currentPrice={
              data[Math.min(replayState.currentIndex ?? data.length - 1, data.length - 1)]?.close
            }
            currentBarIndex={replayState.currentIndex}
            currentBarTime={
              data[Math.min(replayState.currentIndex ?? data.length - 1, data.length - 1)]?.time as number
            }
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

      {/* Zaman dilimi değişimi engellendiğinde uyarı — hedef tarih yeni
          çözünürlükte mevcut olmadığında gösterilir. */}
      {timeframeWarning && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 z-40 max-w-md bg-amber-500/95 text-slate-950 text-xs px-4 py-2 rounded-xl shadow-2xl border border-amber-300/60 backdrop-blur-md flex items-start gap-2 select-none">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-px" />
          <span className="font-semibold leading-snug">{timeframeWarning}</span>
          <button
            type="button"
            onClick={() => setTimeframeWarning(null)}
            title="Kapat"
            className="ml-1 flex-shrink-0 hover:bg-slate-950/10 rounded p-0.5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
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

      {/* (+) Butonunun Üzerindeyken Fiyat Çizgisinin Kaybolmasını Engelleyen Yatay Çizgi Overlay'i */}
      {(isHoveringPlusButton || plusMenu !== null) && currentCrosshairYRef.current !== null && (
        <div
          style={{ top: `${currentCrosshairYRef.current}px` }}
          className="absolute left-0 right-[56px] border-b border-dashed border-slate-400/80 z-20 pointer-events-none"
        />
      )}

      {/* Fiyat Göstergesi Yanındaki (+) Butonu - Doğrudan DOM Ref ile 0ms Gecikmesiz Konumlandırma */}
      <button
        ref={plusButtonRef}
        onMouseEnter={() => {
          isHoveringPlusButtonRef.current = true;
          setIsHoveringPlusButton(true);
        }}
        onMouseLeave={() => {
          isHoveringPlusButtonRef.current = false;
          setIsHoveringPlusButton(false);
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
          className="absolute inset-0 z-[35] bg-transparent"
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
          id="plus-menu-popover"
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

      <div ref={chartContainerRef} className="absolute inset-0 w-full h-full z-10" />

      {/* Alt Panel Gösterge Ayarları ve Lejantları (RSI & MACD) */}
      {(indicators.rsi || indicators.macd) && (
        <div className="absolute bottom-3 left-3 z-20 flex flex-wrap gap-2 pointer-events-auto">
          {indicators.rsi && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0a0b0e]/90 border border-white/[0.08] text-xs shadow-md backdrop-blur-md select-none text-zinc-100">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: indicatorSettings.rsi.color }} />
              <span className="font-medium text-zinc-200">
                RSI ({indicatorSettings.rsi.period}, {indicatorSettings.rsi.overbought}, {indicatorSettings.rsi.oversold})
              </span>
              {latestIndicatorValues.rsi !== undefined && latestIndicatorValues.rsi !== null && (
                <span className="font-mono font-bold text-emerald-400 ml-1">
                  {latestIndicatorValues.rsi.toFixed(2)}
                </span>
              )}
              <button
                type="button"
                title="RSI Ayarlarını Aç"
                onClick={() => setEditingIndicator('rsi')}
                className="p-1 rounded hover:bg-white/[0.08] text-zinc-400 hover:text-emerald-400 transition-colors ml-1 cursor-pointer"
              >
                <Settings2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                title="RSI Kapat"
                onClick={() => onToggleIndicator('rsi')}
                className="p-1 rounded hover:bg-white/[0.08] text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {indicators.macd && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0a0b0e]/90 border border-white/[0.08] text-xs shadow-md backdrop-blur-md select-none text-zinc-100">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: indicatorSettings.macd.macdColor }} />
              <span className="font-medium text-zinc-200">
                MACD ({indicatorSettings.macd.fastPeriod}, {indicatorSettings.macd.slowPeriod}, {indicatorSettings.macd.signalPeriod})
              </span>
              {latestIndicatorValues.macd && (
                <span className="font-mono text-[11px] text-zinc-300 ml-1 flex items-center gap-1">
                  <span className="text-emerald-400">{latestIndicatorValues.macd.macd.toFixed(2)}</span>
                  <span className="text-amber-400">{latestIndicatorValues.macd.signal.toFixed(2)}</span>
                </span>
              )}
              <button
                type="button"
                title="MACD Ayarlarını Aç"
                onClick={() => setEditingIndicator('macd')}
                className="p-1 rounded hover:bg-white/[0.08] text-zinc-400 hover:text-emerald-400 transition-colors ml-1 cursor-pointer"
              >
                <Settings2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                title="MACD Kapat"
                onClick={() => onToggleIndicator('macd')}
                className="p-1 rounded hover:bg-white/[0.08] text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Gösterge Ayarları Modal Penceresi */}
      <IndicatorSettingsModal
        isOpen={!!editingIndicator}
        indicatorKey={editingIndicator}
        onClose={() => setEditingIndicator(null)}
      />

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


