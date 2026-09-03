/**
 * StrategyPage — Strateji yönetim sayfası.
 *
 * Sol panel: strateji listesi, sağ panel: builder/editor.
 * Değerlendirme sonuçları alt panelde gösterilir.
 */

import { useEffect, useState, useRef } from 'react';
import {
  Play,
  ArrowUpRight,
  ArrowDownRight,
  ArrowLeft,
  Zap,
  Layers,
  BarChart3,
  GripHorizontal,
  Download,
} from 'lucide-react';
import StrategyList from '../strategy/StrategyList';
import StrategyBuilder from '../strategy/StrategyBuilder';
import BatchScannerTab from '../strategy/BatchScannerTab';
import { useStrategyStore, strategyStore } from '../store/strategyStore';
import { replayStore } from '../store/replayStore';
import type {
  Strategy,
  EvaluateRequest,
  EvaluateResponse,
  PatternRegion,
  SingleEvaluationLogItem,
  Operand,
  ConditionGroup,
} from '../types/strategy';
import { csvNumber, csvTimestamp, downloadCsv } from '../utils/csv';
import { TIMEFRAMES, isConditionGroup } from '../types/strategy';
import type { IndicatorsState } from '../charts/IndicatorToolbar';

interface StrategyPageProps {
  onSelectTab?: (tab: 'chart' | 'replay' | 'strategy') => void;
  setSymbol?: (s: string) => void;
  setProvider?: (p: string) => void;
  setTimeframe?: (tf: string) => void;
  onEnableIndicators?: (keys: (keyof IndicatorsState)[]) => void;
  currentSymbol?: string;
  currentProvider?: string;
  currentTimeframe?: string;
}

/**
 * Tanımsız metrikleri "—" olarak gösterir.
 *
 * `performance_report.py` tanımsız oranları (ör. hiç zarar eden işlem yokken
 * Profit Factor) bilinçli olarak `null` döndürüyor — 0 yazmak "kötü" gibi
 * okunurdu.
 */
