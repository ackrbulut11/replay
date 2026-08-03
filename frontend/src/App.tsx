import { useState, useEffect, useCallback, useRef } from 'react';
import DashboardLayout from './layouts/DashboardLayout';
import CandleChart from './charts/CandleChart';
import { IndicatorsState } from './charts/IndicatorToolbar';
import { BarChart3, ChevronUp, ChevronDown, Bell } from 'lucide-react';
import { useReplayStore, replayStore } from './store/replayStore';
import { getWindow } from './services/marketApi';
import WatchlistPanel from './components/watchlist/WatchlistPanel';
import { watchlistStore } from './store/watchlistStore';
import { useChartSettingsStore, chartSettingsStore, DEFAULT_ACTIVE_INDICATORS } from './store/chartSettingsStore';
import { strategyStore } from './store/strategyStore';
import RightActionBar from './components/watchlist/RightActionBar';
import SymbolSearchModal from './components/SymbolSearchModal';
import StrategyPage from './pages/StrategyPage';
import AdminPage from './pages/AdminPage';
import JournalPage from './pages/JournalPage';
import AlertsPanel from './components/alerts/AlertsPanel';
import CreateAlarmModal from './components/alerts/CreateAlarmModal';
import { useAlertStore, alertStore } from './store/alertStore';
import ErrorBoundary from './components/ErrorBoundary';
import type { NavigationTab } from './components/Sidebar';
import { useAuth } from './context/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { LandingPage } from './pages/LandingPage';


interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Grafik ilk açıldığında hemen gösterilecek "hızlı" pencere — kalan geçmiş veri
// bu pencere yüklenip ekrana yazıldıktan sonra arkaplanda ayrıca çekilir.
// Böylece kullanıcı yıllarca veri istese bile grafik önce hızlıca görünür/
// işlem yapılabilir hale gelir.
const QUICK_WINDOW_DAYS: Record<string, number> = {
  '1m': 14,
  '5m': 30,
  '15m': 45,
  '1h': 120,
  '4h': 240,
  '1d': 730,
  '1w': 1825,
  '1mo': 3650,
};

