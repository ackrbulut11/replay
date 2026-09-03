import { useState, useEffect, useRef } from 'react';
import { Search, X, Building2, Globe2, Coins, TrendingUp, Sparkles, Bookmark, Banknote, LineChart, Gem } from 'lucide-react';
import { useWatchlistStore, watchlistStore } from '../store/watchlistStore';
import { searchSymbols } from '../services/marketApi';
import { useDialogFocus } from '../hooks/useDialogFocus';

export interface SymbolItem {
  symbol: string;
  name: string;
  sector?: string;
  exchange: string;
  ticker?: string;
}

/** Arama sonuçlarını daraltan piyasa sekmeleri. */
const MARKET_TABS = [
  { id: 'all', label: 'Tümü', icon: Sparkles },
  { id: 'nasdaq', label: 'NASDAQ & US', icon: Globe2 },
  { id: 'forex', label: 'Forex', icon: Banknote },
  { id: 'binance', label: 'Kripto', icon: Coins },
  { id: 'bist', label: 'BIST', icon: Building2 },
  { id: 'index', label: 'Endeksler', icon: LineChart },
  { id: 'commodity', label: 'Emtia', icon: Gem },
] as const;

interface SymbolSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSymbol: (symbol: string, provider: string) => void;
  currentProvider: string;
}

