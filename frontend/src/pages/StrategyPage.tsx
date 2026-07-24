/**
 * StrategyPage — Strateji yönetim sayfası.
 *
 * Sol panel: strateji listesi, sağ panel: builder/editor.
 * Değerlendirme sonuçları alt panelde gösterilir.
 */

import { useEffect, useState } from 'react';
import {
  Play,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  Layers,
  BarChart3,
} from 'lucide-react';
import StrategyList from '../strategy/StrategyList';
import StrategyBuilder from '../strategy/StrategyBuilder';
import { useStrategyStore, strategyStore } from '../store/strategyStore';
import type { Strategy, EvaluateRequest } from '../types/strategy';
import { TIMEFRAMES } from '../types/strategy';

interface StrategyPageProps {
  onSelectTab?: (tab: 'chart' | 'replay' | 'strategy') => void;
  setSymbol?: (s: string) => void;
  setProvider?: (p: string) => void;
  setTimeframe?: (tf: string) => void;
}

export default function StrategyPage({
  onSelectTab,
  setSymbol,
  setProvider,
  setTimeframe,
}: StrategyPageProps = {}) {
  const { strategies, activeStrategy, indicators, evaluateResult, isLoading, error } =
    useStrategyStore();

  const [mode, setMode] = useState<'list' | 'edit' | 'new'>('list');

  // Evaluate form state
  const [evalSymbol, setEvalSymbol] = useState('BTCUSDT');
  const [evalProvider, setEvalProvider] = useState('binance');
  const [evalTimeframe, setEvalTimeframe] = useState('1d');
  const [evalStart, setEvalStart] = useState('');
  const [evalEnd, setEvalEnd] = useState('');
  const [evalLimitBars, setEvalLimitBars] = useState<number>(1000);
  const [showEvalPanel, setShowEvalPanel] = useState(false);

  // İlk yükleme
  useEffect(() => {
    strategyStore.fetchStrategies();
    strategyStore.fetchIndicators();
  }, []);

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

  const handleEvaluate = async () => {
    if (!activeStrategy) return;

    const request: EvaluateRequest = {
      symbol: evalSymbol,
      provider: evalProvider,
      timeframe: evalTimeframe,
      start: evalStart || undefined,
      end: evalEnd || undefined,
      limit_bars: evalLimitBars,
    };

    await strategyStore.evaluateStrategy(activeStrategy.id, request);
    setShowEvalPanel(true);
  };

  const handleNavigateToChart = () => {
    if (setSymbol) setSymbol(evalSymbol);
    if (setProvider) setProvider(evalProvider);
    if (setTimeframe) setTimeframe(evalTimeframe);
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
                <h2 className="text-lg font-bold text-slate-100">Strateji Oluşturun veya Seçin</h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Sol taraftaki listeden mevcut bir stratejiyi düzenleyebilir veya yeni bir al-sat stratejisi tanımlayabilirsiniz.
                </p>
                <button
                  onClick={handleNewStrategy}
                  className="flex items-center gap-1.5 px-4 py-2 mx-auto text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-all shadow-lg shadow-indigo-500/20 cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5" />
                  İlk Stratejinizi Oluşturun
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
                <div className="border-t border-slate-800/60 bg-[#0a0e1a]/95">
                  {/* Değerlendirme Formu */}
                  <div className="flex items-center gap-2 px-4 py-2 flex-wrap">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                      Değerlendir:
                    </span>
                    <select
                      value={evalProvider}
                      onChange={(e) => {
                        setEvalProvider(e.target.value);
                        if (e.target.value === 'binance') setEvalSymbol('BTCUSDT');
                        else if (e.target.value === 'nasdaq') setEvalSymbol('AAPL');
                        else setEvalSymbol('THYAO');
                      }}
                      className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1 focus:border-indigo-500 outline-none"
                    >
                      <option value="binance">Binance</option>
                      <option value="nasdaq">NASDAQ</option>
                      <option value="bist">BIST</option>
                    </select>
                    <input
                      type="text"
                      value={evalSymbol}
                      onChange={(e) => setEvalSymbol(e.target.value.toUpperCase())}
                      placeholder="Sembol"
                      className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1 w-24 focus:border-indigo-500 outline-none font-mono"
                    />
                    <select
                      value={evalTimeframe}
                      onChange={(e) => setEvalTimeframe(e.target.value)}
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
                      onChange={(e) => setEvalLimitBars(parseInt(e.target.value) || 1000)}
                      className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1 focus:border-indigo-500 outline-none"
                      title="Test Edilecek Mum Aralığı"
                    >
                      <option value={1000}>Son 1000 Mum (Varsayılan)</option>
                      <option value={365}>Son 365 Mum</option>
                      <option value={100}>Son 100 Mum</option>
                      <option value={0}>Tüm Veri (Sınırsız)</option>
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
                    <div className="px-4 pb-2">
                      <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-1.5 text-[11px] text-red-400">
                        {error}
                      </div>
                    </div>
                  )}

                  {/* Sonuçlar */}
                  {showEvalPanel && evaluateResult && (
                    <div className="px-4 pb-3">
                      {/* Özet Metrikler */}
                      <div className="grid grid-cols-5 gap-2 mb-3">
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
                      {evaluateResult.signals.length > 0 && (
                        <div className="max-h-48 overflow-y-auto custom-scrollbar border border-slate-800/40 rounded-lg">
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
                                    {signal.price ? signal.price.toFixed(2) : '—'}
                                  </td>
                                  <td className="px-3 py-1.5 font-mono">
                                    {signal.signal === 'SELL' && signal.pnl_percent !== undefined ? (
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
                                    {signal.conditions_met.join(' & ')}
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
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}