function formatMetric(value: number | null | undefined, suffix = ''): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${value.toFixed(2)}${suffix}`;
}

/**
 * Test sonucundaki sinyalleri CSV olarak indirir.
 *
 * Hem sinyalin ÜRETİLDİĞİ mum hem de emrin GERÇEKLEŞTİĞİ mum yazılır: ikisi
 * `bar_delay` yüzünden farklı olabiliyor ve dışarıda analiz eden biri için
 * bu ayrım kritik.
 */
function exportSignalsCsv(result: EvaluateResponse): void {
  const rows = result.signals.map((signal) => [
    new Date(signal.timestamp * 1000).toISOString(),
    signal.signal_timestamp ? new Date(signal.signal_timestamp * 1000).toISOString() : '',
    signal.signal,
    csvNumber(signal.price, 10),
    csvNumber(signal.entry_price, 10),
    csvNumber(signal.pnl_percent),
    signal.conditions_met.join(' | '),
  ]);

  downloadCsv(
    `${result.strategy_name}_${result.symbol}_${result.timeframe}_${csvTimestamp()}`,
    [
      'Gerçekleşme Zamanı',
      'Sinyal Zamanı',
      'Sinyal',
      'Fiyat',
      'Giriş Fiyatı',
      'Kar/Zarar (%)',
      'Karşılanan Koşullar',
    ],
    rows,
  );
}

export default function StrategyPage({
  onSelectTab,
  setSymbol,
  setProvider,
  setTimeframe,
  onEnableIndicators,
  currentSymbol,
  currentProvider,
  currentTimeframe,
}: StrategyPageProps = {}) {
  const { strategies, activeStrategy, indicators, evaluateResult, isLoading, isEvaluating, error } =
    useStrategyStore();

  const [mode, setMode] = useState<'list' | 'edit' | 'new'>('list');
  const [activeSubTab, setActiveSubTab] = useState<'builder' | 'batch_scanner'>('builder');


  // Evaluate form state — varsayılan olarak grafikte seçili sembolden başlar
  const [evalProvider, setEvalProvider] = useState(currentProvider || 'binance');
  const [evalSymbol, setEvalSymbol] = useState(currentSymbol || 'BTCUSDT');
  const [evalTimeframe, setEvalTimeframe] = useState(currentTimeframe || '1d');
  const [evalStart, setEvalStart] = useState('');
  const [evalEnd, setEvalEnd] = useState('');
  const [evalLimitBars, setEvalLimitBars] = useState<number>(1000);
  const [evalAllowShort, setEvalAllowShort] = useState<boolean>(false);
  const [showEvalPanel, setShowEvalPanel] = useState(false);
  const [evalPanelHeight, setEvalPanelHeight] = useState<number>(340);

  const isDraggingRef = useRef(false);
  const dragStartYRef = useRef(0);
  const dragStartHeightRef = useRef(0);

  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    dragStartYRef.current = e.clientY;
    dragStartHeightRef.current = evalPanelHeight;

    const onMouseMove = (me: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const deltaY = dragStartYRef.current - me.clientY;
      const newHeight = Math.max(100, Math.min(window.innerHeight - 150, dragStartHeightRef.current + deltaY));
      setEvalPanelHeight(newHeight);
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Grafik ekranında seçilen sembol değiştikçe strateji alanındaki sembolü güncele
  useEffect(() => {
    if (currentSymbol) setEvalSymbol(currentSymbol);
    if (currentProvider) setEvalProvider(currentProvider);
  }, [currentSymbol, currentProvider]);

  useEffect(() => {
    if (currentTimeframe) setEvalTimeframe(currentTimeframe);
  }, [currentTimeframe]);

  // İlk yükleme: strateji listesi ve indikatörleri çek (otomatik seçim yapma, başlangıçta hiçbir strateji seçili olmasın)
  useEffect(() => {
    strategyStore.setActiveStrategy(null);
    setMode('list');
    strategyStore.fetchStrategies();
    strategyStore.fetchIndicators();
  }, []);

  useEffect(() => {
    if (activeStrategy) {
      setEvalAllowShort(Boolean(activeStrategy.allow_short));
    }
  }, [activeStrategy]);

  const handleSelectStrategy = (strategy: Strategy) => {
    strategyStore.setActiveStrategy(strategy);
    setMode('edit');
  };

  const handleNewStrategy = () => {
    strategyStore.setActiveStrategy(null);
    setMode('new');
  };

  const handleSaved = (strategy: Strategy) => {
    strategyStore.setActiveStrategy(strategy);
    setMode('edit');
    strategyStore.fetchStrategies();
  };

  const handleCancel = () => {
    setMode('list');
  };

  /**
   * Test geçmişinden bir kayıt seçildi: değerlendirme formunu o testin
   * parametreleriyle geri yükle ve paneli aç — sonuç yeni çalıştırılmış gibi görünsün.
   */
  const handleHistorySelect = (item: SingleEvaluationLogItem) => {
    const req = item.request;
    setEvalSymbol(req?.symbol ?? item.symbol);
    setEvalProvider(req?.provider ?? item.provider);
    setEvalTimeframe(req?.timeframe ?? item.timeframe);
    setEvalStart(req?.start ?? '');
    setEvalEnd(req?.end ?? '');
    if (req?.limit_bars != null) setEvalLimitBars(req.limit_bars);
    if (req?.allow_short != null) setEvalAllowShort(req.allow_short);
    setShowEvalPanel(true);
  };

  const handleEvaluate = async () => {
    if (!activeStrategy) return;

    const provider = evalProvider;

    const request: EvaluateRequest = {
      symbol: evalSymbol,
      provider: provider,
      timeframe: evalTimeframe,
      start: evalStart || undefined,
      end: evalEnd || undefined,
      limit_bars: evalLimitBars,
      allow_short: evalAllowShort,
    };

    await strategyStore.evaluateStrategy(activeStrategy.id, request);
    setShowEvalPanel(true);
  };

  const handleNavigateToChartWithSymbol = async (
    targetSymbol: string,
    targetProvider?: string,
    targetTimeframe?: string,
    overrides?: { limitBars?: number; allowShort?: boolean; start?: string; end?: string }
  ) => {
    const prov = targetProvider || evalProvider;
    const tf = targetTimeframe || evalTimeframe;

    if (setSymbol) setSymbol(targetSymbol);
    if (setProvider) setProvider(prov);
    if (setTimeframe) setTimeframe(tf);

    // 1. Stratejiyi bu sembol için de tekli evaluate et (CandleChart üzerinde BUY/SELL sinyal oklarının görünmesi için)
    if (activeStrategy) {
      const request: EvaluateRequest = {
        symbol: targetSymbol,
        provider: prov,
        timeframe: tf,
        start: overrides?.start || undefined,
        end: overrides?.end || undefined,
        limit_bars: overrides?.limitBars ?? 1000,
        allow_short: overrides?.allowShort ?? Boolean(activeStrategy.allow_short),
      };
      await strategyStore.evaluateStrategy(activeStrategy.id, request);

      // 2. Stratejide kullanılan indikatörleri otomatik olarak grafik üzerinde aktif et
      if (onEnableIndicators) {
        const keysToEnable: (keyof IndicatorsState)[] = [];
        const checkOperand = (op?: Operand) => {
          if (!op || op.type !== 'indicator') return;
          const name = String(op.name || '').toUpperCase();
          const period = Number(op.period) || 20;

          if (name === 'RSI') keysToEnable.push('rsi');
          else if (name === 'MACD') keysToEnable.push('macd');
          else if (name === 'EMA' || name === 'SMA') {
            if (period <= 30) keysToEnable.push('ema20');
            else if (period <= 75) keysToEnable.push('ema50');
            else if (period <= 150) keysToEnable.push('ema100');
            else keysToEnable.push('ema200');
          } else if (name.includes('BOLLINGER') || name === 'BB' || name.includes('BAND')) {
            keysToEnable.push('bb');
          }
        };

        // Alt gruplara da iner: iç içe bir grupta geçen gösterge aksi halde
        // grafikte otomatik açılmazdı (backend'deki iter_operands'ın karşılığı).
        const checkGroup = (group?: ConditionGroup) => {
          if (!group || !Array.isArray(group.conditions)) return;
          group.conditions.forEach((item) => {
            if (isConditionGroup(item)) {
              checkGroup(item);
              return;
            }
            checkOperand(item.left);
            checkOperand(item.right);
            checkOperand(item.right2);
          });
        };

        checkGroup(activeStrategy.entry_rules);
        checkGroup(activeStrategy.exit_rules);
        if (Array.isArray(activeStrategy.timeframe_filters)) {
          activeStrategy.timeframe_filters.forEach((tfItem) => checkGroup(tfItem));
        }

        if (keysToEnable.length > 0) {
          onEnableIndicators(keysToEnable);
        }
      }
    }

    if (onSelectTab) onSelectTab('chart');
  };

  /**
   * Bulunan bir örüntü eşleşmesine git (Faz 3.5).
   *
   * Replay imlecini o mumun üstüne koyar ve replay sekmesine geçer: kullanıcı
   * eşleşmeyi SONRASINI görmeden inceler. Örüntü aramanın bu üründeki asıl
   * değeri bu — bulunan yerler manuel backtest egzersizine dönüşür.
   *
   * `targetTimestamp` yazmak yeterli: App.tsx konuma çapalı pencereyi çekiyor,
   * CandleChart da yüklenen veride o zaman damgasını bulup currentIndex ve
   * cutoffIndex'i oraya hizalıyor.
   */
  const handleJumpToRegion = (region: PatternRegion) => {
    const provider = evalProvider;

    if (setSymbol) setSymbol(evalSymbol);
    if (setProvider) setProvider(provider);
    if (setTimeframe) setTimeframe(evalTimeframe);

    replayStore.setState({
      isReplayActive: true,
      targetTimestamp: region.start_time,
      currentIndex: null,
      cutoffIndex: null,
      isPlaying: false,
    });

    if (onSelectTab) onSelectTab('replay');
  };

  const handleNavigateToChart = () => {
    handleNavigateToChartWithSymbol(evalSymbol, evalProvider, evalTimeframe, {
      limitBars: evalLimitBars,
      allowShort: evalAllowShort,
      start: evalStart,
      end: evalEnd,
    });
  };


  const formatTimestamp = (ts: number): string => {
    try {
      return new Date(ts * 1000).toLocaleDateString('tr-TR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return String(ts);
    }
  };

  /**
   * Sağ panelde gösterilecek bir şey var mı?
   *
   * Dar ekranda liste ve düzenleyici yan yana sığmıyor (288px'lik liste,
   * 375px'lik bir telefonda içeriğe ~46px bırakıyordu), bu yüzden ikisi
   * ana-detay olarak sırayla gösterilir: seçim yokken liste, seçim varken
   * düzenleyici. `lg`den itibaren ikisi yine yan yana.
   */
  const isDetailOpen = !(mode === 'list' && !activeStrategy);

  const handleBackToList = () => {
    strategyStore.setActiveStrategy(null);
    setMode('list');
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-canvas">
      {/* Ana İçerik */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Sol Panel — Strateji Listesi */}
        <div
          className={`${
            isDetailOpen ? 'hidden' : 'flex'
          } w-full min-h-0 flex-col overflow-hidden lg:flex lg:w-72 lg:flex-shrink-0 lg:border-r lg:border-line`}
        >
          <StrategyList
            strategies={strategies}
            activeStrategyId={activeStrategy?.id || null}
            onSelect={handleSelectStrategy}
            onNew={handleNewStrategy}
            isLoading={isLoading}
          />
        </div>

        {/* Sağ İçerik — Builder / Editor / Result */}
        <div
          className={`${
            isDetailOpen ? 'flex' : 'hidden'
          } min-h-0 flex-1 flex-col overflow-hidden bg-canvas lg:flex`}
        >
          {/* Listeye dön — dar ekranda liste gizli olduğu için tek çıkış yolu.
              Masaüstünde liste zaten solda duruyor, bu şerit orada yok. */}
          {isDetailOpen && (
            <button
              onClick={handleBackToList}
              className="flex flex-shrink-0 items-center gap-2 border-b border-line bg-surface px-3 py-2.5 text-left text-sm text-content transition-colors ease-out hover:bg-surface-hover lg:hidden"
            >
              <ArrowLeft className="h-4 w-4 shrink-0 text-content-muted" strokeWidth={1.75} />
              <span className="truncate">{activeStrategy?.name ?? 'Yeni strateji'}</span>
            </button>
          )}

          {mode === 'list' && !activeStrategy ? (
            /* Boş durum. Sola dayalı ve ikon karesiz: ortalanmış rozet +
               başlık + buton kalıbı her boş ekranı birbirine benzetiyordu.
               Hiç stratejisi olmayan biri "yeni oluştur" demeden önce bir
               stratejinin ne olduğunu bilmeli — metin onu anlatıyor. */
            <div className="flex flex-1 items-center justify-center p-8">
              <div className="max-w-[420px]">
                <h2 className="text-xl text-content-strong">
                  {strategies.length > 0 ? 'Bir strateji seçin' : 'Henüz stratejiniz yok'}
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-content-muted">
                  {strategies.length > 0
                    ? 'Soldaki listeden bir stratejiye tıklayın; kurallarını düzenleyebilir, tek sembolde test edebilir veya tüm izleme listenizde tarayabilirsiniz.'
                    : 'Bir strateji, giriş ve çıkış koşullarından oluşan bir kural ağacıdır — kod değil. Örneğin “RSI 30’u yukarı keserse ve fiyat EMA200 üzerindeyse al”. Kaydettikten sonra aynı kuralı geçmiş veride test edebilir ve tüm listenizde tarayabilirsiniz.'}
                </p>
                <button
                  onClick={handleNewStrategy}
                  className="mt-6 inline-flex items-center gap-2 rounded-md bg-accent-400 px-4 py-2 text-sm font-medium text-ink-950 transition-colors ease-out hover:bg-accent-300"
                >
                  <Zap className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Yeni strateji oluştur
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {/* Alt Sekmeler Barı (Kurallar / Çoklu Sembol Taraması) */}
              {/* Alt sekmeler. Kenarlıklı hap yerine alt çizgi göstergesi:
                  standart sekme davranışı, daha az gürültü ve aktif olanın
                  hangi içeriğe bağlı olduğu net. */}
              {mode === 'edit' && activeStrategy && (
                <div
                  role="tablist"
                  className="flex flex-shrink-0 items-center gap-5 border-b border-line bg-surface px-4"
                >
                  {([
                    ['builder', 'Kurallar & test', Layers],
                    ['batch_scanner', 'Toplu tarama', BarChart3],
                  ] as const).map(([id, label, Icon]) => {
                    const isActive = activeSubTab === id;
                    return (
                      <button
                        key={id}
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => setActiveSubTab(id)}
                        className={`-mb-px flex items-center gap-2 border-b-2 py-2.5 text-sm transition-colors ease-out ${
                          isActive
                            ? 'border-accent-400 text-content-strong'
                            : 'border-transparent text-content-muted hover:text-content'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}

              {mode === 'edit' && activeStrategy && (
                <>
                  {/* Çoklu Sembol Taraması (Arka planda çalışmaya devam etmesi için DOM'da saklanır) */}
                  <div
                    className={
                      activeSubTab === 'batch_scanner'
                        ? 'flex-1 min-h-0 overflow-hidden flex flex-col'
                        : 'hidden'
                    }
                  >
                    <BatchScannerTab
                      strategy={activeStrategy}
                      onSelectSymbolAndShowChart={(sym, prov, tf, limitBars) => {
                        handleNavigateToChartWithSymbol(sym, prov, tf, { limitBars });
                      }}
                    />
                  </div>

                  {/* Builder */}
                  <div
                    className={
                      activeSubTab === 'builder'
                        ? 'flex-1 min-h-0 overflow-hidden flex flex-col'
                        : 'hidden'
                    }
                  >
                    <StrategyBuilder
                      strategy={activeStrategy}
                      indicators={indicators}
                      onSaved={handleSaved}
                      onCancel={handleCancel}
                      onHistorySelect={handleHistorySelect}
                      patternSearchContext={{
                        symbol: evalSymbol,
                        provider: evalProvider,
                        timeframe: evalTimeframe,
                        onJumpToRegion: handleJumpToRegion,
                      }}
                    />
                  </div>
                </>
              )}

              {mode === 'new' && (
                <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                  <StrategyBuilder
                    strategy={null}
                    indicators={indicators}
                    onSaved={handleSaved}
                    onCancel={handleCancel}
                    patternSearchContext={{
                      symbol: evalSymbol,
                      provider: evalProvider,
                      timeframe: evalTimeframe,
                      onJumpToRegion: handleJumpToRegion,
                    }}
                  />
                </div>
              )}



              {/* Değerlendirme Paneli (Sadece Builder sekmesindeyken gösterilir) */}
              {activeSubTab === 'builder' && mode === 'edit' && activeStrategy && (
                <>
                  {/* Sürükle-Bırak Ayırıcı Çizgi (Terminal Paneli Ayırıcı).
                      Fareyle sürüklenir; dokunmatikte hem tutamak çok ince hem
                      de panel orada sabit yükseklikle değil, içeriğine göre
                      ölçülüyor — bu yüzden dar ekranda gizli. */}
                  <div
                    onMouseDown={handleMouseDownResize}
                    onDoubleClick={() => setEvalPanelHeight(340)}
                    className="group relative z-10 hidden h-2.5 flex-shrink-0 cursor-row-resize select-none items-center justify-center border-y border-line bg-canvas transition-colors ease-out hover:bg-surface-hover lg:flex"
                    title="Yukarı / aşağı sürükleyerek panel boyutunu ayarlayın (çift tık: varsayılan)"
                  >
                    <GripHorizontal
                      className="h-3 w-3 text-content-faint transition-colors ease-out group-hover:text-content-muted"
                      strokeWidth={1.75}
                    />
                  </div>

                  {/* Değerlendirme Alt Paneli.
                      Yükseklik satır içi `style` yerine CSS değişkeniyle:
                      satır içi değer sınıfları ezerdi ve sürüklenerek
                      ayarlanmış masaüstü yüksekliği telefonda da dayatılırdı.
                      Dar ekranda panel içeriğine göre büyür, ekranın %60'ında
                      durur — altındaki kurallar bölümü tamamen kapanmasın. */}
                  <div
                    style={{ ['--eval-h' as string]: `${evalPanelHeight}px` }}
                    className="flex min-h-0 max-h-[60%] flex-shrink-0 flex-col border-t border-line bg-surface lg:max-h-none lg:h-[var(--eval-h)] lg:border-t-0"
                  >
                    {/* Değerlendirme formu.
                        Yedi kontrolün de görünür etiketi var. Öncesinde
                        anlamları yalnızca `title` ipucundaydı — fareyle
                        beklemeden hangi kutunun ne olduğu anlaşılmıyordu ve
                        klavyeyle gezen birine hiç ulaşmıyordu. */}
                    <div className="flex flex-shrink-0 flex-wrap items-end gap-x-3 gap-y-2.5 border-b border-line-subtle px-4 py-2.5">
                      <label className="flex flex-col gap-1">
                        <span className="text-2xs text-content-faint">Sembol</span>
                        <input
                          type="text"
                          value={evalSymbol}
                          onChange={(e) => {
                            const newSym = e.target.value.toUpperCase();
                            setEvalSymbol(newSym);
                            if (setSymbol && newSym.trim().length >= 2) setSymbol(newSym);
                          }}
                          placeholder="BTCUSDT"
                          className="w-28 rounded-md border border-line-strong bg-surface-raised px-2.5 py-1.5 font-mono text-sm text-content-strong outline-none transition-colors ease-out placeholder:text-content-faint hover:border-ink-500 focus:border-accent-500"
                        />
                      </label>

                      <label className="flex flex-col gap-1">
                        <span className="text-2xs text-content-faint">Piyasa</span>
                        <select value={evalProvider} onChange={(e) => {
                          setEvalProvider(e.target.value);
                          setProvider?.(e.target.value);
                        }} className="rounded-md border border-line-strong bg-surface-raised px-2 py-1.5 text-sm text-content">
                          <option value="binance">Kripto</option>
                          <option value="bist">BIST</option>
                          <option value="nasdaq">NASDAQ</option>
                          <option value="forex">Forex</option>
                        </select>
                      </label>

                      <label className="flex flex-col gap-1">
                        <span className="text-2xs text-content-faint">Zaman dilimi</span>
                        <select
                          value={evalTimeframe}
                          onChange={(e) => {
                            setEvalTimeframe(e.target.value);
                            if (setTimeframe) setTimeframe(e.target.value);
                          }}
                          className="rounded-md border border-line-strong bg-surface-raised px-2 py-1.5 text-sm text-content outline-none transition-colors ease-out hover:border-ink-500 focus:border-accent-500"
                        >
                          {TIMEFRAMES.map((tf) => (
                            <option key={tf} value={tf}>
                              {tf}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="flex flex-col gap-1">
                        <span className="text-2xs text-content-faint">Test aralığı</span>
                        <select
                          value={evalLimitBars}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setEvalLimitBars(isNaN(val) ? 1000 : val);
                          }}
                          className="rounded-md border border-line-strong bg-surface-raised px-2 py-1.5 text-sm text-content outline-none transition-colors ease-out hover:border-ink-500 focus:border-accent-500"
                        >
                          <option value={1000}>Son 1000 mum</option>
                          <option value={365}>Son 365 mum</option>
                          <option value={100}>Son 100 mum</option>
                          <option value={0}>Tüm veri</option>
                        </select>
                      </label>

                      {/* Emoji kaldırıldı: seçeneğin anlamı zaten metinde.
                          Renkli kenarlık da kaldırıldı — yeşil "sadece long"
                          demek değil, kâr demek. */}
                      <label className="flex flex-col gap-1">
                        <span className="text-2xs text-content-faint">Pozisyon yönü</span>
                        <select
                          value={evalAllowShort ? 'short' : 'long'}
                          onChange={(e) => setEvalAllowShort(e.target.value === 'short')}
                          className="rounded-md border border-line-strong bg-surface-raised px-2 py-1.5 text-sm text-content outline-none transition-colors ease-out hover:border-ink-500 focus:border-accent-500"
                        >
                          <option value="long">Sadece long — sat ve nakde geç</option>
                          <option value="short">Long &amp; short — ters pozisyona dön</option>
                        </select>
                      </label>

                      <label className="flex flex-col gap-1">
                        <span className="text-2xs text-content-faint">Başlangıç</span>
                        <input
                          type="date"
                          value={evalStart}
                          onChange={(e) => setEvalStart(e.target.value)}
                          className="rounded-md border border-line-strong bg-surface-raised px-2 py-1.5 text-sm text-content outline-none transition-colors ease-out hover:border-ink-500 focus:border-accent-500"
                        />
                      </label>

                      <label className="flex flex-col gap-1">
                        <span className="text-2xs text-content-faint">Bitiş</span>
                        <input
                          type="date"
                          value={evalEnd}
                          onChange={(e) => setEvalEnd(e.target.value)}
                          className="rounded-md border border-line-strong bg-surface-raised px-2 py-1.5 text-sm text-content outline-none transition-colors ease-out hover:border-ink-500 focus:border-accent-500"
                        />
                      </label>

                      <button
                        onClick={handleEvaluate}
                        disabled={isEvaluating}
                        className="flex items-center gap-1.5 rounded-md bg-accent-400 px-3.5 py-1.5 text-sm font-medium text-ink-950 transition-colors ease-out hover:bg-accent-300 disabled:cursor-not-allowed disabled:bg-ink-650 disabled:text-content-disabled"
                      >
                        {isEvaluating ? (
                          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink-500 border-t-transparent" />
                        ) : (
                          <Play className="h-3.5 w-3.5" strokeWidth={1.75} />
                        )}
                        {isEvaluating ? 'Çalışıyor…' : 'Çalıştır'}
                      </button>

                      {showEvalPanel && evaluateResult && (
                        <button
                          onClick={handleNavigateToChart}
                          className="flex items-center gap-1.5 rounded-md border border-line-strong px-3 py-1.5 text-sm text-content transition-colors ease-out hover:border-ink-500 hover:bg-surface-hover"
                        >
                          <BarChart3 className="h-3.5 w-3.5" strokeWidth={1.75} />
                          Grafikte göster
                        </button>
                      )}
                    </div>

                    {/* Hata */}
                    {error && (
                      <div className="flex-shrink-0 px-4 py-2">
                        <p
                          role="alert"
                          className="rounded-md border border-loss-600/50 bg-loss-950 px-3 py-2 text-xs text-loss-300"
                        >
                          {error}
                        </p>
                      </div>
                    )}

                    {/* Çalışıyor durumu.
                        Önceden burada sonuç gelene kadar hiçbir şey
                        render edilmiyordu; boş panel siyah bir ekran gibi
                        duruyordu. */}
                    {isEvaluating && !evaluateResult && (
                      <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-3 px-4 py-6 text-content-faint">
                        <span className="h-6 w-6 animate-spin rounded-full border-2 border-line-strong border-t-accent-400" />
                        <p className="text-xs">Strateji test ediliyor…</p>
                      </div>
                    )}

                    {/* Sonuçlar */}
                    {!isEvaluating && showEvalPanel && evaluateResult && (
                      <div className="flex-1 min-h-0 flex flex-col px-4 py-2 overflow-hidden">
                        {/* Özet metrikler.
                            Önceden dokuz ayrı kart vardı (5 + 4); her biri bir
                            etiket ve bir sayı taşıyordu, aralarındaki boşluk
                            sayıları karşılaştırmayı zorlaştırıyordu. Tek bir
                            ızgara, ayraçlarla bölünmüş: aynı bilgi, aynı taban
                            çizgisi, yarısı kadar yer.

                            Getiri tek başına yanıltıcıdır — aynı getiriyi %60
                            düşüşle alan strateji aynı strateji değildir — bu
                            yüzden risk metrikleri sonuçla aynı blokta durur. */}
                        <div className="mb-2.5 flex-shrink-0 overflow-hidden rounded-lg border border-line">
                          <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
                            {[
                              ['Test edilen mum', String(evaluateResult.total_bars), ''],
                              ['Tamamlanan işlem', String(evaluateResult.total_trades || 0), ''],
                              ['Kazanma oranı', `${(evaluateResult.win_rate || 0).toFixed(1)}%`, ''],
                              [
                                'Kazanan / kaybeden',
                                `${evaluateResult.winning_trades || 0} / ${evaluateResult.losing_trades || 0}`,
                                '',
                              ],
                              [
                                'Net kâr / zarar',
                                `${(evaluateResult.total_pnl_percent || 0) >= 0 ? '+' : ''}${(
                                  evaluateResult.total_pnl_percent || 0
                                ).toFixed(2)}%`,
                                (evaluateResult.total_pnl_percent || 0) >= 0
                                  ? 'text-profit-400'
                                  : 'text-loss-400',
                              ],
                            ].map(([label, value, tone]) => (
                              <div
                                key={label}
                                className="border-b border-r border-line-subtle px-3 py-2 last:border-r-0"
                              >
                                <dt className="text-2xs text-content-faint">{label}</dt>
                                <dd className={`mt-1 font-mono text-sm ${tone || 'text-content-strong'}`}>
                                  {value}
                                </dd>
                              </div>
                            ))}
                          </dl>

                          {evaluateResult.performance && (
                            <dl className="grid grid-cols-2 border-t border-line sm:grid-cols-4">
                              {[
                                [
                                  'Max düşüş',
                                  formatMetric(evaluateResult.performance.max_drawdown_pct, '%'),
                                  'text-loss-400',
                                  'Zirveden dibe en büyük özkaynak kaybı.',
                                ],
                                [
                                  'Profit factor',
                                  formatMetric(evaluateResult.performance.profit_factor),
                                  '',
                                  "Brüt kâr / brüt zarar. 1'in üstü kârlı.",
                                ],
                                [
                                  'Sharpe',
                                  formatMetric(evaluateResult.performance.sharpe_ratio),
                                  '',
                                  'Getirinin oynaklığa oranı; işlem bazlı, yıllıklandırılmamış.',
                                ],
                                [
                                  'Son bakiye',
                                  evaluateResult.performance.ending_balance.toLocaleString('tr-TR', {
                                    maximumFractionDigits: 0,
                                  }),
                                  '',
                                  '',
                                ],
                              ].map(([label, value, tone, hint]) => (
                                <div
                                  key={label}
                                  title={hint || undefined}
                                  className="border-r border-line-subtle px-3 py-2 last:border-r-0"
                                >
                                  <dt className="text-2xs text-content-faint">{label}</dt>
                                  <dd className={`mt-1 font-mono text-sm ${tone || 'text-content-strong'}`}>
                                    {value}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          )}

                          {/* Al-tut kıyası. Sembol zaten %60 yükseldiyse
                              stratejinin %40 getirisi bir başarı değil. */}
                          {evaluateResult.buy_and_hold?.return_pct != null && (
                            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-line bg-surface-raised px-3 py-2 text-xs">
                              <span className="text-content-muted">
                                Aynı dönemde al-tut{' '}
                                <span className="font-mono text-content">
                                  {evaluateResult.buy_and_hold.return_pct >= 0 ? '+' : ''}
                                  {evaluateResult.buy_and_hold.return_pct.toFixed(2)}%
                                </span>{' '}
                                getirdi
                              </span>
                              <span
                                className={`font-mono ${
                                  (evaluateResult.outperformance_pct ?? 0) >= 0
                                    ? 'text-profit-400'
                                    : 'text-loss-400'
                                }`}
                              >
                                {(evaluateResult.outperformance_pct ?? 0) >= 0
                                  ? `Strateji ${(evaluateResult.outperformance_pct ?? 0).toFixed(2)}% önde`
                                  : `Strateji ${Math.abs(evaluateResult.outperformance_pct ?? 0).toFixed(2)}% geride`}
                              </span>
                            </div>
                          )}

                          {/* Test sonunda hâlâ açık pozisyon. Yukarıdaki
                              metriklere GİRMEZ (kâr/zarar gerçekleşmemiştir);
                              gösterilmesinin sebebi, al-tut benzeri bir
                              stratejinin aksi halde "0 işlem, %0 getiri"
                              görünüp al-tut'un yüzlerce puan gerisinde
                              sanılması. */}
                          {evaluateResult.open_position && (
                            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-line bg-surface-raised px-3 py-2 text-xs">
                              <span className="text-content-muted">
                                Test sonunda{' '}
                                <span
                                  className={`font-medium ${
                                    evaluateResult.open_position.side === 'LONG'
                                      ? 'text-profit-400'
                                      : 'text-loss-400'
                                  }`}
                                >
                                  {evaluateResult.open_position.side === 'LONG' ? 'ALIŞ' : 'SATIŞ'}
                                </span>{' '}
                                pozisyonu açık —{' '}
                                <span className="font-mono text-content">
                                  {evaluateResult.open_position.entry_price}
                                </span>{' '}
                                girişli, {evaluateResult.open_position.bars_held} mumdur taşınıyor
                              </span>
                              <span
                                className={`font-mono ${
                                  evaluateResult.open_position.unrealized_pnl_percent >= 0
                                    ? 'text-profit-400'
                                    : 'text-loss-400'
                                }`}
                                title="Gerçekleşmemiş kâr/zarar — yukarıdaki metriklere dahil DEĞİLDİR"
                              >
                                {evaluateResult.open_position.unrealized_pnl_percent >= 0 ? '+' : ''}
                                {evaluateResult.open_position.unrealized_pnl_percent.toFixed(2)}%
                                <span className="ml-1 text-content-faint">(gerçekleşmemiş)</span>
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Sinyal listesini dışa aktar */}
                        {Array.isArray(evaluateResult.signals) && evaluateResult.signals.length > 0 && (
                          <div className="mb-2 flex justify-end">
                            <button
                              onClick={() => exportSignalsCsv(evaluateResult)}
                              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-content-muted transition-colors ease-out hover:bg-surface-hover hover:text-content"
                              title="Sinyal listesini CSV olarak indir (Excel uyumlu)"
                            >
                              <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
                              CSV indir
                            </button>
                          </div>
                        )}

                        {/* Sinyal Listesi Tablosu */}
                        {Array.isArray(evaluateResult.signals) && evaluateResult.signals.length > 0 && (
                          /* Sayısal sütunlar sağa dayalı: bir fiyat listesinde
                             basamaklar alt alta hizalanmazsa büyüklükleri gözle
                             karşılaştırmak mümkün olmuyor. */
                          /* Beş sütun dar ekranda okunaksız hâle gelecek kadar
                             sıkışıyordu; tablo kendi kabında yatay kayar,
                             sayfa gövdesi kaymaz. */
                          <div className="custom-scrollbar min-h-0 flex-1 overflow-auto rounded-lg border border-line">
                            <table className="w-full min-w-[560px] text-xs">
                              <thead className="sticky top-0 z-10 bg-surface-raised">
                                <tr className="text-2xs text-content-faint">
                                  <th className="px-3 py-2 text-left font-normal">Zaman</th>
                                  <th className="px-3 py-2 text-left font-normal">Sinyal</th>
                                  <th className="px-3 py-2 text-right font-normal">Fiyat</th>
                                  <th className="px-3 py-2 text-right font-normal">Kâr / zarar</th>
                                  <th className="px-3 py-2 text-left font-normal">Karşılanan kurallar</th>
                                </tr>
                              </thead>
                              <tbody>
                                {evaluateResult.signals.slice(0, 100).map((signal, i) => (
                                  <tr
                                    key={i}
                                    onClick={handleNavigateToChart}
                                    className="cursor-pointer border-t border-line-subtle transition-colors ease-out hover:bg-surface-hover"
                                    title="Tıklayarak grafiğe geçin ve sinyali görün"
                                  >
                                    <td className="px-3 py-1.5 font-mono text-content-muted">
                                      {formatTimestamp(signal.timestamp)}
                                    </td>
                                    <td className="px-3 py-1.5">
                                      <span
                                        className={`flex items-center gap-1 ${
                                          signal.signal === 'BUY' ? 'text-profit-400' : 'text-loss-400'
                                        }`}
                                      >
                                        {signal.signal === 'BUY' ? (
                                          <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
                                        ) : (
                                          <ArrowDownRight className="h-3 w-3" strokeWidth={2} />
                                        )}
                                        {signal.signal}
                                      </span>
                                    </td>
                                    <td className="px-3 py-1.5 text-right font-mono text-content">
                                      {typeof signal.price === 'number' && !isNaN(signal.price)
                                        ? signal.price.toFixed(2)
                                        : '—'}
                                    </td>
                                    <td className="px-3 py-1.5 text-right font-mono">
                                      {signal.signal === 'SELL' && typeof signal.pnl_percent === 'number' && !isNaN(signal.pnl_percent) ? (
                                        <span
                                          className={
                                            signal.pnl_percent >= 0 ? 'text-profit-400' : 'text-loss-400'
                                          }
                                        >
                                          {signal.pnl_percent >= 0 ? `+${signal.pnl_percent.toFixed(2)}%` : `${signal.pnl_percent.toFixed(2)}%`}
                                        </span>
                                      ) : (
                                        <span className="text-content-faint">—</span>
                                      )}
                                    </td>
                                    <td className="max-w-xs truncate px-3 py-1.5 font-mono text-2xs text-content-faint">
                                      {Array.isArray(signal.conditions_met) ? signal.conditions_met.join(' & ') : ''}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {evaluateResult.signals.length > 100 && (
                              <p className="border-t border-line-subtle bg-surface-raised py-2 text-center text-2xs text-content-faint">
                                İlk 100 sinyal gösteriliyor · {evaluateResult.signals.length - 100} sinyal daha var, tamamı CSV'de
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}