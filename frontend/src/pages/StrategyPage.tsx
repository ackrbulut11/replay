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
  Zap,
  Layers,
  BarChart3,
  GripHorizontal,
} from 'lucide-react';
import StrategyList from '../strategy/StrategyList';
import StrategyBuilder from '../strategy/StrategyBuilder';
import { useStrategyStore, strategyStore } from '../store/strategyStore';
import type { Strategy, EvaluateRequest } from '../types/strategy';
import { TIMEFRAMES } from '../types/strategy';
import type { IndicatorsState } from '../charts/IndicatorToolbar';

interface StrategyPageProps {
  onSelectTab?: (tab: 'chart' | 'replay' | 'strategy') => void;
  setSymbol?: (s: string) => void;
  setProvider?: (p: string) => void;
  setTimeframe?: (tf: string) => void;
  onEnableIndicators?: (keys: (keyof IndicatorsState)[]) => void;
  currentSymbol?: string;
  currentTimeframe?: string;
}

export default function StrategyPage({
  onSelectTab,
  setSymbol,
  setProvider,
  setTimeframe,
  onEnableIndicators,
  currentSymbol,
  currentTimeframe,
}: StrategyPageProps = {}) {
  const { strategies, activeStrategy, indicators, evaluateResult, isLoading, error } =
    useStrategyStore();

  const [mode, setMode] = useState<'list' | 'edit' | 'new'>('list');

  // Evaluate form state — varsayılan olarak grafikte seçili sembolden başlar
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
  }, [currentSymbol]);

  useEffect(() => {
    if (currentTimeframe) setEvalTimeframe(currentTimeframe);
  }, [currentTimeframe]);

  // İlk yükleme ve aktif strateji değişiminde mod senkronizasyonu
  useEffect(() => {
    strategyStore.fetchStrategies().then(() => {
      const state = strategyStore.getState();
      if (state.strategies.length > 0 && !state.activeStrategy) {
        strategyStore.setActiveStrategy(state.strategies[0]);
        setMode('edit');
      }
    });
    strategyStore.fetchIndicators();
  }, []);

  useEffect(() => {
    if (activeStrategy) {
      setEvalAllowShort(Boolean(activeStrategy.allow_short));
    } else if (strategies.length > 0 && mode === 'list') {
      strategyStore.setActiveStrategy(strategies[0]);
      setMode('edit');
    }
  }, [activeStrategy, strategies]);

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

  const autoDetectProvider = (sym: string): string => {
    const s = sym.trim().toUpperCase();
    if (['THYAO', 'GARAN', 'AKBNK', 'EREGL', 'ASELS', 'SISE', 'KCHOL', 'BIMAS', 'TUPRS', 'SAHOL'].includes(s)) return 'bist';
    if (['AAPL', 'NVDA', 'TSLA', 'AMZN', 'MSFT', 'GOOGL', 'META', 'NFLX', 'INTC', 'AMD'].includes(s)) return 'nasdaq';
    return 'binance';
  };

  const handleEvaluate = async () => {
    if (!activeStrategy) return;

    const provider = autoDetectProvider(evalSymbol);

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

  const handleNavigateToChart = () => {
    if (setSymbol) setSymbol(evalSymbol);
    if (setProvider) setProvider(autoDetectProvider(evalSymbol));
    if (setTimeframe) setTimeframe(evalTimeframe);

    // Stratejide kullanılan indikatörleri otomatik olarak aktif et
    if (activeStrategy && onEnableIndicators) {
      const keysToEnable: (keyof IndicatorsState)[] = [];
      const checkOperand = (op: any) => {
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

      const checkGroup = (group: any) => {
        if (!group || !Array.isArray(group.conditions)) return;
        group.conditions.forEach((c: any) => {
          checkOperand(c.left);
          checkOperand(c.right);
          checkOperand(c.right2);
        });
      };

      checkGroup(activeStrategy.entry_rules);
      checkGroup(activeStrategy.exit_rules);
      if (Array.isArray(activeStrategy.timeframe_filters)) {
        activeStrategy.timeframe_filters.forEach((tf) => checkGroup(tf));
      }

      if (keysToEnable.length > 0) {
        onEnableIndicators(keysToEnable);
      }
    }

    if (onSelectTab) onSelectTab('chart');
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

  return (
    <div className="h-full w-full flex flex-col bg-[#070b13] overflow-hidden">
      {/* Ana İçerik */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Sol Panel — Strateji Listesi */}
        <div className="w-72 flex-shrink-0 border-r border-slate-800/60 overflow-hidden">
          <StrategyList
            strategies={strategies}
            activeStrategyId={activeStrategy?.id || null}
            onSelect={handleSelectStrategy}
            onNew={handleNewStrategy}
            isLoading={isLoading}
          />
        </div>

        {/* Sağ İçerik — Builder / Editor / Result */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[#070b13]">
          {mode === 'list' && !activeStrategy ? (
            <div className="flex-1 flex items-center justify-center p-8 text-center">
              <div className="max-w-md space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto text-indigo-400">
                  <Layers className="w-8 h-8" />
                </div>
                <h2 className="text-lg font-bold text-slate-100">
                  {strategies.length > 0 ? 'Bir Strateji Seçin veya İnceleyin' : 'Strateji Oluşturun'}
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {strategies.length > 0
                    ? 'Sol taraftaki listeden incelemek istediğiniz stratejiyi seçebilir veya yeni bir strateji ekleyebilirsiniz.'
                    : 'Sol taraftaki listeden yeni bir al-sat stratejisi tanımlayabilirsiniz.'}
                </p>
                <button
                  onClick={handleNewStrategy}
                  className="flex items-center gap-1.5 px-4 py-2 mx-auto text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-all shadow-lg shadow-indigo-500/20 cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5" />
                  {strategies.length > 0 ? 'Yeni Strateji Oluştur' : 'İlk Stratejinizi Oluşturun'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {/* Builder */}
              <div className="flex-1 min-h-0 overflow-hidden">
                <StrategyBuilder
                  strategy={mode === 'edit' ? activeStrategy : null}
                  indicators={indicators}
                  onSaved={handleSaved}
                  onCancel={handleCancel}
                />
              </div>

              {/* Değerlendirme Paneli */}
              {mode === 'edit' && activeStrategy && (
                <>
                  {/* Sürükle-Bırak Ayırıcı Çizgi (Terminal Paneli Ayırıcı) */}
                  <div
                    onMouseDown={handleMouseDownResize}
                    onDoubleClick={() => setEvalPanelHeight(340)}
                    className="group relative h-2.5 bg-[#070b13] hover:bg-indigo-600/40 border-t border-b border-slate-800/80 cursor-row-resize flex items-center justify-center transition-colors select-none z-10 flex-shrink-0"
                    title="Yukarı / Aşağı sürükleyerek panel boyutunu ayarlayın (Çift tık: Varsayılan boyut)"
                  >
                    <div className="w-16 h-1 rounded-full bg-slate-700/80 group-hover:bg-indigo-400 transition-colors flex items-center justify-center">
                      <GripHorizontal className="w-3.5 h-3.5 text-slate-400 group-hover:text-white" />
                    </div>
                  </div>

                  {/* Değerlendirme Alt Paneli */}
                  <div
                    style={{ height: `${evalPanelHeight}px` }}
                    className="flex flex-col min-h-0 bg-[#0a0e1a]/95 flex-shrink-0"
                  >
                    {/* Değerlendirme Formu */}
                    <div className="flex items-center gap-2 px-4 py-2 flex-wrap flex-shrink-0 border-b border-slate-800/40">
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                        Değerlendir:
                      </span>
                      <input
                        type="text"
                        value={evalSymbol}
                        onChange={(e) => {
                          const newSym = e.target.value.toUpperCase();
                          setEvalSymbol(newSym);
                          if (setSymbol && newSym.trim().length >= 2) setSymbol(newSym);
                          if (setProvider && newSym.trim().length >= 2) setProvider(autoDetectProvider(newSym));
                        }}
                        placeholder="Parite (ör: BTCUSDT)"
                        className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1 w-28 focus:border-indigo-500 outline-none font-mono font-semibold"
                      />
                      <select
                        value={evalTimeframe}
                        onChange={(e) => {
                          setEvalTimeframe(e.target.value);
                          if (setTimeframe) setTimeframe(e.target.value);
                        }}
                        className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1 focus:border-indigo-500 outline-none"
                      >
                        {TIMEFRAMES.map((tf) => (
                          <option key={tf} value={tf}>
                            {tf}
                          </option>
                        ))}
                      </select>
                      <select
                        value={evalLimitBars}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          setEvalLimitBars(isNaN(val) ? 1000 : val);
                        }}
                        className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1 focus:border-indigo-500 outline-none"
                        title="Test Edilecek Mum Aralığı"
                      >
                        <option value={1000}>Son 1000 Mum (Varsayılan)</option>
                        <option value={365}>Son 365 Mum</option>
                        <option value={100}>Son 100 Mum</option>
                        <option value={0}>Tüm Veri (Sınırsız)</option>
                      </select>
                      <select
                        value={evalAllowShort ? 'short' : 'long'}
                        onChange={(e) => setEvalAllowShort(e.target.value === 'short')}
                        className={`border text-xs rounded-lg px-2 py-1 outline-none font-medium transition-colors ${
                          evalAllowShort
                            ? 'bg-amber-950/40 border-amber-500/50 text-amber-300'
                            : 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                        }`}
                        title="Pozisyon Yönetimi: SELL sinyalinde elindekini mi satsın, Short'a da dönsün mü?"
                      >
                        <option value="long" className="bg-[#0d1321] text-emerald-400">🟢 Sadece Long (Elindekini Sat)</option>
                        <option value="short" className="bg-[#0d1321] text-amber-400">🔄 Long & Short (Short'a Dön)</option>
                      </select>
                      <input
                        type="date"
                        value={evalStart}
                        onChange={(e) => setEvalStart(e.target.value)}
                        className="bg-slate-900 border border-slate-700 text-slate-300 text-xs rounded-lg px-2 py-1 focus:border-indigo-500 outline-none"
                        title="Başlangıç Tarihi (Opsiyonel)"
                      />
                      <input
                        type="date"
                        value={evalEnd}
                        onChange={(e) => setEvalEnd(e.target.value)}
                        className="bg-slate-900 border border-slate-700 text-slate-300 text-xs rounded-lg px-2 py-1 focus:border-indigo-500 outline-none"
                        title="Bitiş Tarihi (Opsiyonel)"
                      />
                      <button
                        onClick={handleEvaluate}
                        disabled={isLoading}
                        className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg transition-all cursor-pointer shadow-md shadow-emerald-600/20"
                      >
                        <Play className="w-3.5 h-3.5" />
                        Çalıştır
                      </button>
                      {showEvalPanel && evaluateResult && (
                        <button
                          onClick={handleNavigateToChart}
                          className="flex items-center gap-1.5 px-3.5 py-1 text-xs font-semibold text-indigo-300 bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 rounded-lg transition-all cursor-pointer shadow-md shadow-indigo-600/20"
                          title="Grafiğe geç ve sinyalleri incele"
                        >
                          <BarChart3 className="w-3.5 h-3.5 text-indigo-400" />
                          Grafikte Göster
                        </button>
                      )}
                    </div>

                    {/* Hata */}
                    {error && (
                      <div className="px-4 py-1.5 flex-shrink-0">
                        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-1.5 text-[11px] text-red-400">
                          {error}
                        </div>
                      </div>
                    )}

                    {/* Sonuçlar */}
                    {showEvalPanel && evaluateResult && (
                      <div className="flex-1 min-h-0 flex flex-col px-4 py-2 overflow-hidden">
                        {/* Özet Metrikler */}
                        <div className="grid grid-cols-5 gap-2 mb-2 flex-shrink-0">
                          <div className="bg-slate-900/60 border border-slate-800/60 rounded-lg p-2">
                            <span className="text-[9px] text-slate-500 uppercase block">
                              Test Edilen Mum
                            </span>
                            <span className="text-sm font-bold text-slate-100 font-mono">
                              {evaluateResult.total_bars}
                            </span>
                          </div>
                          <div className="bg-slate-900/60 border border-slate-800/60 rounded-lg p-2">
                            <span className="text-[9px] text-slate-400/80 uppercase block">
                              Tamamlanan İşlem
                            </span>
                            <span className="text-sm font-bold text-slate-200 font-mono">
                              {evaluateResult.total_trades || 0}
                            </span>
                          </div>
                          <div className="bg-emerald-950/40 border border-emerald-800/40 rounded-lg p-2">
                            <span className="text-[9px] text-emerald-400/70 uppercase block">
                              Başarı Oranı (Win Rate)
                            </span>
                            <span className="text-sm font-bold text-emerald-400 font-mono">
                              {(evaluateResult.win_rate || 0).toFixed(1)}%
                            </span>
                          </div>
                          <div className="bg-slate-900/60 border border-slate-800/60 rounded-lg p-2">
                            <span className="text-[9px] text-slate-400/80 uppercase block">
                              Kazanan / Kaybeden
                            </span>
                            <span className="text-sm font-bold font-mono text-slate-200">
                              <span className="text-emerald-400">{evaluateResult.winning_trades || 0}</span>
                              {' / '}
                              <span className="text-red-400">{evaluateResult.losing_trades || 0}</span>
                            </span>
                          </div>
                          <div className={`rounded-lg p-2 border ${
                            (evaluateResult.total_pnl_percent || 0) >= 0
                              ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-400'
                              : 'bg-red-950/40 border-red-800/50 text-red-400'
                          }`}>
                            <span className="text-[9px] uppercase block opacity-80">
                              Toplam Net Kar/Zarar
                            </span>
                            <span className="text-sm font-bold font-mono">
                              {(evaluateResult.total_pnl_percent || 0) >= 0 ? '+' : ''}
                              {(evaluateResult.total_pnl_percent || 0).toFixed(2)}%
                            </span>
                          </div>
                        </div>

                        {/* Sinyal Listesi Tablosu */}
                        {Array.isArray(evaluateResult.signals) && evaluateResult.signals.length > 0 && (
                          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar border border-slate-800/40 rounded-lg">
                            <table className="w-full text-xs">
                              <thead className="sticky top-0 bg-[#0d1321]">
                                <tr className="text-[10px] text-slate-500 uppercase">
                                  <th className="text-left px-3 py-1.5">Zaman</th>
                                  <th className="text-left px-3 py-1.5">Sinyal</th>
                                  <th className="text-left px-3 py-1.5">Fiyat</th>
                                  <th className="text-left px-3 py-1.5">Kar / Zarar (%)</th>
                                  <th className="text-left px-3 py-1.5">Met Kurallar</th>
                                </tr>
                              </thead>
                              <tbody>
                                {evaluateResult.signals.slice(0, 100).map((signal, i) => (
                                  <tr
                                    key={i}
                                    onClick={handleNavigateToChart}
                                    className="border-t border-slate-800/30 hover:bg-indigo-500/10 cursor-pointer transition-colors"
                                    title="Tıklayarak grafiğe geçin ve sinyali görün"
                                  >
                                    <td className="px-3 py-1.5 text-slate-400 font-mono">
                                      {formatTimestamp(signal.timestamp)}
                                    </td>
                                    <td className="px-3 py-1.5">
                                      <span
                                        className={`flex items-center gap-1 font-semibold ${
                                          signal.signal === 'BUY'
                                            ? 'text-emerald-400'
                                            : 'text-red-400'
                                        }`}
                                      >
                                        {signal.signal === 'BUY' ? (
                                          <ArrowUpRight className="w-3 h-3" />
                                        ) : (
                                          <ArrowDownRight className="w-3 h-3" />
                                        )}
                                        {signal.signal}
                                      </span>
                                    </td>
                                    <td className="px-3 py-1.5 text-slate-200 font-mono">
                                      {typeof signal.price === 'number' && !isNaN(signal.price)
                                        ? signal.price.toFixed(2)
                                        : '—'}
                                    </td>
                                    <td className="px-3 py-1.5 font-mono">
                                      {signal.signal === 'SELL' && typeof signal.pnl_percent === 'number' && !isNaN(signal.pnl_percent) ? (
                                        <span
                                          className={`font-bold ${
                                            signal.pnl_percent >= 0 ? 'text-emerald-400' : 'text-red-400'
                                          }`}
                                        >
                                          {signal.pnl_percent >= 0 ? `+${signal.pnl_percent.toFixed(2)}%` : `${signal.pnl_percent.toFixed(2)}%`}
                                        </span>
                                      ) : (
                                        <span className="text-slate-600">—</span>
                                      )}
                                    </td>
                                    <td className="px-3 py-1.5 text-slate-500 text-[10px] font-mono truncate max-w-xs">
                                      {Array.isArray(signal.conditions_met) ? signal.conditions_met.join(' & ') : ''}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {evaluateResult.signals.length > 100 && (
                              <div className="text-center py-1.5 text-[10px] text-slate-500 bg-slate-900/40">
                                ... ve {evaluateResult.signals.length - 100} sinyal daha
                              </div>
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