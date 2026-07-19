import React, { useState, useEffect } from 'react';
import DashboardLayout from './layouts/DashboardLayout';
import CandleChart from './charts/CandleChart';
import { Search, Loader2, AlertCircle, BarChart3, TrendingUp, Calendar, Coins } from 'lucide-react';

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const getTodayStr = () => {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const getPastDateStr = (daysAgo: number) => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

function App() {
  const [provider, setProvider] = useState('binance');
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('1h');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  
  const [chartData, setChartData] = useState<CandleData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLoadChart = async () => {
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
      if (data.length === 0) {
        setError('Belirtilen tarih aralığında veri bulunamadı. Lütfen önce bu veriyi indirdiğinizden emin olun.');
        setChartData([]);
      } else {
        setChartData(data);
      }
    } catch (err: any) {
      setError(err.message || 'Sunucu bağlantı hatası.');
      setChartData([]);
    } finally {
      setLoading(false);
    }
  };

  // Automatically change default symbol when provider changes
  useEffect(() => {
    if (provider === 'binance') {
      setSymbol('BTCUSDT');
    } else if (provider === 'nasdaq') {
      setSymbol('AAPL');
    } else if (provider === 'bist') {
      setSymbol('THYAO');
    }
  }, [provider]);

  // Automatically load chart when inputs change (debounced for symbol typing)
  useEffect(() => {
    if (!symbol || symbol.trim().length < 2) return;

    const timer = setTimeout(() => {
      handleLoadChart();
    }, 300);

    return () => clearTimeout(timer);
  }, [provider, symbol, timeframe, start, end]);

  // Helper to calculate statistics
  const getStats = () => {
    if (chartData.length === 0) return null;
    
    const closes = chartData.map(c => c.close);
    const highs = chartData.map(c => c.high);
    const lows = chartData.map(c => c.low);
    const volumes = chartData.map(c => c.volume);
    
    const highest = Math.max(...highs);
    const lowest = Math.min(...lows);
    const firstPrice = chartData[0].open;
    const lastPrice = chartData[chartData.length - 1].close;
    const changePercent = ((lastPrice - firstPrice) / firstPrice) * 100;
    const totalVolume = volumes.reduce((sum, v) => sum + v, 0);
    
    return {
      highest: highest.toLocaleString(undefined, { maximumFractionDigits: 2 }),
      lowest: lowest.toLocaleString(undefined, { maximumFractionDigits: 2 }),
      change: changePercent.toFixed(2),
      avgVolume: (totalVolume / chartData.length).toLocaleString(undefined, { maximumFractionDigits: 2 }),
      count: chartData.length
    };
  };

  const stats = getStats();

  return (
    <DashboardLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        
        {/* Header Title with gradient */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-900 pb-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">
              Trading Research Platform
            </h1>
            <p className="text-slate-400 mt-1 text-sm">
              Manual backtesting and historical market replay analysis tool.
            </p>
          </div>
          
          {/* Quick Info Badges */}
          {chartData.length > 0 && !loading && (
            <div className="flex gap-2 flex-wrap">
              <span className="px-3 py-1.5 bg-slate-900/60 border border-slate-800 text-xs font-semibold rounded-lg text-emerald-400 flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5" />
                {symbol.toUpperCase()}
              </span>
              <span className="px-3 py-1.5 bg-slate-900/60 border border-slate-800 text-xs font-semibold rounded-lg text-blue-400 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                {timeframe}
              </span>
            </div>
          )}
        </div>

        {/* Horizontal Control Panel Toolbar */}
        <div className="bg-[#0d1321]/90 border border-slate-900 rounded-2xl p-4 shadow-xl flex flex-wrap gap-4 items-end justify-between backdrop-blur-md">
          <div className="flex flex-wrap gap-4 items-end flex-1">
            {/* Provider Selection */}
            <div className="flex flex-col gap-1 min-w-[130px]">
              <label className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Data Provider</label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="bg-[#070b13] border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              >
                <option value="binance">Binance Spot</option>
                <option value="nasdaq">Nasdaq Stock</option>
                <option value="bist">Borsa Istanbul (BIST)</option>
              </select>
            </div>

            {/* Symbol Input */}
            <div className="flex flex-col gap-1 min-w-[130px]">
              <label className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Symbol / Ticker</label>
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase().trim())}
                placeholder="e.g. BTCUSDT"
                className="bg-[#070b13] border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition uppercase"
              />
            </div>

            {/* Timeframe Selection */}
            <div className="flex flex-col gap-1 min-w-[120px]">
              <label className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Timeframe</label>
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                className="bg-[#070b13] border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              >
                <option value="1m">1 Minute</option>
                <option value="5m">5 Minutes</option>
                <option value="15m">15 Minutes</option>
                <option value="1h">1 Hour</option>
                <option value="4h">4 Hours</option>
                <option value="1d">1 Day</option>
                <option value="1w">1 Week</option>
                <option value="1mo">1 Month</option>
              </select>
            </div>

            {/* Start Date */}
            <div className="flex flex-col gap-1 min-w-[135px]">
              <label className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Start Date</label>
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="bg-[#070b13] border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              />
            </div>

            {/* End Date */}
            <div className="flex flex-col gap-1 min-w-[135px]">
              <label className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">End Date</label>
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="bg-[#070b13] border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              />
            </div>
          </div>
        </div>

        {/* Main Content Area - Full Width */}
        <div className="space-y-6">
          {/* Chart Display Area */}
          <div className="relative min-h-[500px] flex items-center justify-center bg-[#0d1321]/50 border border-slate-900 rounded-2xl overflow-hidden shadow-2xl p-4">
            {loading && (
              <div className="absolute inset-0 bg-[#070b13]/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-10 h-10 text-indigo-400 animate-spin" />
                <span className="text-slate-300 text-sm font-medium">Loading market data...</span>
              </div>
            )}

            {error && !loading && (
              <div className="flex flex-col items-center text-center max-w-md p-6 space-y-3 z-10">
                <div className="p-3 bg-red-950/40 border border-red-900/60 rounded-full text-red-400">
                  <AlertCircle className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-red-200">Veri Yüklenemedi</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{error}</p>
                <p className="text-slate-500 text-xs">
                  İpucu: Komut satırından `python scripts/download_data.py` çalıştırarak bu veriyi indirmiş olduğunuzdan emin olun.
                </p>
              </div>
            )}

            {!error && chartData.length === 0 && !loading && (
              <div className="flex flex-col items-center text-center max-w-sm p-6 space-y-3">
                <div className="p-3 bg-slate-900 border border-slate-800 rounded-full text-slate-400">
                  <BarChart3 className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-semibold text-slate-200">Chart Ready to Load</h3>
                <p className="text-slate-400 text-sm">
                  Select data provider, symbol, and timeframe from the control panel and click "Load Chart".
                </p>
              </div>
            )}

            {!error && chartData.length > 0 && (
              <div className="w-full h-full">
                <CandleChart data={chartData} />
              </div>
            )}
          </div>

          {/* Stats Dashboard Widgets */}
          {stats && !loading && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {/* Bar Count */}
              <div className="bg-[#0d1321]/60 border border-slate-900 rounded-2xl p-4 flex flex-col gap-1">
                <span className="text-xs text-slate-500 font-medium">Total Bars</span>
                <span className="text-lg font-bold text-slate-100">{stats.count}</span>
              </div>
              {/* Change Percent */}
              <div className="bg-[#0d1321]/60 border border-slate-900 rounded-2xl p-4 flex flex-col gap-1">
                <span className="text-xs text-slate-500 font-medium">Price Change %</span>
                <span className={`text-lg font-bold ${parseFloat(stats.change) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {parseFloat(stats.change) >= 0 ? '+' : ''}{stats.change}%
                </span>
              </div>
              {/* Highest Price */}
              <div className="bg-[#0d1321]/60 border border-slate-900 rounded-2xl p-4 flex flex-col gap-1">
                <span className="text-xs text-slate-500 font-medium">Highest</span>
                <span className="text-lg font-bold text-slate-100">{stats.highest}</span>
              </div>
              {/* Lowest Price */}
              <div className="bg-[#0d1321]/60 border border-slate-900 rounded-2xl p-4 flex flex-col gap-1">
                <span className="text-xs text-slate-500 font-medium">Lowest</span>
                <span className="text-lg font-bold text-slate-100">{stats.lowest}</span>
              </div>
              {/* Avg Volume */}
              <div className="bg-[#0d1321]/60 border border-slate-900 rounded-2xl p-4 flex flex-col gap-1 col-span-2 md:col-span-1">
                <span className="text-xs text-slate-500 font-medium">Average Volume</span>
                <span className="text-lg font-bold text-slate-100">{stats.avgVolume}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

export default App;
