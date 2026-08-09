/**
 * BatchScannerTab — Çoklu Sembol Strateji Tarama & Fırsat Tablosu.
 *
 * Stratejinin tüm Binance, BIST veya Nasdaq sembollerinde eşzamanlı taranıp
 * metriklerle (Tamamlanan İşlem, Win Rate, Kazanan/Kaybeden, Toplam Net PnL)
 * listelenmesini, yukarı çekilebilir ayarlanabilir panelle tüm sembollerin görünmesini
 * ve kalıcı saklanmasını sağlar.
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Play,
  RotateCw,
  LineChart,
  TrendingUp,
  TrendingDown,
  Filter,
  Search,
  History,
  Calendar,
  AlertCircle,
  GripHorizontal,
} from 'lucide-react';
import type { Strategy, BatchEvaluateResultItem, ScanHistoryItem } from '../types/strategy';
import { strategyApi } from '../services/strategyApi';
import { useWatchlistStore } from '../store/watchlistStore';

interface BatchScannerTabProps {
  strategy: Strategy;
  onSelectSymbolAndShowChart: (symbol: string, provider: string, timeframe: string, limitBars: number) => void;
}

interface ScanGroup {
  id: string;
  name: string;
  provider: string;
  symbols: string[];
  // Yalnızca Favoriler grubunda bulunur: birden fazla sağlayıcıya ait sembolleri taşır
  entries?: { provider: string; symbol: string }[];
}

// Hazır Sembol Grupları
const PRESET_GROUPS: ScanGroup[] = [
  {
    id: 'binance_top',
    name: 'Binance USDT Popüler Çiftler (30 Sembol)',
    provider: 'binance',
    symbols: [
      'BTCUSDT',
      'ETHUSDT',
      'SOLUSDT',
      'BNBUSDT',
      'XRPUSDT',
      'ADAUSDT',
      'DOGEUSDT',
      'AVAXUSDT',
      'LINKUSDT',
      'MATICUSDT',
      'DOTUSDT',
      'NEARUSDT',
      'ATOMUSDT',
      'LTCUSDT',
      'ETCUSDT',
      'FETUSDT',
      'RENDERUSDT',
      'SUIUSDT',
      'INJUSDT',
      'ARBUSDT',
      'OPUSDT',
      'APTUSDT',
      'TIAUSDT',
      'FTMUSDT',
      'STXUSDT',
      'FILUSDT',
      'TRXUSDT',
      'PEPEUSDT',
      'WIFUSDT',
      'SHIBUSDT',
    ],
  },
  {
    id: 'bist_100',
    name: 'BIST 100 Öncü Hisseler (20 Sembol)',
    provider: 'bist',
    symbols: [
      'THYAO',
      'GARAN',
      'AKBNK',
      'ISCTR',
      'EREGL',
      'ASELS',
      'KCHOL',
      'SAHOL',
      'TUPRS',
      'BIMAS',
      'SISE',
      'YKBNK',
      'KOZAL',
      'FROTO',
      'TOASO',
      'KRDMD',
      'PETKM',
      'ODAS',
      'TCELL',
      'TTKOM',
    ],
  },
  {
    id: 'nasdaq_top',
    name: 'Nasdaq 100 Dev Şirketler (20 Sembol)',
    provider: 'nasdaq',
    symbols: [
      'AAPL',
      'MSFT',
      'NVDA',
      'AMZN',
      'GOOGL',
      'META',
      'TSLA',
      'AVGO',
      'COST',
      'AMD',
      'NFLX',
      'PEP',
      'TMUS',
      'ADBE',
      'CSCO',
      'INTU',
      'AMAT',
      'QCOM',
      'AMGN',
      'TXN',
      'HON',
    ],
  },
  {
    id: 'forex_top',
    name: 'Forex (FX) Pariteleri (20 Parite)',
    provider: 'forex',
    symbols: [
      'EUR/USD',
      'GBP/USD',
      'USD/JPY',
      'USD/CHF',
      'AUD/USD',
      'USD/CAD',
      'NZD/USD',
      'EUR/JPY',
      'EUR/GBP',
      'EUR/CHF',
      'GBP/JPY',
      'AUD/JPY',
      'USD/TRY',
      'EUR/TRY',
      'USD/CNH',
      'USD/SGD',
      'USD/INR',
      'USD/MXN',
      'USD/ZAR',
      'USD/HKD',
    ],
  },
];

// Strateji testinde izin verilen azami mum sayısı (backend ile aynı sınır)
const MAX_LIMIT_BARS = 10000;

// Tabloda gösterilen her satıra, hangi sağlayıcıdan geldiğini de taşıyan biçim
// (Favoriler taraması birden fazla sağlayıcının sonucunu tek listede birleştirir).
type DisplayResultItem = BatchEvaluateResultItem & { provider: string };

function withProvider(items: BatchEvaluateResultItem[], provider: string): DisplayResultItem[] {
  return items.map((item) => ({ ...item, provider }));
}

export default function BatchScannerTab({
  strategy,
  onSelectSymbolAndShowChart,
}: BatchScannerTabProps) {
  const [watchlistState] = useWatchlistStore();

  // Kullanıcının Favoriler listesine eklediği tüm semboller — hangi borsada/sağlayıcıda
  // olduğuna bakılmaksızın tek bir grup olarak sunulur. Tarama backend'i tek seferde tek
  // provider kabul ettiği için, taşıma anında sağlayıcıya göre ayrı isteklere bölünüp
  // sonuçlar tek tabloda birleştirilir (bkz. runFavoriScan).
  const favoriGroup = useMemo((): ScanGroup | null => {
    const favorilerList = watchlistState.lists.find((g) => g.id === 'favoriler');
    const items = favorilerList ? favorilerList.items : [];
    if (items.length === 0) return null;
    return {
      id: 'favoriler_all',
      name: `⭐ Favorilerim (${items.length} Sembol)`,
      provider: '',
      symbols: items.map((i) => i.symbol),
      entries: items.map((i) => ({ provider: i.provider, symbol: i.symbol })),
    };
  }, [watchlistState.lists]);

  const allGroups = useMemo(
    () => (favoriGroup ? [favoriGroup, ...PRESET_GROUPS] : PRESET_GROUPS),
    [favoriGroup]
  );

  const [selectedGroup, setSelectedGroup] = useState(PRESET_GROUPS[0].id);
  const [timeframe, setTimeframe] = useState('1d');
  const [limitBars, setLimitBars] = useState(1000);

  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<{ done: number; total: number } | null>(null);

  // Sonuçlar ve Geçmiş
  const [results, setResults] = useState<DisplayResultItem[]>([]);
  const [latestScanTime, setLatestScanTime] = useState<string | null>(null);
  const [historyList, setHistoryList] = useState<ScanHistoryItem[]>([]);
  const [selectedScanId, setSelectedScanId] = useState<string>('');

  // Filtreleme & Arama
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'profitable' | 'signals_only'>('all');
  const [sortBy, setSortBy] = useState<'pnl' | 'win_rate' | 'trades' | 'symbol'>('pnl');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Tablo başlığına tıklanınca sıralama alanını değiştirir; aynı başlığa tekrar
  // tıklanırsa yönü (büyükten küçüğe / küçükten büyüğe) tersine çevirir.
  // İlk tıklama her zaman büyükten küçüğe başlar.
  const handleHeaderSort = (field: 'pnl' | 'win_rate' | 'trades' | 'symbol') => {
    if (sortBy === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
  };

  // Üst Panel Yüksekliği State & Sürükleme Mantığı (Tutacak yukarı çekildikçe üst panel küçülür, tablo büyür)
  const [topHeight, setTopHeight] = useState<number>(310);
  const isDraggingRef = useRef(false);
  const dragStartYRef = useRef(0);
  const dragStartHeightRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    dragStartYRef.current = e.clientY;
    dragStartHeightRef.current = topHeight;

    const onMouseMove = (me: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const deltaY = me.clientY - dragStartYRef.current;
      const newHeight = Math.max(90, Math.min(window.innerHeight - 220, dragStartHeightRef.current + deltaY));
      
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = requestAnimationFrame(() => {
        setTopHeight(newHeight);
      });
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
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

  const handleGroupChange = (groupId: string) => {
    setSelectedGroup(groupId);
  };

  // Sayfa yüklendiğinde stratejinin kayıtlı son tarama sonuçlarını getir
  useEffect(() => {
    let isMounted = true;
    async function loadScans() {
      try {
        const data = await strategyApi.getScanHistory(strategy.id);
        if (isMounted && data.latest) {
          setResults(withProvider(data.latest.results || [], data.latest.provider || 'binance'));
          setLatestScanTime(data.latest.created_at);
          setTimeframe(data.latest.timeframe || '1d');
          setSelectedScanId(data.latest.scan_id);

          // Sayfa, tarama hâlâ arka planda devam ederken yenilenmiş olabilir; kaldığı yerden takibe devam et
          if (data.latest.status === 'running') {
            setIsScanning(true);
            setScanProgress({ done: data.latest.scanned_count, total: data.latest.total_symbols ?? data.latest.scanned_count });
            activeScanIdRef.current = data.latest.scan_id;
            pollScanStatus(data.latest.scan_id);
          }
        }
        if (isMounted && data.scans) {
          setHistoryList(data.scans);
        }
      } catch (err) {
        console.error('Kayıtlı tarama yüklenemedi:', err);
      }
    }
    loadScans();
    return () => {
      isMounted = false;
    };
  }, [strategy.id]);

  // Tarama artık backend'de arka planda (background job) çalışır: bir HTTP
  // isteği hiçbir zaman uzun sürmediği için Vercel'in harici proxy zaman
  // aşımına (ROUTER_EXTERNAL_TARGET_ERROR) takılmaz. Frontend sadece
  // ilerlemeyi belirli aralıklarla sorgular (polling).
  const POLL_INTERVAL_MS = 1500;
  const MAX_POLL_FAILURES = 5;
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeScanIdRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
  }, []);

  const pollScanStatus = (scanId: string, failureCount = 0) => {
    const tick = async () => {
      // Kullanıcı bu arada yeni bir tarama başlattıysa eski döngüyü sonlandır
      if (activeScanIdRef.current !== scanId) return;

      try {
        const scan = await strategyApi.getScanStatus(strategy.id, scanId);
        setResults(withProvider(scan.results, scan.provider));
        setScanProgress({ done: scan.scanned_count, total: scan.total_symbols ?? scan.scanned_count });

        if (scan.status === 'running') {
          pollTimeoutRef.current = setTimeout(() => pollScanStatus(scanId, 0), POLL_INTERVAL_MS);
          return;
        }

        setLatestScanTime(scan.created_at);
        if (scan.status === 'error') {
          setScanError(scan.error || 'Tarama sırasında bir hata oluştu');
        }
        setScanProgress(null);
        setIsScanning(false);

        const historyData = await strategyApi.getScanHistory(strategy.id);
        if (historyData.scans) {
          setHistoryList(historyData.scans);
        }
      } catch (err: any) {
        // Geçici ağ hatası olabilir; birkaç kez daha dene, sonra pes et
        if (failureCount + 1 >= MAX_POLL_FAILURES) {
          setScanError(err.message || 'Tarama durumu sorgulanırken bağlantı hatası oluştu');
          setScanProgress(null);
          setIsScanning(false);
          return;
        }
        pollTimeoutRef.current = setTimeout(() => pollScanStatus(scanId, failureCount + 1), POLL_INTERVAL_MS);
      }
    };

    tick();
  };

  // Favoriler grubu birden fazla sağlayıcı içerebilir: her sağlayıcı için ayrı bir
  // arka plan taraması başlatılır, sırayla tamamlanması beklenir ve sonuçlar tek
  // tabloda (sağlayıcı etiketiyle) birleştirilir.
  const runFavoriScan = async (entries: { provider: string; symbol: string }[]) => {
    const byProvider = new Map<string, string[]>();
    entries.forEach(({ provider: prov, symbol }) => {
      const list = byProvider.get(prov) || [];
      list.push(symbol);
      byProvider.set(prov, list);
    });

    setScanProgress({ done: 0, total: entries.length });

    const collected: DisplayResultItem[] = [];
    const doneCounts = new Map<string, number>();
    let firstError: string | null = null;

    for (const [prov, symbols] of byProvider) {
      try {
        const scan = await strategyApi.batchEvaluateStrategy(strategy.id, {
          symbols,
          provider: prov,
          timeframe,
          limit_bars: limitBars,
          allow_short: strategy.allow_short,
        });
        activeScanIdRef.current = scan.scan_id;

        const finalScan = await new Promise<ScanHistoryItem>((resolve) => {
          const tick = async (failureCount = 0) => {
            try {
              const s = await strategyApi.getScanStatus(strategy.id, scan.scan_id);
              doneCounts.set(prov, s.scanned_count);
              const totalDone = Array.from(doneCounts.values()).reduce((a, b) => a + b, 0);
              setScanProgress({ done: totalDone, total: entries.length });
              setResults([...collected, ...withProvider(s.results, prov)]);

              if (s.status === 'running') {
                pollTimeoutRef.current = setTimeout(() => tick(0), POLL_INTERVAL_MS);
                return;
              }
              resolve(s);
            } catch (err: any) {
              if (failureCount + 1 >= MAX_POLL_FAILURES) {
                resolve({
                  scan_id: '',
                  strategy_id: strategy.id,
                  strategy_name: strategy.name,
                  provider: prov,
                  timeframe,
                  created_at: new Date().toISOString(),
                  scanned_count: 0,
                  status: 'error',
                  error: err.message || `${prov} taraması sorgulanırken bağlantı hatası oluştu`,
                  results: [],
                });
                return;
              }
              pollTimeoutRef.current = setTimeout(() => tick(failureCount + 1), POLL_INTERVAL_MS);
            }
          };
          tick();
        });

        if (finalScan.status === 'error') {
          firstError = firstError || finalScan.error || `${prov} taraması sırasında hata oluştu`;
        }
        collected.push(...withProvider(finalScan.results, prov));
        setResults([...collected]);
      } catch (err: any) {
        firstError = firstError || err.message || `${prov} taraması başlatılırken bir hata oluştu`;
      }
    }

    if (firstError) setScanError(firstError);
    setLatestScanTime(new Date().toISOString());
    setSelectedScanId('');
    setScanProgress(null);
    setIsScanning(false);

    const historyData = await strategyApi.getScanHistory(strategy.id);
    if (historyData.scans) setHistoryList(historyData.scans);
  };

  // Taramayı Çalıştır — backend'de arka plan taramasını başlatır ve anında
  // dönen scan_id ile ilerlemeyi sorgulamaya başlar.
  const handleRunScan = async () => {
    const group = allGroups.find((g) => g.id === selectedGroup);
    if (!group) return;

    if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    activeScanIdRef.current = null;
    setIsScanning(true);
    setScanError(null);
    setResults([]);

    if (group.entries) {
      await runFavoriScan(group.entries);
      return;
    }

    setScanProgress({ done: 0, total: group.symbols.length });

    try {
      const scan = await strategyApi.batchEvaluateStrategy(strategy.id, {
        symbols: group.symbols,
        provider: group.provider,
        timeframe: timeframe,
        limit_bars: limitBars,
        allow_short: strategy.allow_short,
      });
      activeScanIdRef.current = scan.scan_id;
      setSelectedScanId(scan.scan_id);
      pollScanStatus(scan.scan_id);
    } catch (err: any) {
      setScanError(err.message || 'Tarama başlatılırken bir hata oluştu');
      setScanProgress(null);
      setIsScanning(false);
    }
  };

  // Filtrelenmiş ve Sıralanmış Sonuçlar
  const processedResults = useMemo(() => {
    let list = [...results];

    // Arama
    if (searchQuery.trim()) {
      const query = searchQuery.toUpperCase();
      list = list.filter((r) => r.symbol.includes(query));
    }

    // Filtre Modu
    if (filterMode === 'profitable') {
      list = list.filter((r) => r.total_pnl_percent > 0);
    } else if (filterMode === 'signals_only') {
      list = list.filter((r) => r.total_trades > 0);
    }

    // Sıralama
    list.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'pnl') {
        cmp = a.total_pnl_percent - b.total_pnl_percent;
      } else if (sortBy === 'win_rate') {
        cmp = a.win_rate - b.win_rate;
      } else if (sortBy === 'trades') {
        cmp = a.total_trades - b.total_trades;
      } else {
        cmp = a.symbol.localeCompare(b.symbol);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [results, searchQuery, filterMode, sortBy, sortDir]);

  // Özet İstatistikler
  const summaryStats = useMemo(() => {
    if (results.length === 0) return null;

    const totalTradesSum = results.reduce((acc, r) => acc + r.total_trades, 0);
    const totalWinningSum = results.reduce((acc, r) => acc + r.winning_trades, 0);
    const totalLosingSum = results.reduce((acc, r) => acc + r.losing_trades, 0);
    const avgWinRate =
      totalTradesSum > 0 ? (totalWinningSum / totalTradesSum) * 100 : 0;
    const avgPnl =
      results.reduce((acc, r) => acc + r.total_pnl_percent, 0) / results.length;

    return {
      totalScanned: results.length,
      totalTrades: totalTradesSum,
      totalWinning: totalWinningSum,
      totalLosing: totalLosingSum,
      avgWinRate: avgWinRate.toFixed(1),
      avgPnl: avgPnl.toFixed(2),
    };
  }, [results]);

  return (
    <div className="flex flex-col h-full bg-[#070b13] overflow-hidden">
      {/* Üst Ayarlanabilir Kontrol & Özet Paneli */}
      <div
        style={{ height: `${topHeight}px` }}
        className="flex-shrink-0 p-4 space-y-3 bg-[#070b13] overflow-y-auto custom-scrollbar border-b border-slate-800/60"
      >

        <div className="bg-[#0d1321]/90 border border-slate-800/80 rounded-2xl p-4 space-y-4 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Filter className="w-4 h-4 text-indigo-400" />
                Çoklu Sembol Strateji Taraması
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Tanımlı kuralları tüm piyasa sembollerinde aynı anda çalıştırın ve karlı fırsatları bulun.
              </p>
            </div>

            {/* Geçmiş Taramalar Seçicisi & Tarih */}
            <div className="flex items-center gap-2 flex-wrap">
              {historyList.length > 0 && (
                <div className="flex items-center gap-1.5 bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-xl text-xs text-slate-400">
                  <History className="w-3.5 h-3.5 text-amber-400" />
                  <span>Geçmiş Tarama Seç:</span>
                  <select
                    value={selectedScanId}
                    onChange={(e) => {
                      const scan = historyList.find((s) => s.scan_id === e.target.value);
                      if (scan) {
                        setSelectedScanId(scan.scan_id);
                        setResults(withProvider(scan.results, scan.provider));
                        setLatestScanTime(scan.created_at);
                        setTimeframe(scan.timeframe);
                        setScanError(null);
                        // "Sembol Grubu" seçicisi de geçmiş taramanın piyasasını yansıtsın;
                        // aksi halde seçici eski değerde kalıp hiçbir şey değişmemiş izlenimi verir.
                        const matchingGroup = PRESET_GROUPS.find((g) => g.provider === scan.provider);
                        if (matchingGroup) {
                          setSelectedGroup(matchingGroup.id);
                        }
                      }
                    }}
                    className="bg-slate-950 border border-slate-700/80 text-slate-200 text-xs rounded-lg px-2 py-0.5 outline-none font-mono"
                  >
                    <option value="" disabled>
                      Bir tarama seçin...
                    </option>
                    {historyList
                      .filter((scan) => scan.status !== 'running')
                      .map((scan) => (
                        <option key={scan.scan_id} value={scan.scan_id}>
                          {new Date(scan.created_at).toLocaleString('tr-TR')} ({scan.provider} - {scan.timeframe})
                          {scan.status === 'error' ? ' — hata' : ''}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {latestScanTime && (
                <div className="flex items-center gap-1.5 bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-xl text-xs text-slate-400">
                  <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Son Tarama:</span>
                  <span className="text-slate-200 font-mono font-semibold">
                    {new Date(latestScanTime).toLocaleString('tr-TR')}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Tarama Parametreleri */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
            {/* Sembol Grubu */}
            <div className="md:col-span-5">
              <label className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold block mb-1">
                Sembol Grubu
              </label>
              <select
                value={selectedGroup}
                onChange={(e) => handleGroupChange(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700/80 text-slate-200 text-xs rounded-xl px-3 py-2 outline-none focus:border-indigo-500 transition-colors"
              >
                {allGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Zaman Dilimi */}
            <div className="md:col-span-3">
              <label className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold block mb-1">
                Zaman Dilimi (Timeframe)
              </label>
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700/80 text-slate-200 text-xs rounded-xl px-3 py-2 outline-none focus:border-indigo-500 transition-colors"
              >
                <option value="15m">15 Dakika (15m)</option>
                <option value="1h">1 Saat (1h)</option>
                <option value="4h">4 Saat (4h)</option>
                <option value="1d">1 Gün (1d)</option>
              </select>
            </div>

            {/* Mum Limiti */}
            <div className="md:col-span-2">
              <label className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold block mb-1">
                Mum Limiti
              </label>
              <input
                type="number"
                max={MAX_LIMIT_BARS}
                value={limitBars}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setLimitBars(Number.isNaN(val) ? 1000 : Math.min(val, MAX_LIMIT_BARS));
                }}
                className="w-full bg-slate-950 border border-slate-700/80 text-slate-200 text-xs rounded-xl px-3 py-2 outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            {/* Çalıştır Butonu */}
            <div className="md:col-span-2 flex items-end">
              <button
                onClick={handleRunScan}
                disabled={isScanning}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-500/20 transition-all cursor-pointer"
              >
                {isScanning ? (
                  <>
                    <RotateCw className="w-4 h-4 animate-spin text-white" />
                    {scanProgress ? `Taranıyor (${scanProgress.done}/${scanProgress.total})` : 'Tarayan...'}
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white" />
                    Taramayı Başlat
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Hata Mesajı */}
          {scanError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 flex items-center gap-2 text-xs text-red-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{scanError}</span>
            </div>
          )}
        </div>

        {/* Özet Metrik Kartları */}
        {summaryStats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-fadeIn">
            {/* Tamamlanan İşlem */}
            <div className="bg-[#0d1321]/80 border border-slate-800/80 rounded-xl p-3 flex flex-col justify-between">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                TAMAMLANAN İŞLEM
              </span>
              <span className="text-xl font-extrabold text-slate-100 font-mono mt-1">
                {summaryStats.totalTrades}
              </span>
            </div>

            {/* Başarı Oranı (Win Rate) */}
            <div className="bg-[#0d1321]/80 border border-emerald-500/30 rounded-xl p-3 flex flex-col justify-between">
              <span className="text-[10px] text-emerald-400/90 uppercase tracking-wider font-bold">
                BAŞARI ORANI (WIN RATE)
              </span>
              <span className="text-xl font-extrabold text-emerald-400 font-mono mt-1">
                %{summaryStats.avgWinRate}
              </span>
            </div>

            {/* Kazanan / Kaybeden */}
            <div className="bg-[#0d1321]/80 border border-slate-800/80 rounded-xl p-3 flex flex-col justify-between">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                KAZANAN / KAYBEDEN
              </span>
              <div className="text-xl font-extrabold font-mono mt-1 flex items-center gap-1">
                <span className="text-emerald-400">{summaryStats.totalWinning}</span>
                <span className="text-slate-500">/</span>
                <span className="text-red-400">{summaryStats.totalLosing}</span>
              </div>
            </div>

            {/* Ort. Net Kar/Zarar */}
            <div
              className={`bg-[#0d1321]/80 border rounded-xl p-3 flex flex-col justify-between ${
                parseFloat(summaryStats.avgPnl) > 0
                  ? 'border-emerald-500/30'
                  : parseFloat(summaryStats.avgPnl) < 0
                  ? 'border-red-500/30'
                  : 'border-slate-800/80'
              }`}
            >
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                ORTALAMA NET KAR/ZARAR
              </span>
              <span
                className={`text-xl font-extrabold font-mono mt-1 ${
                  parseFloat(summaryStats.avgPnl) > 0
                    ? 'text-emerald-400'
                    : parseFloat(summaryStats.avgPnl) < 0
                    ? 'text-red-400'
                    : 'text-slate-400'
                }`}
              >
                {parseFloat(summaryStats.avgPnl) > 0 ? '+' : ''}
                {summaryStats.avgPnl}%
              </span>
            </div>

          </div>
        )}
      </div>

      {/* Sürükle-Bırak Ayırıcı Çizgi (Yukarı Çekilerek Tabloyu Büyütme Çubuğu) */}
      <div
        onMouseDown={handleMouseDownResize}
        onDoubleClick={() => setTopHeight(310)}
        className="group relative h-3 bg-[#070b13] hover:bg-indigo-600/40 border-t border-b border-slate-800/80 cursor-row-resize flex items-center justify-center transition-colors select-none z-20 flex-shrink-0"
        title="Yukarı / Aşağı sürükleyerek tablo alanını genişletin (Çift tık: Varsayılan boyut)"
      >
        <div className="w-16 h-1 rounded-full bg-slate-700/80 group-hover:bg-indigo-400 transition-colors flex items-center justify-center">
          <GripHorizontal className="w-3.5 h-3.5 text-slate-400 group-hover:text-white" />
        </div>
      </div>

      {/* Aşağıdaki Tablo Paneli — flex-1 min-h-0 ile Tüm Ekran Genişliğinde Büyür */}
      <div className="flex-1 min-h-0 flex flex-col p-4 bg-[#070b13] space-y-2 overflow-hidden">
        {/* Tablo Arama & Sıralama Filtreleri */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/40 p-2 rounded-xl border border-slate-800/60 flex-shrink-0">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <div className="relative w-full max-w-xs">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Sembol Ara (ör. BTC, THY)..."
                className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg pl-8 pr-3 py-1.5 outline-none focus:border-indigo-500"
              />
            </div>
            <select
              value={filterMode}
              onChange={(e: any) => setFilterMode(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-lg px-2.5 py-1.5 outline-none"
            >
              <option value="all">Tüm Semboller ({results.length})</option>
              <option value="profitable">Sadece Karlı Olanlar (+PnL)</option>
              <option value="signals_only">İşlem Üretenler</option>
            </select>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>Sırala:</span>
            <select
              value={sortBy}
              onChange={(e: any) => {
                setSortBy(e.target.value);
                setSortDir('desc');
              }}
              className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 outline-none font-medium"
            >
              <option value="pnl">En Yüksek Net Kar (% PnL)</option>
              <option value="win_rate">En Yüksek Win Rate (%)</option>
              <option value="trades">İşlem Sayısına Göre</option>
              <option value="symbol">Sembol Adı (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Tüm Sembollerin Listelendiği Kaydırılabilir Metrik Tablosu */}
        <div className="flex-1 min-h-0 bg-[#0d1321] border border-slate-800/80 rounded-2xl overflow-y-auto custom-scrollbar shadow-xl">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-900 border-b border-slate-800">
              <tr className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                <th className="py-3 px-4">SEMBOL</th>
                <th
                  onClick={() => handleHeaderSort('trades')}
                  className="py-3 px-4 text-center cursor-pointer select-none hover:text-slate-200 transition-colors"
                  title="Tamamlanan işlem sayısına göre sırala"
                >
                  TAMAMLANA İŞLEM{sortBy === 'trades' ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ''}
                </th>
                <th
                  onClick={() => handleHeaderSort('win_rate')}
                  className="py-3 px-4 text-center cursor-pointer select-none hover:text-slate-200 transition-colors"
                  title="Başarı oranına (Win Rate) göre sırala"
                >
                  BAŞARI ORANI (WIN RATE){sortBy === 'win_rate' ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ''}
                </th>
                <th className="py-3 px-4 text-center">KAZANAN / KAYBEDEN</th>
                <th
                  onClick={() => handleHeaderSort('pnl')}
                  className="py-3 px-4 text-center cursor-pointer select-none hover:text-slate-200 transition-colors"
                  title="Toplam net kar/zarara göre sırala"
                >
                  TOPLAM NET KAR/ZARAR{sortBy === 'pnl' ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ''}
                </th>
                <th className="py-3 px-4 text-right">AKSİYON</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {processedResults.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500 italic">
                    {results.length === 0
                      ? 'Henüz bir tarama yapmadınız. "Taramayı Başlat" butonuna tıklayarak fırsatları listeleyin.'
                      : 'Arama ve filtrenize uygun sembol bulunamadı.'}
                  </td>
                </tr>
              ) : (
                processedResults.map((item) => {
                  return (
                    <tr

                      key={`${item.provider}-${item.symbol}`}
                      className="hover:bg-slate-800/40 transition-colors group"
                    >
                      {/* Sembol */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-100 font-mono text-sm">
                            {item.symbol}
                          </span>
                          <span className="text-[10px] text-slate-500 uppercase bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 font-mono">
                            {item.provider}
                          </span>
                        </div>
                      </td>

                      {/* Tamamlanan İşlem */}
                      <td className="py-3 px-4 text-center font-mono font-bold text-slate-200">
                        {item.total_trades}
                      </td>

                      {/* Başarı Oranı (Win Rate) */}
                      <td className="py-3 px-4 text-center font-mono font-bold">
                        <span
                          className={`px-2 py-1 rounded-lg text-xs ${
                            item.win_rate >= 50
                              ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
                              : item.win_rate > 0
                              ? 'text-amber-400 bg-amber-500/10 border border-amber-500/20'
                              : 'text-slate-400 bg-slate-800/40'
                          }`}
                        >
                          %{item.win_rate.toFixed(1)}
                        </span>
                      </td>

                      {/* Kazanan / Kaybeden */}
                      <td className="py-3 px-4 text-center font-mono font-bold">
                        <div className="inline-flex items-center gap-1 bg-slate-900/80 px-2.5 py-1 rounded-lg border border-slate-800">
                          <span className={item.winning_trades > 0 ? 'text-emerald-400' : 'text-slate-400'}>
                            {item.winning_trades}
                          </span>
                          <span className="text-slate-600">/</span>
                          <span className={item.losing_trades > 0 ? 'text-red-400' : 'text-slate-400'}>
                            {item.losing_trades}
                          </span>
                        </div>
                      </td>

                      {/* Toplam Net Kar/Zarar */}
                      <td className="py-3 px-4 text-center font-mono font-bold text-sm">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border ${
                            item.total_pnl_percent > 0
                              ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30'
                              : item.total_pnl_percent < 0
                              ? 'text-red-400 bg-red-500/15 border-red-500/30'
                              : 'text-slate-400 bg-slate-800/40 border-slate-700/50'
                          }`}
                        >
                          {item.total_pnl_percent > 0 && <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />}
                          {item.total_pnl_percent < 0 && <TrendingDown className="w-3.5 h-3.5 text-red-400" />}
                          {item.total_pnl_percent > 0 ? '+' : ''}
                          {item.total_pnl_percent.toFixed(2)}%
                        </span>
                      </td>


                      {/* Aksiyon: Grafikte Göster */}
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() =>
                            onSelectSymbolAndShowChart(item.symbol, item.provider, timeframe, limitBars)
                          }
                          className="inline-flex items-center gap-1.5 py-1 px-3 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 rounded-xl font-semibold text-xs transition-all active:scale-95 cursor-pointer shadow-sm"
                          title={`${item.symbol} sembolünü grafikte aç`}
                        >
                          <LineChart className="w-3.5 h-3.5" />
                          Grafikte Göster
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