function App() {
  const { isAuthenticated, isLoading, user } = useAuth();

  const [activeTab, setActiveTab] = useState<NavigationTab>('chart');
  // Oturum yoksa tanıtım sayfası mı giriş ekranı mı görünecek.
  const [showLogin, setShowLogin] = useState(false);

  const [provider, setProvider] = useState('binance');
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('1d');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  
  const [chartSettings, chartSettingsApi] = useChartSettingsStore();
  const { logScale } = chartSettings;
  const setLogScale = chartSettingsApi.setLogScale;
  const indicators = chartSettings.activeIndicators;

  const [chartData, setChartData] = useState<CandleData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isBackgroundLoading, setIsBackgroundLoading] = useState(false);
  const bgControllerRef = useRef<AbortController | null>(null);

  const [replayState] = useReplayStore();
  const [alertState] = useAlertStore();

  // İzleme listesi kullanıcıya bağlı olarak sunucuda tutuluyor; giriş
  // yapıldığında sunucudaki kopyayı yükle. Kullanıcı değişince tekrar çalışır.
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      watchlistStore.syncFromServer();
      // Tekli test geçmişi de kullanıcıya bağlı olarak sunucuda tutuluyor.
      strategyStore.fetchEvalHistory();
      // RSI ayarları ve çizim araçlarının varsayılan stilleri de kullanıcıya bağlı.
      chartSettingsStore.syncFromServer();
    }
  }, [isAuthenticated, user?.id]);

  // Admin sekmesinde yetkisi olmayan bir hesaba geçilirse (ör. çıkış yapıp
  // başka hesapla girince) kullanıcıyı boş bir hata ekranında bırakma.
  useEffect(() => {
    if (activeTab === 'admin' && !user?.is_admin) {
      setActiveTab('chart');
    }
  }, [activeTab, user?.is_admin]);

  // Replay sekmesine geçildiğinde Replay modunu aktif et, Grafik Analiz sekmesine dönüldüğünde ise Replay modunu otomatik kapat
  useEffect(() => {
    if (activeTab === 'replay') {
      replayStore.setState({ isReplayActive: true });
    } else if (activeTab === 'chart') {
      replayStore.reset();
    }
  }, [activeTab]);

  const handleEnableIndicators = useCallback((keys: (keyof IndicatorsState)[]) => {
    const next = { ...DEFAULT_ACTIVE_INDICATORS };
    keys.forEach((k) => {
      next[k] = true;
    });
    chartSettingsApi.setActiveIndicators(next);
  }, [chartSettingsApi]);

  const handleToggleIndicator = (key: keyof IndicatorsState) => {
    chartSettingsApi.toggleActiveIndicator(key);
  };

  // Arkaplanda gelen daha eski mumları mevcut chartData'nın başına ekler.
  // Replay aktifse currentIndex/cutoffIndex, chartData içindeki index'lere
  // referans verdiğinden, başa eklenen mum sayısı kadar kaydırılır — aksi
  // halde replay konumu sessizce yanlış muma kayar.
  const mergeOlderData = useCallback((olderData: CandleData[]) => {
    setChartData((prev) => {
      if (prev.length === 0 || olderData.length === 0) return prev;
      const existingTimes = new Set(prev.map((c) => c.time));
      const newBars = olderData.filter((c) => !existingTimes.has(c.time));
      if (newBars.length === 0) return prev;

      const merged = [...newBars, ...prev].sort((a, b) => a.time - b.time);
      const addedCount = merged.length - prev.length;

      const rs = replayStore.getState();
      if (rs.currentIndex !== null || rs.cutoffIndex !== null) {
        replayStore.setState((s) => ({
          currentIndex: s.currentIndex !== null ? s.currentIndex + addedCount : s.currentIndex,
          cutoffIndex: s.cutoffIndex !== null ? s.cutoffIndex + addedCount : s.cutoffIndex,
        }));
      }

      return merged;
    });
  }, []);

  const loadOlderDataInBackground = useCallback((params: {
    provider: string;
    symbol: string;
    timeframe: string;
    olderEnd: string;
    userStart: string | null;
  }) => {
    const controller = new AbortController();
    bgControllerRef.current = controller;
    setIsBackgroundLoading(true);

    const startParam = params.userStart ?? '';
    fetch(
      `/api/market/data?provider=${params.provider}&symbol=${params.symbol}&timeframe=${params.timeframe}&start=${startParam}&end=${params.olderEnd}`,
      { signal: controller.signal }
    )
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Geçmiş veri yüklenemedi.'))))
      .then((olderData: CandleData[]) => {
        if (controller.signal.aborted) return;
        mergeOlderData(olderData);
      })
      .catch((err: any) => {
        if (err?.name === 'AbortError') return;
        console.error("Background historical fetch failed:", err);
      })
      .finally(() => {
        if (bgControllerRef.current === controller) {
          setIsBackgroundLoading(false);
          bgControllerRef.current = null;
        }
      });
  }, [mergeOlderData]);

  const handleLoadChart = useCallback(async (signal: AbortSignal) => {
    if (!isAuthenticated) return;
    console.log("Fetching market data for:", { provider, symbol, timeframe, start, end });

    // Bir önceki arkaplan (geçmiş veri) isteği hâlâ sürüyorsa iptal et —
    // artık geçerli olmayan sembol/interval için sonuç birleştirilmesin.
    bgControllerRef.current?.abort();
    bgControllerRef.current = null;
    setIsBackgroundLoading(false);

    setLoading(true);
    setError(null);

    // ─── Replay: konuma çapalı pencere ──────────────────────────────────────
    // Replay sürerken tarih aralığıyla veri istemek maliyeti "konum ne kadar
    // geride" değişkenine bağlıyor: /data bitişik bir önbellek tuttuğu için
    // uzak bir tarihte aradaki tüm boşluğu indiriyor (15dk'da 2019 için ~210
    // sayfa, dakikalarca). /window ise hangi tarih olursa olsun sabit sayıda
    // mum çekiyor — ölçümde 2019 da 2022 de ~0,65 s.
    const replayPos = replayStore.getState();
    if (replayPos.isReplayActive && replayPos.targetTimestamp !== null) {
      try {
        const candles = await getWindow({
          provider,
          symbol,
          timeframe,
          anchor: replayPos.targetTimestamp,
        });
        if (signal.aborted) return;
        if (candles.length === 0) {
          setError('Bu zaman diliminde replay konumu için veri bulunamadı.');
          setChartData([]);
        } else {
          setChartData(candles);
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        console.error('Replay penceresi yüklenemedi:', err);
        setError(err?.message || 'Sunucu bağlantı hatası.');
        setChartData([]);
      } finally {
        if (!signal.aborted) setLoading(false);
      }
      return;
    }

    const userStart = start && start.trim() ? start : null;
    const endParam = end && end.trim() ? end : '';
    const quickDays = QUICK_WINDOW_DAYS[timeframe] ?? 365;
    const dayMs = 24 * 60 * 60 * 1000;
    const endDate = endParam ? new Date(endParam) : new Date();
    const quickStartDate = new Date(endDate.getTime() - quickDays * dayMs);
    const quickStartStr = quickStartDate.toISOString().slice(0, 10);

    // Kullanıcı zaten hızlı pencereden daha dar bir aralık istemişse
    // (örn. son 1 ay), arkaplanda ekstra bir şey yüklemeye gerek yok.
    const needsBackgroundExtend = !userStart || new Date(userStart) < quickStartDate;
    const initialStart = needsBackgroundExtend ? quickStartStr : (userStart ?? '');

    try {
      const response = await fetch(
        `/api/market/data?provider=${provider}&symbol=${symbol}&timeframe=${timeframe}&start=${initialStart}&end=${endParam}`,
        { signal }
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
        // Grafik artık görünür/işlem yapılabilir durumda — kalan geçmiş veriyi
        // arkaplanda çekmeye devam et (sıçrama olmadan başa eklenecek).
        if (needsBackgroundExtend) {
          loadOlderDataInBackground({ provider, symbol, timeframe, olderEnd: quickStartStr, userStart });
        }
      }
    } catch (err: any) {
      // Daha yeni bir istek başladığı için iptal edildi — bu istek artık
      // önemsiz; eski verinin ekrana yazılmasını (parite/interval etiketiyle
      // uyuşmayan grafik) burada engelliyoruz, hata da göstermiyoruz.
      if (err?.name === 'AbortError') return;
      console.error("Fetch data failed:", err);
      setError(err.message || 'Sunucu bağlantı hatası.');
      setChartData([]);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [provider, symbol, timeframe, start, end, isAuthenticated, loadOlderDataInBackground]);

  // Girdiler değiştiğinde grafiği otomatik olarak yükle (sembol yazımı için debounce uygulandı).
  // AbortController: bir önceki (henüz tamamlanmamış) istek burada iptal edilir; aksi halde
  // parite/interval hızlı değiştiğinde geç dönen eski bir yanıt, yeni seçili paritenin/interval'ın
  // üzerine eski (yanlış) mum verisini yazabilir (bkz. "1h seçili ama günlük gösteriyor" hatası).
  //
  // `isReplayActive` de bir tetikleyicidir: replay'de veri konuma çapalı bir
  // PENCERE olarak yükleniyor ve o pencere geçmişte bitiyor. Replay kapandığında
  // yeniden yüklenmezse grafik geçmişte takılı kalırdı.
  useEffect(() => {
    if (!isAuthenticated || !symbol || symbol.trim().length < 2) return;

    const controller = new AbortController();
    console.log("App inputs changed, setting reload timeout for:", { provider, symbol, timeframe, start, end });
    const timer = setTimeout(() => {
      handleLoadChart(controller.signal);
    }, 300);

    return () => {
      console.log("App inputs changed again, clearing previous timeout.");
      clearTimeout(timer);
      controller.abort();
      bgControllerRef.current?.abort();
    };
  }, [provider, symbol, timeframe, start, end, handleLoadChart, isAuthenticated, replayState.isReplayActive]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#070b13] flex items-center justify-center text-slate-300">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm font-medium text-slate-400">Oturum doğrulanıyor...</span>
        </div>
      </div>
    );
  }

  // Giriş yapılmadığında önce tanıtım sayfası açılır; giriş ekranı oradan
  // istenince gösterilir. Router yok, bu yüzden tek bir state yeterli.
  if (!isAuthenticated) {
    return showLogin ? (
      <LoginPage onBack={() => setShowLogin(false)} />
    ) : (
      <LandingPage onLogin={() => setShowLogin(true)} />
    );
  }


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

    // "Fiyat Değişimi" son 1 yıla göre hesaplanır; yüklü veri (grafik varsayılanına göre)
    // yıllarca geriye gidebildiğinden tüm aralığa göre hesap anlamsız derecede büyük
    // (%1000+) yüzdeler üretebiliyordu.
    const oneYearAgo = activeData[activeData.length - 1].time - 365 * 24 * 60 * 60;
    const lastYearData = activeData.filter(c => c.time >= oneYearAgo);
    const changeBase = lastYearData.length > 0 ? lastYearData : activeData;
    const firstPrice = changeBase[0].open;
    const lastPrice = changeBase[changeBase.length - 1].close;
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
      {activeTab === 'admin' ? (
        <ErrorBoundary fallbackTitle="Admin Paneli Hatası">
          <AdminPage />
        </ErrorBoundary>
      ) : activeTab === 'journal' ? (
        <ErrorBoundary fallbackTitle="İşlem Günlüğü Hatası">
          <JournalPage />
        </ErrorBoundary>
      ) : activeTab === 'strategy' ? (
        <ErrorBoundary fallbackTitle="Strateji Ekranı Hatası">
          <StrategyPage
            onSelectTab={setActiveTab}
            setSymbol={setSymbol}
            setProvider={setProvider}
            setTimeframe={setTimeframe}
            onEnableIndicators={handleEnableIndicators}
            currentSymbol={symbol}
            currentTimeframe={timeframe}
          />
        </ErrorBoundary>
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
                onSelectTab={setActiveTab}
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

            {/* Açılır / Kapanır Alarmlar Paneli */}
            <AlertsPanel
              currentSymbol={symbol}
              currentProvider={provider}
              currentPrice={chartData.length > 0 ? chartData[chartData.length - 1].close : undefined}
              onOpenCreateModal={() =>
                alertStore.openCreateModal(
                  symbol,
                  provider,
                  chartData.length > 0 ? chartData[chartData.length - 1].close : undefined
                )
              }
              onSelectSymbol={(newSym, newProv) => {
                setSymbol(newSym);
                setProvider(newProv);
              }}
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

          {/* Global Alarm Oluşturma Modalı */}
          <CreateAlarmModal
            isOpen={alertState.isCreateModalOpen}
            onClose={() => alertStore.closeCreateModal()}
            currentSymbol={alertState.modalSymbol || symbol}
            currentProvider={alertState.modalProvider || provider}
            currentPrice={
              alertState.modalCurrentPrice ??
              (chartData.length > 0 ? chartData[chartData.length - 1].close : undefined)
            }
          />

          {/* Tetiklenen Alarm Ekran Uyarı Modalı ve Ses Kapatma */}
          {alertState.latestTriggeredAlert && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fadeIn select-none">
              <div className="bg-[#0d1321] border-2 border-amber-500/80 shadow-2xl shadow-amber-500/30 rounded-2xl p-6 max-w-sm w-full flex flex-col items-center text-center space-y-4 animate-scaleUp">
                <div className="p-3.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-lg shadow-amber-500/20 animate-bounce">
                  <Bell className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-amber-400 uppercase tracking-wide">
                    🔔 Alarm Tetiklendi!
                  </h3>
                  <p className="text-sm font-bold text-slate-100 font-mono mt-1">
                    {alertState.latestTriggeredAlert.symbol} • {alertState.latestTriggeredAlert.target_type}{' '}
                    {alertState.latestTriggeredAlert.condition === 'rises_above' ? '>' : '<'}{' '}
                    {typeof alertState.latestTriggeredAlert.threshold_value === 'number'
                      ? alertState.latestTriggeredAlert.threshold_value.toFixed(2)
                      : alertState.latestTriggeredAlert.threshold_value}
                  </p>
                  {alertState.latestTriggeredAlert.last_value && (
                    <p className="text-xs text-slate-400 font-mono mt-1">
                      Mevcut Fiyat:{' '}
                      <span className="text-amber-400 font-bold">{alertState.latestTriggeredAlert.last_value}</span>
                    </p>
                  )}
                  {alertState.latestTriggeredAlert.note && (
                    <p className="text-xs text-slate-300 italic mt-2 bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                      "{alertState.latestTriggeredAlert.note}"
                    </p>
                  )}
                </div>

                <button
                  onClick={() => alertStore.dismissTriggeredAlert()}
                  className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-bold rounded-xl shadow-lg transition-all text-sm cursor-pointer"
                >
                  Tamam (Sesi Kapat)
                </button>
              </div>
            </div>
          )}


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
                  {isBackgroundLoading && (
                    <span className="text-[10px] text-indigo-400 font-medium select-none animate-pulse">
                      geçmiş veri yükleniyor…
                    </span>
                  )}
                </div>
                
                <div className="flex items-center gap-4">
                  {!isStatsOpen && (
                    <div className="flex items-center gap-4 text-[11px] font-medium text-slate-400 font-sans">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500 font-semibold select-none">Fiyat Değişimi (1Y):</span>
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
                    <span className="text-[10px] text-slate-500 font-medium uppercase select-none">Price Change (1Y)</span>
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