export default function SymbolSearchModal({
  isOpen,
  onClose,
  onSelectSymbol,
  currentProvider,
}: SymbolSearchModalProps) {
  // Reactive watchlist state so bookmark icons update instantly
  const [watchlistState] = useWatchlistStore();

  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<string>('all');
  const [results, setResults] = useState<SymbolItem[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useDialogFocus(isOpen, onClose, inputRef);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      fetchSymbols(query, activeTab);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      fetchSymbols(query, activeTab);
    }, 150);
    return () => clearTimeout(timer);
  }, [query, activeTab, isOpen]);


  const fetchSymbols = async (q: string, tab: string) => {
    setLoading(true);
    try {
      // Doğrudan fetch değil servis katmanı: token'sız istek 401 alır
      // (piyasa uçları artık giriş gerektiriyor).
      setResults(await searchSymbols(q, tab === 'all' ? undefined : tab));
    } catch (e) {
      console.error('Failed to search symbols', e);
    } finally {
      setLoading(false);
    }
  };

  const getProviderFromExchange = (exchange: string): string => {
    const ex = exchange.toUpperCase();
    if (ex === 'BIST') return 'bist';
    if (ex === 'NASDAQ' || ex === 'NYSE') return 'nasdaq';
    if (ex === 'BINANCE') return 'binance';
    if (ex === 'FOREX' || ex === 'FX') return 'forex';
    // Endeksler ve emtialar Yahoo Finance üzerinden nasdaq sağlayıcısıyla çekilir.
    if (ex === 'INDEX' || ex === 'COMMODITY') return 'nasdaq';
    return currentProvider;
  };

  const handleSelect = (item: SymbolItem) => {
    const provider = getProviderFromExchange(item.exchange);
    onSelectSymbol(item.symbol, provider);
    onClose();
  };

  if (!isOpen) return null;

  return (
    /* `px-4`: paneller `w-full` olduğu için yatay boşluk olmadan telefonda
       ekranın iki kenarına yapışıyordu. */
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-16 bg-black/70 backdrop-blur-xs animate-fadeIn"
      onClick={onClose}
    >
      {/* Modal Card */}
      <div 
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="symbol-search-title"
        tabIndex={-1}
        className="w-full max-w-2xl bg-canvas border border-white/[0.1] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] text-content-strong"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="symbol-search-title" className="sr-only">Sembol ara</h2>
        {/* Search Header Input */}
        <div className="p-4 border-b border-line flex items-center gap-3 bg-canvas">
          <Search className="w-5 h-5 text-accent-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Hisse kodu, parite veya şirket adı girin (ör: EUR/USD, THYAO, AAPL)..."
            aria-label="Sembol veya şirket ara"
            className="w-full bg-transparent text-sm text-content-strong placeholder-content-faint outline-none font-medium"
          />
          {query && (
            <button 
              onClick={() => setQuery('')}
              aria-label="Aramayı temizle"
              className="p-1 text-content-faint hover:text-content rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Sembol aramayı kapat"
            className="px-2.5 py-1 text-xs font-medium text-content-muted hover:text-content bg-white/[0.04] rounded-lg border border-line"
          >
            ESC
          </button>
        </div>

        {/* Kategori sekmeleri.
            Önceden yedi sekme elle yazılmıştı ve her biri kendi rengini
            taşıyordu: NASDAQ mavi, BIST kırmızı, emtia sarı… Aktif sekme
            hangi kategori seçildiğine göre renk değiştirince "aktif" işareti
            okunaksız hale geliyordu. Artık tek liste, tek aktif stil. */}
        <div
          role="tablist"
          className="flex select-none flex-wrap items-center gap-1 border-b border-line px-3 py-2"
        >
          {MARKET_TABS.map(({ id, label, icon: Icon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors ease-out ${
                  isActive
                    ? 'bg-accent-950 text-accent-300'
                    : 'text-content-muted hover:bg-surface-hover hover:text-content'
                }`}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                {label}
              </button>
            );
          })}
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 divide-y divide-line/40">
          {loading ? (
            <div className="p-8 text-center text-xs text-content-faint font-medium">
              Semboller aranıyor...
            </div>
          ) : results.length === 0 ? (
            <div className="p-8 text-center text-xs text-content-faint font-medium">
              Aramanıza uygun hisse veya sembol bulunamadı.
            </div>
          ) : (
            results.map((item) => {
              // Borsa etiketi bir kimlik, bir sonuç değil: rozet nötr durur,
              // ayırt edici olan metnin kendisi. Eskiden BIST kırmızı,
              // FOREX yeşildi ve arama sonuçları kâr-zarar paletiyle
              // renklenmiş gibi okunuyordu.
              const exchangeColor = 'bg-surface-hover text-content-muted border-line-strong';


              const itemProvider = getProviderFromExchange(item.exchange);
              const itemId = `${itemProvider}:${item.symbol.toUpperCase()}`;
              // Check across all lists reactively (watchlistState is live)
              const isFavorited = watchlistState.lists.some((g) =>
                g.items.some((i) => i.id === itemId)
              );

              return (
                <div
                  key={`${item.exchange}-${item.symbol}`}
                  onClick={() => handleSelect(item)}
                  className="flex items-center justify-between p-3 rounded-xl hover:bg-surface-hover cursor-pointer transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        watchlistStore.toggleSymbol(item.symbol, itemProvider, item.name, item.exchange);
                      }}
                      className={`p-1 rounded-lg transition-all ${
                        isFavorited
                          ? 'text-warn-400 bg-warn-500/10 hover:bg-warn-500/20'
                          : 'text-content-faint hover:text-content hover:bg-surface-hover'
                      }`}
                      title={isFavorited ? 'Listeden Çıkar' : 'Favorilere Ekle'}
                    >
                      <Bookmark className={`w-4 h-4 ${isFavorited ? 'fill-warn-400' : ''}`} />
                    </button>

                    <div className="w-9 h-9 rounded-xl bg-surface-raised border border-line flex items-center justify-center font-medium text-xs text-content font-mono group-hover:border-accent-500/50 group-hover:text-accent-300 transition">
                      {item.symbol.substring(0, 3)}
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-content-strong font-mono tracking-tight group-hover:text-accent-400 transition">
                          {item.symbol}
                        </span>
                        <span className={`text-2xs font-medium px-1.5 py-0.5 rounded border ${exchangeColor}`}>
                          {item.exchange}
                        </span>
                      </div>
                      <span className="text-xs text-content-muted font-medium line-clamp-1">
                        {item.name}
                      </span>
                    </div>
                  </div>

                  {item.sector && (
                    <div className="hidden sm:flex items-center gap-1 text-2xs font-medium text-content-faint bg-surface-raised px-2.5 py-1 rounded-lg border border-line">
                      <TrendingUp className="w-3 h-3 text-content-faint" />
                      <span>{item.sector}</span>
                    </div>
                  )}
                </div>
              );

            })
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2.5 bg-canvas border-t border-line text-2xs text-content-faint flex items-center justify-between">
          <span>{results.length} sembol gösteriliyor</span>
          <span className="font-mono">Tıklayarak grafiğe aktarın</span>
        </div>
      </div>
    </div>
  );
}
