import { useState, useEffect, useRef } from 'react';
import { Search, X, Building2, Globe2, Coins, TrendingUp, Sparkles, Bookmark } from 'lucide-react';
import { watchlistStore } from '../store/watchlistStore';

export interface SymbolItem {
  symbol: string;
  name: string;
  sector?: string;
  exchange: string;
  ticker?: string;
}

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


  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<string>('all');
  const [results, setResults] = useState<SymbolItem[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
      const providerFilter = tab === 'all' ? '' : tab;
      const res = await fetch(`/api/market/search?q=${encodeURIComponent(q)}&provider=${providerFilter}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data);
      }
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
    return currentProvider;
  };

  const handleSelect = (item: SymbolItem) => {
    const provider = getProviderFromExchange(item.exchange);
    onSelectSymbol(item.symbol, provider);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      {/* Modal Card */}
      <div 
        className="w-full max-w-xl bg-[#0d1321] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Header Input */}
        <div className="p-4 border-b border-slate-800 flex items-center gap-3 bg-[#070b13]">
          <Search className="w-5 h-5 text-indigo-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Hisse kodu, şirket adı veya sektör girin (ör: THYAO, Garanti, Apple, NVDA)..."
            className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 outline-none font-medium"
          />
          {query && (
            <button 
              onClick={() => setQuery('')}
              className="p-1 text-slate-500 hover:text-slate-300 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="px-2.5 py-1 text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-800/60 rounded-lg border border-slate-700/50"
          >
            ESC
          </button>
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 px-4 py-2.5 bg-[#090d16] border-b border-slate-800/80 overflow-x-auto select-none">
          <button
            onClick={() => setActiveTab('all')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'all'
                ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/50 shadow-md shadow-indigo-500/10'
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Tümü
          </button>

          <button
            onClick={() => setActiveTab('bist')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'bist'
                ? 'bg-red-500/20 text-red-300 border border-red-500/40 shadow-md shadow-red-500/10'
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
            }`}
          >
            <Building2 className="w-3.5 h-3.5 text-red-400" />
            BIST 100
          </button>

          <button
            onClick={() => setActiveTab('nasdaq')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'nasdaq'
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-md shadow-blue-500/10'
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
            }`}
          >
            <Globe2 className="w-3.5 h-3.5 text-blue-400" />
            NASDAQ & US
          </button>

          <button
            onClick={() => setActiveTab('binance')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'binance'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-md shadow-amber-500/10'
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
            }`}
          >
            <Coins className="w-3.5 h-3.5 text-amber-400" />
            Binance Crypto
          </button>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 divide-y divide-slate-800/40">
          {loading ? (
            <div className="p-8 text-center text-xs text-slate-500 font-medium">
              Semboller aranıyor...
            </div>
          ) : results.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 font-medium">
              Aramanıza uygun hisse veya sembol bulunamadı.
            </div>
          ) : (
            results.map((item) => {
              const exchangeColor = 
                item.exchange === 'BIST' ? 'bg-red-950/60 text-red-400 border-red-900/60' :
                item.exchange === 'BINANCE' ? 'bg-amber-950/60 text-amber-400 border-amber-900/60' :
                'bg-blue-950/60 text-blue-400 border-blue-900/60';

              const itemProvider = getProviderFromExchange(item.exchange);
              const isFavorited = watchlistStore.isSymbolInActiveList(item.symbol, itemProvider);

              return (
                <div
                  key={`${item.exchange}-${item.symbol}`}
                  onClick={() => handleSelect(item)}
                  className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-800/60 cursor-pointer transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        watchlistStore.toggleSymbol(item.symbol, itemProvider, item.name, item.exchange);
                      }}
                      className={`p-1 rounded-lg transition-all ${
                        isFavorited
                          ? 'text-amber-400 bg-amber-500/10 hover:bg-amber-500/20'
                          : 'text-slate-600 hover:text-slate-300 hover:bg-slate-800'
                      }`}
                      title={isFavorited ? 'Listeden Çıkar' : 'Favorilere Ekle'}
                    >
                      <Bookmark className={`w-4 h-4 ${isFavorited ? 'fill-amber-400' : ''}`} />
                    </button>

                    <div className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center font-bold text-xs text-slate-200 font-mono group-hover:border-indigo-500/50 group-hover:text-indigo-300 transition">
                      {item.symbol.substring(0, 3)}
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-100 font-mono tracking-tight group-hover:text-indigo-400 transition">
                          {item.symbol}
                        </span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${exchangeColor}`}>
                          {item.exchange}
                        </span>
                      </div>
                      <span className="text-xs text-slate-400 font-medium line-clamp-1">
                        {item.name}
                      </span>
                    </div>
                  </div>

                  {item.sector && (
                    <div className="hidden sm:flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-900/40 px-2.5 py-1 rounded-lg border border-slate-800/60">
                      <TrendingUp className="w-3 h-3 text-slate-600" />
                      <span>{item.sector}</span>
                    </div>
                  )}
                </div>
              );

            })
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2.5 bg-[#070b13] border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
          <span>{results.length} sembol gösteriliyor</span>
          <span className="font-mono">Tıklayarak grafiğe aktarın</span>
        </div>
      </div>
    </div>
  );
}
