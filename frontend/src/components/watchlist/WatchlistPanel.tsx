import { useState, useEffect } from 'react';
import { 
  Plus, RefreshCw, X, ChevronDown, Flag, Trash2, 
  Sparkles, ArrowUpDown
} from 'lucide-react';
import { useWatchlistStore, watchlistStore, FlagColor } from '../../store/watchlistStore';

interface WatchlistPanelProps {
  currentSymbol: string;
  currentProvider: string;
  onSelectSymbol: (symbol: string, provider: string) => void;
  onOpenSearchModal: () => void;
}

export default function WatchlistPanel({
  currentSymbol,
  currentProvider,
  onSelectSymbol,
  onOpenSearchModal,
}: WatchlistPanelProps) {
  const [state] = useWatchlistStore();
  const [isListDropdownOpen, setIsListDropdownOpen] = useState(false);
  const [isNewListModalOpen, setIsNewListModalOpen] = useState(false);
  const [newListName, setNewListName] = useState('');

  const [sortField, setSortField] = useState<'symbol' | 'price' | 'change' | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  const activeGroup = state.lists.find((g) => g.id === state.activeListId) || state.lists[0];

  // Auto-fetch quotes on mount or active list change
  useEffect(() => {
    watchlistStore.fetchQuotes();
    const interval = setInterval(() => {
      watchlistStore.fetchQuotes();
    }, 15000); // 15-second quote refresh
    return () => clearInterval(interval);
  }, [state.activeListId]);

  if (!state.isOpen || state.activeRightTool !== 'watchlist') {
    return null;
  }

  // Sorted items
  let items = [...(activeGroup?.items || [])];
  if (sortField) {
    items.sort((a, b) => {
      if (sortField === 'symbol') {
        return sortAsc ? a.symbol.localeCompare(b.symbol) : b.symbol.localeCompare(a.symbol);
      }
      if (sortField === 'price') {
        const pA = a.lastPrice || 0;
        const pB = b.lastPrice || 0;
        return sortAsc ? pA - pB : pB - pA;
      }
      if (sortField === 'change') {
        const cA = a.changePercent || 0;
        const cB = b.changePercent || 0;
        return sortAsc ? cA - cB : cB - cA;
      }
      return 0;
    });
  }

  const handleSort = (field: 'symbol' | 'price' | 'change') => {
    if (sortField === field) {
      if (sortAsc) setSortAsc(false);
      else setSortField(null);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const getFlagBg = (color?: FlagColor) => {
    switch (color) {
      case 'red': return 'text-red-500 fill-red-500/20';
      case 'blue': return 'text-blue-400 fill-blue-400/20';
      case 'green': return 'text-emerald-400 fill-emerald-400/20';
      case 'yellow': return 'text-amber-400 fill-amber-400/20';
      case 'purple': return 'text-purple-400 fill-purple-400/20';
      default: return 'text-red-500 fill-red-500/20';
    }
  };

  const formatPrice = (price?: number | null, provider?: string) => {
    if (price === undefined || price === null) return '—';
    if (provider === 'binance') {
      return price >= 10 ? price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : price.toFixed(4);
    }
    return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="w-72 h-full bg-[#0d1321] border-l border-slate-800/80 flex flex-col z-20 shadow-2xl overflow-hidden animate-slideInRight">
      {/* Panel Top Header */}
      <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-[#070b13] relative">
        {/* Watchlist Name Dropdown Selector */}
        <div className="relative">
          <button
            onClick={() => setIsListDropdownOpen(!isListDropdownOpen)}
            className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-800 hover:border-indigo-500/40 text-xs font-bold text-slate-100 transition-all select-none"
          >
            <Flag className={`w-3.5 h-3.5 text-red-500 fill-red-500`} />
            <span className="max-w-[110px] truncate">{activeGroup?.name || 'Watchlist'}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {/* List Selector Dropdown Menu */}
          {isListDropdownOpen && (
            <div 
              className="absolute top-9 left-0 w-56 bg-[#0d1321] border border-slate-800 rounded-xl shadow-2xl p-1.5 z-50 space-y-1 animate-fadeIn"
              onMouseLeave={() => setIsListDropdownOpen(false)}
            >
              <div className="text-[9px] text-slate-500 font-bold uppercase px-2 py-1 select-none">
                İzleme Listelerim
              </div>
              <div className="w-full h-px bg-slate-800/60 my-1" />
              {state.lists.map((group) => (
                <button
                  key={group.id}
                  onClick={() => {
                    watchlistStore.setActiveList(group.id);
                    setIsListDropdownOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    group.id === state.activeListId
                      ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                      : 'text-slate-300 hover:bg-slate-800/60 hover:text-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: group.color }} />
                    <span>{group.name}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">({group.items.length})</span>
                </button>
              ))}

              <div className="w-full h-px bg-slate-800/60 my-1" />
              <button
                onClick={() => {
                  setIsListDropdownOpen(false);
                  setIsNewListModalOpen(true);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-indigo-400 hover:bg-indigo-500/10 rounded-lg font-bold transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                Yeni Liste Oluştur
              </button>
            </div>
          )}
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-1">
          {/* Refresh Quotes Button */}
          <button
            onClick={() => watchlistStore.fetchQuotes()}
            className={`p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-800/60 rounded-lg transition-all ${
              state.quotesLoading ? 'animate-spin text-indigo-400' : ''
            }`}
            title="Fiyatları Yenile"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          {/* Add Symbol (+) Button */}
          <button
            onClick={onOpenSearchModal}
            className="p-1.5 bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-600/50 hover:text-white rounded-lg transition-all"
            title="Yeni Hisse / Sembol Ekle (+)"
          >
            <Plus className="w-4 h-4" />
          </button>

          {/* Menu / Close Button */}
          <button
            onClick={() => watchlistStore.togglePanel()}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 rounded-lg transition-all"
            title="Paneli Kapat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Table Column Headers */}
      <div className="px-3 py-2 bg-[#090d16] border-b border-slate-800/80 flex items-center justify-between text-[10px] font-bold text-slate-400 select-none">
        <button 
          onClick={() => handleSort('symbol')}
          className="flex items-center gap-1 hover:text-slate-200 transition"
        >
          <span>SEMBOL</span>
          {sortField === 'symbol' && <ArrowUpDown className="w-3 h-3 text-indigo-400" />}
        </button>

        <div className="flex items-center gap-4">
          <button 
            onClick={() => handleSort('price')}
            className="flex items-center gap-1 hover:text-slate-200 transition"
          >
            <span>SON</span>
            {sortField === 'price' && <ArrowUpDown className="w-3 h-3 text-indigo-400" />}
          </button>
          <button 
            onClick={() => handleSort('change')}
            className="flex items-center gap-1 hover:text-slate-200 transition"
          >
            <span>DEĞ%</span>
            {sortField === 'change' && <ArrowUpDown className="w-3 h-3 text-indigo-400" />}
          </button>
        </div>
      </div>

      {/* Watchlist Item Rows List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/30 p-1 space-y-0.5">
        {items.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 font-medium space-y-2">
            <Sparkles className="w-6 h-6 text-indigo-400/50 mx-auto" />
            <p>Bu listede henüz sembol yok.</p>
            <button
              onClick={onOpenSearchModal}
              className="px-3 py-1.5 bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 rounded-lg font-bold text-xs hover:bg-indigo-600/40 transition"
            >
              + Sembol Ekle
            </button>
          </div>
        ) : (
          items.map((item) => {
            const isCurrent = 
              currentSymbol.toUpperCase() === item.symbol.toUpperCase() && 
              currentProvider.toLowerCase() === item.provider.toLowerCase();

            const isPositive = (item.changePercent || 0) >= 0;

            return (
              <div
                key={item.id}
                onClick={() => onSelectSymbol(item.symbol, item.provider)}
                className={`group flex items-center justify-between px-2.5 py-2 rounded-xl cursor-pointer transition-all ${
                  isCurrent
                    ? 'bg-indigo-600/20 border border-indigo-500/50 shadow-md shadow-indigo-500/10'
                    : 'hover:bg-slate-800/50 border border-transparent'
                }`}
              >
                {/* Left: Flag Icon + Symbol Name + Exchange */}
                <div className="flex items-center gap-2 min-w-0">
                  {/* Flag Color Toggle */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      watchlistStore.cycleFlagColor(item.id);
                    }}
                    className="p-0.5 hover:scale-125 transition-transform"
                    title="Bayrak Rengini Değiştir"
                  >
                    <Flag className={`w-3.5 h-3.5 ${getFlagBg(item.flagColor)}`} />
                  </button>

                  <div className="flex flex-col truncate">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-100 font-mono tracking-tight group-hover:text-indigo-300 transition">
                        {item.symbol}
                      </span>
                      <span className="text-[9px] font-bold px-1 rounded bg-slate-900 border border-slate-800 text-slate-400">
                        {item.exchange}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 truncate max-w-[110px]">
                      {item.name}
                    </span>
                  </div>
                </div>

                {/* Right: Price & Daily Change % & Delete Button */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex flex-col items-end font-mono">
                    <span className="text-xs font-bold text-slate-100">
                      {formatPrice(item.lastPrice, item.provider)}
                    </span>
                    {item.changePercent !== undefined && item.changePercent !== null ? (
                      <span className={`text-[10px] font-bold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isPositive ? '+' : ''}{item.changePercent.toFixed(2)}%
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-600">—</span>
                    )}
                  </div>

                  {/* Delete Item Button on Hover */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      watchlistStore.removeSymbol(item.symbol, item.provider);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 hover:bg-red-950/40 rounded transition-all"
                    title="Listeden Çıkar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Info & Quick Add Button */}
      <div className="p-2.5 bg-[#070b13] border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500 font-sans select-none">
        <span>{items.length} Sembol</span>
        <button
          onClick={onOpenSearchModal}
          className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition"
        >
          + Sembol Ekle
        </button>
      </div>

      {/* New List Modal */}
      {isNewListModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#0d1321] border border-slate-800 rounded-2xl p-4 w-full max-w-xs space-y-3 shadow-2xl">
            <h3 className="text-sm font-bold text-slate-100">Yeni İzleme Listesi</h3>
            <input
              type="text"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder="Liste Adı (Örn: Bankacılık)..."
              className="w-full bg-[#070b13] border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 outline-none focus:border-indigo-500"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsNewListModalOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 font-semibold"
              >
                İptal
              </button>
              <button
                onClick={() => {
                  if (newListName.trim()) {
                    watchlistStore.createList(newListName.trim());
                    setNewListName('');
                    setIsNewListModalOpen(false);
                  }
                }}
                className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-500 transition"
              >
                Oluştur
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
