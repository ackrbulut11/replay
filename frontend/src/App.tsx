import { useState, useEffect, useCallback, useRef } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import PublicOnlyRoute from './components/PublicOnlyRoute';
import DashboardLayout from './layouts/DashboardLayout';
import CandleChart from './charts/CandleChart';
import { IndicatorsState } from './charts/IndicatorToolbar';
import { BarChart3, ChevronUp, ChevronDown, Bell } from 'lucide-react';
import { useReplayStore, replayStore } from './store/replayStore';
import { getRange, getWindow } from './services/marketApi';
import WatchlistPanel from './components/watchlist/WatchlistPanel';
import { watchlistStore, useWatchlistStore } from './store/watchlistStore';
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
  /**
   * Mumun geldiği zaman dilimi — yalnızca replay konumu ulaşılabilen
   * geçmişten eskiyse dolu olur: geçmiş bölüm bir üst dilimin mumlarıyla
   * doldurulmuş demektir (bkz. backend loader `_prepend_display_fill`).
   */
  tf?: string;
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

// Replay'de veri, konuma çapalı bir PENCERE olarak gelir (bkz. handleLoadChart).
// O pencere ilk boyamayı hızlı tutmak için dardır; manuel backtest içinse konumun
// gerisi dar kalmamalı — "geriye 500 mum" ile sağlıklı test yapılamıyordu.
// Pencere ekrana çizildikten sonra bu kadar mum daha, arkaplanda ve ekrandaki en
// eski muma çapalanarak geriye doğru eklenir (backend'de bars_before tavanı 5000).
const REPLAY_HISTORY_BARS = 5000;

// Gün içi dilimlerde derinleştirme bilerek daha dar tutulur. Sebep tarayıcı
// değil veri kaynağı: 1dk/5dk/15dk geçmişi Yahoo'nun intraday tavanının
// (1dk 6 gün, 5dk/15dk 58 gün, 1s 700 gün) gerisinde Twelve Data'dan geliyor ve
// 5000 mumluk bir istek orada çok sayfalı bir indirmeye dönüşüyor — ölçümde
// 1g -> 15dk geçişinin arkaplan derinleştirmesi 16 sn. 2500 mum manuel backtest
// için hâlâ fazlasıyla yeterli ve tek sayfada karşılanıyor.
const REPLAY_HISTORY_BARS_INTRADAY = 2500;

// Derinleştirme isteği, ön plan penceresi ekrana geldikten sonra bu kadar
// beklemeden gönderilmez. Zaman dilimleri arasında hızlıca gezinen bir kullanıcı
// eskiden her adımda bir derinleştirme başlatıyordu; istek istemci tarafında
// iptal edilse bile backend onu sonuna kadar çalıştırıyor ve süreç genelindeki
// Twelve Data throttle'ını işgal ediyordu — yani BİR SONRAKİ geçiş, artık kimsenin
// beklemediği bir isteğin arkasında kuyruğa giriyordu. Gecikme, ancak kullanıcı
// bir dilimde durakladığında derinleştirme yapılmasını sağlar.
const REPLAY_HISTORY_DELAY_MS = 1200;

// İleri yön. Pencere ilerisi 1000 mumla bitiyor ve oynatma tam orada duruyordu
// (CandleChart'ın playback timer'ı `nextIdx >= data.length` olunca isPlaying'i
// kapatıyor) — replay'de zaman dilimi değiştiren biri 1000 mum sonra duvara
// tosluyordu. İmleç sona TRIGGER mum kala bir sonraki dilim arkaplanda çekilir;
// yetiştiği sürece oynatma hiç kesilmez.
//
// TRIGGER, en hızlı oynatma ayarında bile isteğin yetişeceği kadar geniş:
// 300 mum × 100 ms = 30 sn.
const REPLAY_FORWARD_TRIGGER = 300;
const REPLAY_FORWARD_BARS = 2000;

const INTRADAY_TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h'];

/**
 * Henüz yazılmamış sekmelerin boş durum metinleri.
 *
 * Her biri kullanıcıyı bugün aynı işi gören ekrana yönlendirir — yol haritası
 * maddesini tekrar etmek, o an bir şey yapmak isteyen birine yardım etmiyor.
 */
