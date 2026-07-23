import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from './layouts/DashboardLayout';
import CandleChart from './charts/CandleChart';
import { IndicatorsState, DEFAULT_INDICATORS_STATE } from './charts/IndicatorToolbar';
import { BarChart3, ChevronUp, ChevronDown } from 'lucide-react';
import { useReplayStore } from './store/replayStore';
import WatchlistPanel from './components/watchlist/WatchlistPanel';
import RightActionBar from './components/watchlist/RightActionBar';
import SymbolSearchModal from './components/SymbolSearchModal';
import StrategyPage from './pages/StrategyPage';
import type { NavigationTab } from './components/Sidebar';

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function App() {
  const [activeTab, setActiveTab] = useState<NavigationTab>('chart');

  const [provider, setProvider] = useState('binance');
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('1d');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  
  const [logScale, setLogScale] = useState(false);
  const [indicators, setIndicators] = useState<IndicatorsState>(DEFAULT_INDICATORS_STATE);

  const [chartData, setChartData] = useState<CandleData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStatsOpen, setIsStatsOpen] = useState(false);

  const [replayState] = useReplayStore();

  const handleToggleIndicator = (key: keyof IndicatorsState) => {
    setIndicators((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleLoadChart = useCallback(async () => {
    console.log("Fetching market data for:", { provider, symbol, timeframe, start, end });
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/market/data?provider=${provider}&symbol=${symbol}&timeframe=${timeframe}&start=${start}&end=${end}`
      );
      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.detail || 'Veriler yüklenirken bir hata oluştu.');
      }
      const data = await response.json();
      console.log(`Fetched ${data.length} data points.`);
      if (data.length === 0) {
        setError('Belirtilen tarih aralığında veri bulunamadı. Lütfen önce bu veriyi indirdiğinizden emin olun.');
        setChartData([]);
      } else {
        setChartData(data);
      }
    } catch (err: any) {
      console.error("Fetch data failed:", err);
      setError(err.message || 'Sunucu bağlantı hatası.');
      setChartData([]);
    } finally {
      setLoading(false);
    }
  }, [provider, symbol, timeframe, start, end]);

  // Sağlayıcı değiştiğinde varsayılan sembolü otomatik olarak değiştir
  useEffect(() => {
    if (provider === 'binance') {
      setSymbol('BTCUSDT');
    } else if (provider === 'nasdaq') {
      setSymbol('AAPL');
    } else if (provider === 'bist') {
      setSymbol('THYAO');
    }
  }, [provider]);

  // Girdiler değiştiğinde grafiği otomatik olarak yükle (sembol yazımı için debounce uygulandı)
  useEffect(() => {
    if (!symbol || symbol.trim().length < 2) return;

    console.log("App inputs changed, setting reload timeout for:", { provider, symbol, timeframe, start, end });
    const timer = setTimeout(() => {
      handleLoadChart();
    }, 300);

    return () => {
      console.log("App inputs changed again, clearing previous timeout.");
      clearTimeout(timer);
    };
  }, [provider, symbol, timeframe, start, end, handleLoadChart]);

  // İstatistikleri hesaplamak için yardımcı fonksiyon
  const getStats = () => {
    if (chartData.length === 0) return null;
    
    let activeData = chartData;
    if (replayState.isReplayActive && replayState.currentIndex !== null) {
      activeData = chartData.slice(0, Math.min(replayState.currentIndex + 1, chartData.length));
    }
    if (activeData.length === 0) return null;
    
    const highs = activeData.map(c => c.high);
    const lows = activeData.map(c => c.low);
    const volumes = activeData.map(c => c.volume);
    
    const highest = Math.max(...highs);
    const lowest = Math.min(...lows);
    const firstPrice = activeData[0].open;
    const lastPrice = activeData[activeData.length - 1].close;
    const changePercent = ((lastPrice - firstPrice) / firstPrice) * 100;
    const totalVolume = volumes.reduce((sum, v) => sum + v, 0);
    
    return {
      highest: highest.toLocaleString(undefined, { maximumFractionDigits: 2 }),
      lowest: lowest.toLocaleString(undefined, { maximumFractionDigits: 2 }),
      change: changePercent.toFixed(2),
      avgVolume: (totalVolume / activeData.length).toLocaleString(undefined, { maximumFractionDigits: 2 }),
      count: activeData.length
    };
  };

  const stats = getStats();

  return (
    <DashboardLayout activeTab={activeTab} onSelectTab={setActiveTab}>
      {activeTab === 'strategy' ? (
        <StrategyPage />
      ) : activeTab === 'chart' || activeTab === 'replay' ? (
        <div className="h-full w-full flex flex-col p-2 space-y-2 overflow-hidden bg-[#070b13]">
          {/* Ana İçerik Alanı: Grafik + Favoriler (Watchlist) Yan Paneli + Sağ Araç Çubuğu */}
          <div className="flex-1 min-h-0 w-full flex relative overflow-hidden rounded-xl">
            {/* Grafik Alanı */}
            <div className="flex-1 min-w-0 h-full relative">
              <CandleChart
                data={chartData}
                logScale={logScale}
                setLogScale={setLogScale}
                indicators={indicators}
                onToggleIndicator={handleToggleIndicator}
                provider={provider}
                setProvider={setProvider}
                symbol={symbol}
                setSymbol={setSymbol}
                timeframe={timeframe}
                setTimeframe={setTimeframe}
                start={start}
                setStart={setStart}
                end={end}
                setEnd={setEnd}
                loading={loading}
                error={error}
                onOpenSearchModal={() => setIsSearchModalOpen(true)}
              />
            </div>

            {/* Açılır / Kapanır Favoriler Paneli */}
            <WatchlistPanel
              currentSymbol={symbol}
              currentProvider={provider}
              onSelectSymbol={(newSym, newProv) => {
                setSymbol(newSym);
                setProvider(newProv);
              }}
              onOpenSearchModal={() => setIsSearchModalOpen(true)}
            />

            {/* Dikey Sağ Araç Çubuğu (TradingView Stili) */}
            <RightActionBar
              onOpenSearchModal={() => setIsSearchModalOpen(true)}
            />
          </div>

          {/* Global Sembol Arama Modal Penceresi */}
          <SymbolSearchModal
            isOpen={isSearchModalOpen}
            onClose={() => setIsSearchModalOpen(false)}
            onSelectSymbol={(newSym, newProv) => {
              setSymbol(newSym);
              setProvider(newProv);
            }}
            currentProvider={provider}
          />

          {/* İstatistik Paneli Bileşenleri (Açılır-Kapanır Çekmece) */}
          {stats && !loading && (
            <div className="bg-[#0d1321]/90 border border-slate-900/60 rounded-xl overflow-hidden shadow-xl transition-all duration-300">
              <button
                onClick={() => setIsStatsOpen(!isStatsOpen)}
                className="w-full flex items-center justify-between px-4 py-2 hover:bg-slate-800/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider select-none">
                    İstatistikler & Veri Analizi
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium font-mono select-none">
                    ({stats.count} mum verisi)
                  </span>
                </div>
                
                <div className="flex items-center gap-4">
                  {!isStatsOpen && (
                    <div className="flex items-center gap-4 text-[11px] font-medium text-slate-400 font-sans">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500 font-semibold select-none">Fiyat Değişimi:</span>
                        <span className={`${parseFloat(stats.change) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {parseFloat(stats.change) >= 0 ? '+' : ''}{stats.change}%
                        </span>
                      </div>
                      <div className="w-px h-3 bg-slate-800" />
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500 font-semibold select-none">En Yüksek:</span>
                        <span className="text-slate-200 font-mono">{stats.highest}</span>
                      </div>
                      <div className="w-px h-3 bg-slate-800" />
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500 font-semibold select-none">En Düşük:</span>
                        <span className="text-slate-200 font-mono">{stats.lowest}</span>
                      </div>
                    </div>
                  )}
                  <div className="p-0.5 rounded hover:bg-slate-800/40">
                    {isStatsOpen ? (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                </div>
              </button>

              {isStatsOpen && (
                <div className="px-4 pb-3 grid grid-cols-2 md:grid-cols-5 gap-3 border-t border-slate-900/60 pt-3 animate-fadeIn">
                  <div className="bg-[#070b13]/60 border border-slate-800/80 rounded-xl p-2.5 flex flex-col gap-0.5">
                    <span className="text-[10px] text-slate-500 font-medium uppercase select-none">Total Bars</span>
                    <span className="text-sm font-bold text-slate-100 font-mono">{stats.count}</span>
                  </div>
                  <div className="bg-[#070b13]/60 border border-slate-800/80 rounded-xl p-2.5 flex flex-col gap-0.5">
                    <span className="text-[10px] text-slate-500 font-medium uppercase select-none">Price Change</span>
                    <span className={`text-sm font-bold font-mono ${parseFloat(stats.change) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {parseFloat(stats.change) >= 0 ? '+' : ''}{stats.change}%
                    </span>
                  </div>
                  <div className="bg-[#070b13]/60 border border-slate-800/80 rounded-xl p-2.5 flex flex-col gap-0.5">
                    <span className="text-[10px] text-slate-500 font-medium uppercase select-none">Highest Price</span>
                    <span className="text-sm font-bold text-slate-100 font-mono">{stats.highest}</span>
                  </div>
                  <div className="bg-[#070b13]/60 border border-slate-800/80 rounded-xl p-2.5 flex flex-col gap-0.5">
                    <span className="text-[10px] text-slate-500 font-medium uppercase select-none">Lowest Price</span>
                    <span className="text-sm font-bold text-slate-100 font-mono">{stats.lowest}</span>
                  </div>
                  <div className="bg-[#070b13]/60 border border-slate-800/80 rounded-xl p-2.5 flex flex-col gap-0.5 col-span-2 md:col-span-1">
                    <span className="text-[10px] text-slate-500 font-medium uppercase select-none">Average Volume</span>
                    <span className="text-sm font-bold text-slate-100 font-mono">{stats.avgVolume}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Gelecek fazlar için placeholder modüller */
        <div className="flex-1 flex items-center justify-center p-8 bg-[#070b13]">
          <div className="text-center max-w-sm border border-slate-800/80 bg-[#0d1321]/60 p-8 rounded-2xl shadow-xl">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center mx-auto mb-4 text-indigo-400">
              <BarChart3 className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-200 capitalize mb-1">{activeTab} Modülü</h3>
            <p className="text-xs text-slate-500">
              Bu özellik Yol Haritası (Roadmap) üzerindeki gelecek fazlarda aktive edilecektir.
            </p>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

export default App;
