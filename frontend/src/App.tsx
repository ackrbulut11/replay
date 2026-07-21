import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from './layouts/DashboardLayout';
import CandleChart from './charts/CandleChart';
import { IndicatorsState, DEFAULT_INDICATORS_STATE } from './charts/IndicatorToolbar';
import { BarChart3, ChevronUp, ChevronDown } from 'lucide-react';
import { useReplayStore } from './store/replayStore';

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function App() {
  const [provider, setProvider] = useState('binance');
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('1h');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  
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
    <DashboardLayout>
      <div className="h-full w-full flex flex-col p-2 space-y-2 overflow-hidden bg-[#070b13]">
        {/* Grafik Görüntüleme Alanı */}
        <div className="flex-1 min-h-0 w-full relative">
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
          />
        </div>

        {/* İstatistik Paneli Bileşenleri (Açılır-Kapanır Çekmece) */}
        {stats && !loading && (
          <div className="bg-[#0d1321]/90 border border-slate-900/60 rounded-xl overflow-hidden shadow-xl transition-all duration-300">
            {/* Açılır Kapanır Başlık Butonu */}
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
              
              {/* Kapalıyken Gösterilen Hızlı Özet Veriler */}
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

            {/* Genişletilmiş İstatistik Kartları */}
            {isStatsOpen && (
              <div className="px-4 pb-3 grid grid-cols-2 md:grid-cols-5 gap-3 border-t border-slate-900/60 pt-3 animate-fadeIn">
                {/* Bar Sayısı */}
                <div className="bg-[#070b13]/60 border border-slate-800/80 rounded-xl p-2.5 flex flex-col gap-0.5">
                  <span className="text-[10px] text-slate-500 font-medium uppercase select-none">Total Bars</span>
                  <span className="text-sm font-bold text-slate-100 font-mono">{stats.count}</span>
                </div>
                {/* Değişim Yüzdesi */}
                <div className="bg-[#070b13]/60 border border-slate-800/80 rounded-xl p-2.5 flex flex-col gap-0.5">
                  <span className="text-[10px] text-slate-500 font-medium uppercase select-none">Price Change</span>
                  <span className={`text-sm font-bold font-mono ${parseFloat(stats.change) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {parseFloat(stats.change) >= 0 ? '+' : ''}{stats.change}%
                  </span>
                </div>
                {/* En Yüksek Fiyat */}
                <div className="bg-[#070b13]/60 border border-slate-800/80 rounded-xl p-2.5 flex flex-col gap-0.5">
                  <span className="text-[10px] text-slate-500 font-medium uppercase select-none">Highest Price</span>
                  <span className="text-sm font-bold text-slate-100 font-mono">{stats.highest}</span>
                </div>
                {/* En Düşük Fiyat */}
                <div className="bg-[#070b13]/60 border border-slate-800/80 rounded-xl p-2.5 flex flex-col gap-0.5">
                  <span className="text-[10px] text-slate-500 font-medium uppercase select-none">Lowest Price</span>
                  <span className="text-sm font-bold text-slate-100 font-mono">{stats.lowest}</span>
                </div>
                {/* Ort. Hacim */}
                <div className="bg-[#070b13]/60 border border-slate-800/80 rounded-xl p-2.5 flex flex-col gap-0.5 col-span-2 md:col-span-1">
                  <span className="text-[10px] text-slate-500 font-medium uppercase select-none">Average Volume</span>
                  <span className="text-sm font-bold text-slate-100 font-mono">{stats.avgVolume}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default App;