const PENDING_TABS: Record<string, { title: string; body: string }> = {
  scanner: {
    title: 'Scanner henüz burada değil',
    body: 'Tüm listeyi tek kuralla taramak için şimdilik Strateji Motoru içindeki toplu tarama sekmesini kullanabilirsiniz.',
  },
  backtest: {
    title: 'Backtest raporları hazırlanıyor',
    body: 'Özkaynak eğrisi ve drawdown grafikleri bu sekmeye gelecek. Bir kuralın geçmiş performansını bugün Strateji Motoru üzerinden ölçebilirsiniz.',
  },
};

/**
 * Bir mumun zamanını kullanıcıya yazdırır.
 *
 * UTC kullanılır: lightweight-charts zaman eksenini varsayılan olarak UTC
 * yazıyor (grafikte localization ayarı yok), yerel saatle biçimlendirmek
 * metni eksendeki mumdan saatlerce kaydırırdı.
 *
 * Gün içi dilimlerde saat de yazılır — aynı gün içindeki bir konum yalnızca
 * tarihle belirsiz kalırdı. Gün başına denk gelen (günlük ve üzeri dilimlerden
 * gelmiş) zaman damgalarında saat "00:00" gürültüsü yazılmaz.
 */
function formatBarTime(timeSec: number, timeframe: string): string {
  const date = new Date(timeSec * 1000);
  const day = date.toLocaleDateString('tr-TR', { timeZone: 'UTC' });
  if (!INTRADAY_TIMEFRAMES.includes(timeframe) || timeSec % 86400 === 0) return day;
  const time = date.toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
  return `${day} ${time}`;
}

