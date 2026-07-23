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
} from 'lucide-react';
import StrategyList from '../strategy/StrategyList';
import StrategyBuilder from '../strategy/StrategyBuilder';
import { useStrategyStore, strategyStore } from '../store/strategyStore';
import type { Strategy, EvaluateRequest } from '../types/strategy';
import { TIMEFRAMES } from '../types/strategy';

export default function StrategyPage() {
  const { strategies, activeStrategy, indicators, evaluateResult, isLoading, error } =
    useStrategyStore();

  const [mode, setMode] = useState<'list' | 'edit' | 'new'>('list');

  // Evaluate form state
  const [evalSymbol, setEvalSymbol] = useState('BTCUSDT');
  const [evalProvider, setEvalProvider] = useState('binance');
  const [evalTimeframe, setEvalTimeframe] = useState('1d');
  const [evalStart, setEvalStart] = useState('');
  const [evalEnd, setEvalEnd] = useState('');
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
    };

    await strategyStore.evaluateStrategy(activeStrategy.id, request);
    setShowEvalPanel(true);
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

        {/* Sağ Panel — Builder veya Boş */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {mode === 'list' ? (
            /* Boş durum */
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Layers className="w-12 h-12 text-slate-800 mx-auto mb-4" />
                <p className="text-sm text-slate-500 mb-2">Strateji Motoru</p>
                <p className="text-xs text-slate-600 max-w-xs mx-auto mb-4">
                  JSON tabanlı koşul tanımı ile strateji oluşturun.
                  İndikatörler, fiyat verileri ve çoklu timeframe filtreleri kullanarak
                  giriş/çıkış kurallarını belirleyin.
                </p>
                <button
                  onClick={handleNewStrategy}
                  className="flex items-center gap-1.5 px-4 py-2 mx-auto text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-all shadow-lg shadow-indigo-500/20"
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
                    <input
                      type="date"
                      value={evalStart}
                      onChange={(e) => setEvalStart(e.target.value)}
                      className="bg-slate-900 border border-slate-700 text-slate-300 text-xs rounded-lg px-2 py-1 focus:border-indigo-500 outline-none"
                    />
                    <input
                      type="date"
                      value={evalEnd}
                      onChange={(e) => setEvalEnd(e.target.value)}
                      className="bg-slate-900 border border-slate-700 text-slate-300 text-xs rounded-lg px-2 py-1 focus:border-indigo-500 outline-none"
                    />
                    <button
                      onClick={handleEvaluate}
                      disabled={isLoading}
                      className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg transition-all"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Çalıştır
                    </button>
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
                      {/* Özet */}
                      <div className="grid grid-cols-4 gap-2 mb-3">
                        <div className="bg-slate-900/60 border border-slate-800/60 rounded-lg p-2">
                          <span className="text-[9px] text-slate-500 uppercase block">
                            Toplam Bar
                          </span>
                          <span className="text-sm font-bold text-slate-100 font-mono">
                            {evaluateResult.total_bars}
                          </span>
                        </div>
                        <div className="bg-emerald-950/40 border border-emerald-800/40 rounded-lg p-2">
                          <span className="text-[9px] text-emerald-400/60 uppercase block">
                            BUY Sinyali
                          </span>
                          <span className="text-sm font-bold text-emerald-400 font-mono">
                            {evaluateResult.buy_count}
                          </span>
                        </div>
                        <div className="bg-red-950/40 border border-red-800/40 rounded-lg p-2">
                          <span className="text-[9px] text-red-400/60 uppercase block">
                            SELL Sinyali
                          </span>
                          <span className="text-sm font-bold text-red-400 font-mono">
                            {evaluateResult.sell_count}
                          </span>
                        </div>
                        <div className="bg-slate-900/60 border border-slate-800/60 rounded-lg p-2">
                          <span className="text-[9px] text-slate-500 uppercase block">
                            Sinyal Oranı
                          </span>
                          <span className="text-sm font-bold text-slate-100 font-mono">
                            {evaluateResult.total_bars > 0
                              ? (
                                  ((evaluateResult.buy_count + evaluateResult.sell_count) /
                                    evaluateResult.total_bars) *
                                  100
                                ).toFixed(1)
                              : 0}
                            %
                          </span>
                        </div>
                      </div>

                      {/* Sinyal Listesi */}
                      {evaluateResult.signals.length > 0 && (
                        <div className="max-h-48 overflow-y-auto custom-scrollbar border border-slate-800/40 rounded-lg">
                          <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-[#0d1321]">
                              <tr className="text-[10px] text-slate-500 uppercase">
                                <th className="text-left px-3 py-1.5">Zaman</th>
                                <th className="text-left px-3 py-1.5">Sinyal</th>
                                <th className="text-left px-3 py-1.5">Koşullar</th>
                              </tr>
                            </thead>
                            <tbody>
                              {evaluateResult.signals.slice(0, 100).map((signal, i) => (
                                <tr
                                  key={i}
                                  className="border-t border-slate-800/30 hover:bg-slate-800/20"
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