function MainApp() {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const getTabFromPath = useCallback((path: string): NavigationTab => {
    const subPath = path.replace('/app', '').replace(/^\//, '');
    if (['strategy', 'replay', 'scanner', 'backtest', 'journal', 'admin'].includes(subPath)) {
      return subPath as NavigationTab;
    }
    return 'chart';
  }, []);

  const activeTab = getTabFromPath(location.pathname);

  const handleSelectTab = useCallback((tab: NavigationTab) => {
    navigate(`/app/${tab}`);
  }, [navigate]);

  // "/app" kısayolu grafik sekmesine karşılık gelir; URL'i her zaman
  // "/app/chart" olarak normalize et.
  useEffect(() => {
    if (location.pathname === '/app' || location.pathname === '/app/') {
      navigate('/app/chart', { replace: true });
    }
  }, [location.pathname, navigate]);

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
  // Grafiği engellemeyen bilgilendirme (ör. replay konumu bu zaman diliminde
  // yok, en eski muma taşındı). Hatadan farkı: veri VAR, sadece istenen yerde
  // değil — bu yüzden tam ekran hata katmanı değil, kapatılabilir bir şerit.
  const [notice, setNotice] = useState<string | null>(null);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isBackgroundLoading, setIsBackgroundLoading] = useState(false);
  const bgControllerRef = useRef<AbortController | null>(null);
  // Gecikmeli derinleştirme zamanlayıcısı (bkz. REPLAY_HISTORY_DELAY_MS).
  const bgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Arkaplan derinleştirmesini iptal eder: henüz gönderilmemişse zamanlayıcıyı,
   * gönderilmişse isteği. İkisini ayrı ayrı temizlemek kolayca unutuluyordu —
   * zamanlayıcı kalırsa iptal edilmiş bir geçişin isteği 1,2 sn sonra yine
   * gidiyordu.
   */
  const cancelBackgroundLoad = useCallback(() => {
    if (bgTimerRef.current !== null) {
      clearTimeout(bgTimerRef.current);
      bgTimerRef.current = null;
    }
    bgControllerRef.current?.abort();
    bgControllerRef.current = null;
    // Göstergeyi burada söndürmek şart: istek henüz DOĞMAMIŞSA (zamanlayıcı
    // iptal edildi) isteğin `finally` bloğu hiç çalışmaz ve gösterge sonsuza
    // kadar "yükleniyor" kalırdı.
    setIsBackgroundLoading(false);
  }, []);

  const [replayState] = useReplayStore();
  const [alertState] = useAlertStore();
  const [watchlistState] = useWatchlistStore();

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
      handleSelectTab('chart');
    }
  }, [activeTab, user?.is_admin, handleSelectTab]);

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

  // chartData'nın senkron kopyası + tek yazma noktası.
  //
  // Birleştirme, güncel diziyi setChartData(prev => ...) içinden okuyamaz:
  // React StrictMode güncelleyici fonksiyonu iki kez çağırıyor ve içerideki
  // replay index kaydırması iki kez uygulanıyordu (imleç sessizce ileri sıçrar).
  //
  // Ref render beklenmeden yazılır: yeni pencere ekrana verildikten milisaniyeler
  // sonra dönen bir arkaplan yanıtı, aksi halde bir ÖNCEKİ sembolün dizisiyle
  // birleşirdi (önbellekten dönen istekler bu kadar hızlı).
  const chartDataRef = useRef<CandleData[]>([]);
  const applyChartData = useCallback((data: CandleData[]) => {
    chartDataRef.current = data;
    setChartData(data);
  }, []);

  // Arkaplanda gelen daha eski mumları mevcut chartData'nın başına ekler.
  // Replay aktifse currentIndex/cutoffIndex, chartData içindeki index'lere
  // referans verdiğinden, başa eklenen mum sayısı kadar kaydırılır — aksi
  // halde replay konumu sessizce yanlış muma kayar.
  const mergeOlderData = useCallback((olderData: CandleData[]) => {
    const prev = chartDataRef.current;
    if (prev.length === 0 || olderData.length === 0) return;

    const existingTimes = new Set(prev.map((c) => c.time));
    const newBars = olderData.filter((c) => !existingTimes.has(c.time));
    if (newBars.length === 0) return;

    const merged = [...newBars, ...prev].sort((a, b) => a.time - b.time);
    applyChartData(merged);

    const rs = replayStore.getState();
    if (rs.currentIndex !== null || rs.cutoffIndex !== null) {
      replayStore.setState((s) => ({
        currentIndex: s.currentIndex !== null ? s.currentIndex + newBars.length : s.currentIndex,
        cutoffIndex: s.cutoffIndex !== null ? s.cutoffIndex + newBars.length : s.cutoffIndex,
      }));
    }
  }, [applyChartData]);

  // Yeni (ileri yöndeki) mumları dizinin SONUNA ekler ve eklenen sayıyı döndürür.
  //
  // Burada index kaydırması yoktur: currentIndex/cutoffIndex dizinin başından
  // sayılır, sona eklemek onları etkilemez. Eklenen mumlar imlecin ilerisinde
  // kaldığı için ekranda da görünmez — `visibleData` diziyi currentIndex'te
  // kesiyor (lookahead sızıntısı yok, ileri tampon zaten böyle çalışıyordu).
  const mergeNewerData = useCallback((newerData: CandleData[]) => {
    const prev = chartDataRef.current;
    if (prev.length === 0 || newerData.length === 0) return 0;

    const lastTime = prev[prev.length - 1].time;
    const newBars = newerData.filter((c) => c.time > lastTime);
    if (newBars.length === 0) return 0;

    applyChartData([...prev, ...newBars]);
    return newBars.length;
  }, [applyChartData]);

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

    // Doğrudan fetch değil servis katmanı: token'sız istek 401 alır
    // (piyasa uçları artık giriş gerektiriyor).
    getRange({
      provider: params.provider,
      symbol: params.symbol,
      timeframe: params.timeframe,
      start: params.userStart ?? '',
      end: params.olderEnd,
      signal: controller.signal,
    })
      .then((olderData) => {
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

  // Replay penceresinin gerisini arkaplanda derinleştirir.
  //
  // Çapa olarak ekrandaki EN ESKİ mum kullanılır: böylece yalnızca onun gerisi
  // istenir, elde olan aralık ikinci kez indirilmez. Sonuç mergeOlderData ile
  // başa eklenir — orası replay index'lerini de kaydırdığı için konum kaymaz.
  const loadOlderWindowInBackground = useCallback((params: {
    provider: string;
    symbol: string;
    timeframe: string;
    oldestTime: number;
  }) => {
    const controller = new AbortController();
    bgControllerRef.current = controller;

    // Gecikmeli gönderim (bkz. REPLAY_HISTORY_DELAY_MS): kullanıcı bu süre
    // içinde başka bir dilime geçerse istek hiç doğmaz. Zamanlayıcı ref'te
    // tutulur; iptal yolları (cancelBackgroundLoad) onu da temizler.
    clearTimeout(bgTimerRef.current ?? undefined);
    bgTimerRef.current = setTimeout(() => {
      bgTimerRef.current = null;
      if (controller.signal.aborted) return;
      // Gösterge, istek GERÇEKTEN başladığında yanar: gecikme süresi boyunca
      // "yükleniyor" göstermek yanıltıcı olurdu, henüz bir şey yüklenmiyor.
      setIsBackgroundLoading(true);

      getWindow({
        provider: params.provider,
        symbol: params.symbol,
        timeframe: params.timeframe,
        anchor: params.oldestTime,
        barsBefore: INTRADAY_TIMEFRAMES.includes(params.timeframe)
          ? REPLAY_HISTORY_BARS_INTRADAY
          : REPLAY_HISTORY_BARS,
        barsAfter: 1,
        signal: controller.signal,
      })
        .then((older) => {
          if (controller.signal.aborted) return;
          mergeOlderData(older);
        })
        .catch((err: any) => {
          // İptal edilmiş istek: sembol/zaman dilimi değişti, sonucu birleştirme.
          if (controller.signal.aborted || err?.name === 'AbortError') return;
          console.error('Replay geçmiş penceresi yüklenemedi:', err);
        })
        .finally(() => {
          if (bgControllerRef.current === controller) {
            setIsBackgroundLoading(false);
            bgControllerRef.current = null;
          }
        });
    }, REPLAY_HISTORY_DELAY_MS);
  }, [mergeOlderData]);

  // İleri yön uzatması. Ayrı bir controller kullanır: geçmiş yüklemesiyle
  // birbirlerini iptal etmemeleri gerekir, ikisi aynı anda sürebiliyor.
  const forwardControllerRef = useRef<AbortController | null>(null);
  // "Bu son mumun ilerisinde veri yok" işareti — anahtar son mumu içerdiği için
  // canlı piyasada yeni mum oluştuğunda kendiliğinden geçersizleşir.
  const forwardExhaustedRef = useRef<string | null>(null);

  const extendReplayForward = useCallback((key: string, lastTime: number) => {
    const controller = new AbortController();
    forwardControllerRef.current = controller;

    getWindow({
      provider,
      symbol,
      timeframe,
      anchor: lastTime,
      barsBefore: 1,
      barsAfter: REPLAY_FORWARD_BARS,
      signal: controller.signal,
    })
      .then((newer) => {
        if (controller.signal.aborted) return;
        // Hiç yeni mum yoksa "şimdi"ye yetişilmiştir; aynı uçta ısrarla istek
        // atmamak için işaretle.
        if (mergeNewerData(newer) === 0) forwardExhaustedRef.current = key;
      })
      .catch((err: any) => {
        if (controller.signal.aborted || err?.name === 'AbortError') return;
        console.error('Replay ileri penceresi yüklenemedi:', err);
      })
      .finally(() => {
        if (forwardControllerRef.current === controller) {
          forwardControllerRef.current = null;
        }
      });
  }, [provider, symbol, timeframe, mergeNewerData]);

  const handleLoadChart = useCallback(async (signal: AbortSignal) => {
    if (!isAuthenticated) return;
    console.log("Fetching market data for:", { provider, symbol, timeframe, start, end });

    // Bir önceki arkaplan (geçmiş/ileri veri) isteği hâlâ sürüyorsa iptal et —
    // artık geçerli olmayan sembol/interval için sonuç birleştirilmesin.
    cancelBackgroundLoad();
    forwardControllerRef.current?.abort();
    forwardControllerRef.current = null;
    forwardExhaustedRef.current = null;

    setLoading(true);
    setError(null);
    setNotice(null);

    // ─── Replay: konuma çapalı pencere ──────────────────────────────────────
    // Replay sürerken tarih aralığıyla veri istemek maliyeti "konum ne kadar
    // geride" değişkenine bağlıyor: /data bitişik bir önbellek tuttuğu için
    // uzak bir tarihte aradaki tüm boşluğu indiriyor (15dk'da 2019 için ~210
    // sayfa, dakikalarca). /window ise hangi tarih olursa olsun sabit sayıda
    // mum çekiyor — ölçümde 2019 da 2022 de ~0,65 s.
    const replayPos = replayStore.getState();
    if (replayPos.isReplayActive && replayPos.targetTimestamp !== null) {
      const target = replayPos.targetTimestamp;
      try {
        const candles = await getWindow({
          provider,
          symbol,
          timeframe,
          anchor: target,
        });
        if (signal.aborted) return;

        // Çapa bu dilimin kendi sağlayıcı geçmişinden eskiyse backend pencereyi
        // bu dilimin EN ESKİ mumuna çapalar ve gerisine (varsa) bir üst dilimden
        // salt görsel bir dolgu ekler (bkz. loader `_prepend_display_fill`) —
        // dolgu satırları `tf` alanıyla etiketlenir, ASIL konum hâlâ dolgu
        // OLMAYAN ilk mumdur. `candles[0].time > target` yerine bu mumu aramak
        // gerekiyor: dolgu geçmişe target'tan daha da eskiye uzanabiliyor.
        const fineStartIdx = candles.findIndex((c) => !c.tf || c.tf === timeframe);
        const fineFirst = fineStartIdx >= 0 ? candles[fineStartIdx] : null;
        const hasDisplayFill = fineStartIdx > 0;

        if (candles.length === 0) {
          setError('Bu zaman diliminde replay konumu için veri bulunamadı.');
          applyChartData([]);
        } else if (fineFirst && fineFirst.time > target) {
          // Konum bu dilimde yok: en eski ulaşılabilir muma taşı ve durumu
          // şeritle bildir. İkincil kaynağa (Twelve Data) düşülmez, konum başka
          // bir dilimle "korunmaz" (bkz. TradingView'in Bar Replay'i de derinliği
          // aynı şekilde sağlayıcının kendi geçmişiyle sınırlıyor) — yalnızca
          // gerideki dolgu salt görsel bağlam sağlar.
          applyChartData(candles);
          replayStore.setState({
            targetTimestamp: fineFirst.time,
            currentIndex: hasDisplayFill ? fineStartIdx : 0,
            cutoffIndex: hasDisplayFill ? fineStartIdx : 0,
            isPlaying: false,
          });
          setNotice(
            `${timeframe} verisi replay konumunuza (${formatBarTime(target, timeframe)}) kadar geriye ` +
              `uzanmıyor. Konum, ${timeframe} dilimindeki ulaşılabilen en eski muma ` +
              `(${formatBarTime(fineFirst.time, timeframe)}) taşındı.` +
              (hasDisplayFill
                ? ` Gerisi yalnızca görsel bağlam için ${candles[0].tf} mumlarıyla gösteriliyor.`
                : ' Daha eskiye gitmek için daha büyük bir zaman dilimi seçin.')
          );
          // Daha eskisi yok: arkaplan derinleştirmesi boşuna istek olurdu.
        } else {
          applyChartData(candles);
          // Pencere ekranda ve işlem yapılabilir durumda; konumun gerisini
          // arkaplanda derinleştir (bkz. REPLAY_HISTORY_BARS).
          loadOlderWindowInBackground({
            provider,
            symbol,
            timeframe,
            oldestTime: candles[0].time,
          });
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        console.error('Replay penceresi yüklenemedi:', err);
        setError(err?.message || 'Sunucu bağlantı hatası.');
        applyChartData([]);
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
      // Doğrudan fetch değil servis katmanı: token'sız istek 401 alır
      // (piyasa uçları artık giriş gerektiriyor).
      const data = await getRange({
        provider,
        symbol,
        timeframe,
        start: initialStart,
        end: endParam,
        signal,
      });
      console.log(`Fetched ${data.length} data points.`);
      if (data.length === 0) {
        setError('Belirtilen tarih aralığında veri bulunamadı. Lütfen önce bu veriyi indirdiğinizden emin olun.');
        applyChartData([]);
      } else {
        applyChartData(data);
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
      applyChartData([]);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [provider, symbol, timeframe, start, end, isAuthenticated, applyChartData, cancelBackgroundLoad, loadOlderDataInBackground, loadOlderWindowInBackground]);

  // Girdiler değiştiğinde grafiği otomatik olarak yükle (sembol yazımı için debounce uygulandı).
  // AbortController: bir önceki (henüz tamamlanmamış) istek burada iptal edilir; aksi halde
  // parite/interval hızlı değiştiğinde geç dönen eski bir yanıt, yeni seçili paritenin/interval'ın
  // üzerine eski (yanlış) mum verisini yazabilir (bkz. "1h seçili ama günlük gösteriyor" hatası).
  //
  // Replay'den ÇIKIŞ da bir tetikleyicidir: replay'de veri konuma çapalı bir
  // PENCERE olarak yükleniyor ve o pencere geçmişte bitiyor; yeniden
  // yüklenmezse grafik geçmişte takılı kalırdı.
  //
  // Replay'e GİRİŞTE ise yeniden yüklenmez. Yüklenirse o an ekranda olan tüm
  // geçmiş (ör. 1g'de 3274 mum) 1500 mumluk pencereye düşüyor ve "grafikte
  // istediğin yere kes" akışı bozuluyordu — kullanıcı yalnızca birkaç yüz mum
  // geriye kesebiliyordu. Giriş anında zaten yüklü veri konumu kapsıyor
  // (çapa son mum), pencereye ihtiyaç yok; pencere asıl olarak replay
  // sürerken zaman dilimi değişince devreye giriyor.
  const wasReplayActiveRef = useRef(replayState.isReplayActive);
  const replayExitCount = useRef(0);
  if (wasReplayActiveRef.current !== replayState.isReplayActive) {
    if (wasReplayActiveRef.current && !replayState.isReplayActive) {
      replayExitCount.current += 1;
    }
    wasReplayActiveRef.current = replayState.isReplayActive;
  }

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
      cancelBackgroundLoad();
      forwardControllerRef.current?.abort();
    };
  }, [provider, symbol, timeframe, start, end, handleLoadChart, isAuthenticated, cancelBackgroundLoad, replayExitCount.current]);

  // İmleç yüklü verinin sonuna yaklaştıysa ileri yönü uzat.
  //
  // Replay'e girişte veri zaten "şimdi"ye kadar yüklü olduğundan ilk istek boş
  // döner ve bir daha denenmez; asıl işe yaradığı yer replay sürerken sembol/
  // zaman dilimi değişince gelen, ilerisi 1000 mumla biten penceredir.
  useEffect(() => {
    if (!replayState.isReplayActive || loading) return;
    if (replayState.currentIndex === null || chartData.length === 0) return;
    if (chartData.length - 1 - replayState.currentIndex > REPLAY_FORWARD_TRIGGER) return;
    // Sürmekte olan bir uzatma varsa ikincisini başlatma.
    if (forwardControllerRef.current) return;

    const lastTime = chartData[chartData.length - 1].time;
    const key = `${provider}|${symbol}|${timeframe}|${lastTime}`;
    if (forwardExhaustedRef.current === key) return;

    extendReplayForward(key, lastTime);
  }, [
    replayState.isReplayActive,
    replayState.currentIndex,
    chartData,
    loading,
    provider,
    symbol,
    timeframe,
    extendReplayForward,
  ]);




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
    <DashboardLayout activeTab={activeTab} onSelectTab={handleSelectTab}>
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
            onSelectTab={handleSelectTab}
            setSymbol={setSymbol}
            setProvider={setProvider}
            setTimeframe={setTimeframe}
            onEnableIndicators={handleEnableIndicators}
            currentSymbol={symbol}
            currentTimeframe={timeframe}
          />
        </ErrorBoundary>
      ) : activeTab === 'chart' || activeTab === 'replay' ? (
        <div className="flex h-full w-full flex-col gap-2 overflow-hidden bg-canvas p-2">
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
                notice={notice}
                onDismissNotice={() => setNotice(null)}
                onOpenSearchModal={() => setIsSearchModalOpen(true)}
                onSelectTab={handleSelectTab}
              />
            </div>

            {/* Dar ekranda yan paneller grafiğin ÜSTÜNE açılıyor (bkz.
                WatchlistPanel/AlertsPanel); arkadaki grafiğe yanlışlıkla
                dokunulmasın ve panel tek dokunuşla kapanabilsin diye zemin.
                `lg`den itibaren paneller yan yana durduğu için zemin yok. */}
            {watchlistState.isOpen && (
              <div
                aria-hidden
                onClick={() => watchlistStore.togglePanel()}
                className="sheet-backdrop absolute inset-0 z-30 animate-fadeIn lg:hidden"
              />
            )}

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

          {/* Tetiklenen Alarm Ekran Uyarı Modalı ve Ses Kapatma.
              Kesintiye uğratan bir bildirim zaten dikkat çekiyor; zıplayan
              ikon, emoji ve renkli hale onu daha okunur yapmıyor. Bilgi
              hiyerarşisi: hangi sembol, hangi koşul, şu an ne durumda. */}
          {alertState.latestTriggeredAlert && (
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="triggered-alert-title"
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn"
            >
              <div className="w-full max-w-[380px] rounded-xl border border-warn-500/40 bg-surface-overlay shadow-xl animate-scaleUp">
                <div className="flex items-center gap-2.5 border-b border-line px-5 py-3.5">
                  <Bell className="h-4 w-4 shrink-0 text-warn-400" strokeWidth={1.75} />
                  <h3 id="triggered-alert-title" className="text-sm font-medium text-warn-300">
                    Alarm tetiklendi
                  </h3>
                </div>

                <div className="px-5 py-4">
                  <p className="font-mono text-lg text-content-strong">
                    {alertState.latestTriggeredAlert.symbol}
                  </p>
                  <p className="mt-1 font-mono text-sm text-content-muted">
                    {alertState.latestTriggeredAlert.target_type}{' '}
                    {alertState.latestTriggeredAlert.condition === 'rises_above' ? '>' : '<'}{' '}
                    {typeof alertState.latestTriggeredAlert.threshold_value === 'number'
                      ? alertState.latestTriggeredAlert.threshold_value.toFixed(2)
                      : alertState.latestTriggeredAlert.threshold_value}
                  </p>

                  {alertState.latestTriggeredAlert.last_value && (
                    <div className="mt-4 flex items-baseline justify-between border-t border-line-subtle pt-3">
                      <span className="text-xs text-content-faint">Mevcut fiyat</span>
                      <span className="font-mono text-sm text-content-strong">
                        {alertState.latestTriggeredAlert.last_value}
                      </span>
                    </div>
                  )}

                  {alertState.latestTriggeredAlert.note && (
                    <p className="mt-3 border-l border-line-strong pl-3 text-xs leading-relaxed text-content-muted">
                      {alertState.latestTriggeredAlert.note}
                    </p>
                  )}
                </div>

                <div className="border-t border-line px-5 py-3">
                  <button
                    autoFocus
                    onClick={() => alertStore.dismissTriggeredAlert()}
                    className="w-full rounded-md bg-accent-400 px-4 py-2 text-sm font-medium text-ink-950 transition-colors ease-out hover:bg-accent-300"
                  >
                    Kapat ve sesi durdur
                  </button>
                </div>
              </div>
            </div>
          )}


          {/* Yüklü veri özeti (açılır-kapanır şerit).
              Eskiden açıldığında beş özdeş kart açılıyordu; kartın taşıdığı
              tek şey bir etiket ve bir sayıydı. Ayraçla bölünmüş tek satır
              hem daha az yer kaplıyor hem de sayıları aynı taban çizgisinde
              tuttuğu için gözle karşılaştırılabilir kılıyor. */}
          {stats && !loading && (
            <div className="overflow-hidden rounded-lg border border-line bg-surface">
              <button
                onClick={() => setIsStatsOpen(!isStatsOpen)}
                aria-expanded={isStatsOpen}
                className="flex w-full items-center justify-between gap-4 px-3.5 py-2 text-left transition-colors ease-out hover:bg-surface-hover"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <BarChart3 className="h-3.5 w-3.5 shrink-0 text-content-faint" strokeWidth={1.75} />
                  <span className="text-xs font-medium text-content">Yüklü veri</span>
                  <span className="font-mono text-2xs text-content-faint">{stats.count} mum</span>
                  {isBackgroundLoading && (
                    <span className="text-2xs text-content-faint">· geçmiş yükleniyor</span>
                  )}
                </div>

                <div className="flex items-center gap-3.5">
                  {!isStatsOpen && (
                    <div className="hidden items-center gap-3.5 text-xs sm:flex">
                      <span className="text-content-faint">1 yıl</span>
                      <span
                        className={`font-mono ${
                          parseFloat(stats.change) >= 0 ? 'text-profit-400' : 'text-loss-400'
                        }`}
                      >
                        {parseFloat(stats.change) >= 0 ? '+' : ''}
                        {stats.change}%
                      </span>
                      <span className="h-3 w-px bg-line-strong" />
                      <span className="text-content-faint">En yüksek</span>
                      <span className="font-mono text-content">{stats.highest}</span>
                      <span className="h-3 w-px bg-line-strong" />
                      <span className="text-content-faint">En düşük</span>
                      <span className="font-mono text-content">{stats.lowest}</span>
                    </div>
                  )}
                  {isStatsOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-content-muted" strokeWidth={1.75} />
                  ) : (
                    <ChevronUp className="h-3.5 w-3.5 shrink-0 text-content-muted" strokeWidth={1.75} />
                  )}
                </div>
              </button>

              {isStatsOpen && (
                <dl className="grid animate-fadeIn grid-cols-2 border-t border-line-subtle sm:grid-cols-3 lg:grid-cols-5">
                  {[
                    ['Mum sayısı', stats.count, ''],
                    [
                      'Değişim (1 yıl)',
                      `${parseFloat(stats.change) >= 0 ? '+' : ''}${stats.change}%`,
                      parseFloat(stats.change) >= 0 ? 'text-profit-400' : 'text-loss-400',
                    ],
                    ['En yüksek', stats.highest, ''],
                    ['En düşük', stats.lowest, ''],
                    ['Ortalama hacim', stats.avgVolume, ''],
                  ].map(([label, value, tone]) => (
                    <div
                      key={label as string}
                      className="border-b border-r border-line-subtle px-3.5 py-2.5 last:border-r-0 sm:border-b-0"
                    >
                      <dt className="text-2xs text-content-faint">{label}</dt>
                      <dd
                        className={`mt-1 font-mono text-sm ${
                          (tone as string) || 'text-content-strong'
                        }`}
                      >
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Henüz yazılmamış sekmeler.
           Boş durum "burada bir şey yok" demez: neyin eksik olduğunu ve şu an
           hangi ekranın aynı işi gördüğünü söyler. Sekme adı ham anahtar
           (`backtest`) yerine kullanıcının menüde gördüğü adla yazılır. */
        <div className="flex h-full w-full items-center justify-center bg-canvas p-8">
          <div className="max-w-[340px]">
            <h3 className="text-lg text-content-strong">{PENDING_TABS[activeTab]?.title ?? 'Bu modül'}</h3>
            <p className="mt-2.5 text-sm leading-relaxed text-content-muted">
              {PENDING_TABS[activeTab]?.body ??
                'Bu bölüm yol haritasındaki sonraki fazda açılacak.'}
            </p>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

export function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <PublicOnlyRoute>
            <LandingPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <LoginPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/app/*"
        element={
          <ProtectedRoute>
            <MainApp />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
