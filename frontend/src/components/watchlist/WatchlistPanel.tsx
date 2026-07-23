import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Plus, RefreshCw, X, ChevronDown, Flag, Trash2,
  Sparkles, ArrowUpDown, GripVertical,
} from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useWatchlistStore, watchlistStore, FlagColor, WatchlistItem } from '../../store/watchlistStore';

interface SortableItemProps {
  item: WatchlistItem;
  isCurrent: boolean;
  onSelectSymbol: (symbol: string, provider: string) => void;
}

function SortableWatchlistItem({ item, isCurrent, onSelectSymbol }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : undefined,
    zIndex: isDragging ? 50 : undefined,
    position: 'relative' as const,
  };

  const isPositive = (item.changePercent || 0) >= 0;

  const getFlagStyle = (color?: FlagColor) => {
    switch (color) {
      case 'red':    return 'text-red-500 fill-red-500/20';
      case 'blue':   return 'text-blue-400 fill-blue-400/20';
      case 'green':  return 'text-emerald-400 fill-emerald-400/20';
      case 'yellow': return 'text-amber-400 fill-amber-400/20';
      case 'purple': return 'text-purple-400 fill-purple-400/20';
      default:       return 'text-red-500 fill-red-500/20';
    }
  };

  const formatPrice = (price?: number | null, provider?: string) => {
    if (price === undefined || price === null) return '—';
    if (provider === 'binance') {
      return price >= 10
        ? price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : price.toFixed(4);
    }
    return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onSelectSymbol(item.symbol, item.provider)}
      className={`group flex items-center justify-between px-2 py-2 rounded-xl cursor-pointer transition-all ${
        isCurrent
          ? 'bg-indigo-600/20 border border-indigo-500/50 shadow-md shadow-indigo-500/10'
          : 'hover:bg-slate-800/50 border border-transparent'
      } ${isDragging ? 'shadow-xl shadow-indigo-500/20 scale-[1.02] bg-slate-800/80' : ''}`}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={(e) => {
            e.stopPropagation();
            watchlistStore.cycleFlagColor(item.id);
          }}
          className="p-0.5 hover:scale-125 transition-transform shrink-0"
          title="Bayrak Rengini Değiştir"
        >
          <Flag className={`w-3.5 h-3.5 ${getFlagStyle(item.flagColor)}`} />
        </button>

        <div className="flex flex-col truncate">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-100 font-mono tracking-tight group-hover:text-indigo-300 transition">
              {item.symbol}
            </span>
            <span className="text-[9px] font-bold px-1 rounded bg-slate-900 border border-slate-800 text-slate-400 shrink-0">
              {item.exchange}
            </span>
          </div>
          <span className="text-[10px] text-slate-500 truncate max-w-[100px]">
            {item.name}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
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
}

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

  // Resizable drag state
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(0);

  const activeGroup = state.lists.find((g) => g.id === state.activeListId) || state.lists[0];

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeGroup = state.lists.find((g) => g.id === state.activeListId);
    if (!activeGroup) return;

    const oldIndex = activeGroup.items.findIndex((i) => i.id === active.id);
    const newIndex = activeGroup.items.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    watchlistStore.reorderSymbols(state.activeListId, oldIndex, newIndex);
  }, [state.activeListId, state.lists]);

  // Auto-fetch quotes on mount or active list change
  useEffect(() => {
    watchlistStore.fetchQuotes();
    const interval = setInterval(() => {
      watchlistStore.fetchQuotes();
    }, 15000);
    return () => clearInterval(interval);
  }, [state.activeListId]);

  // ---- Panel Resize Handlers ----
  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    dragStartXRef.current = e.clientX;
    dragStartWidthRef.current = state.panelWidth;

    const onMouseMove = (me: MouseEvent) => {
      if (!isDraggingRef.current) return;
      // Panel is on the right; dragging left increases width
      const delta = dragStartXRef.current - me.clientX;
      watchlistStore.setPanelWidth(dragStartWidthRef.current + delta);
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [state.panelWidth]);

  if (!state.isOpen || state.activeRightTool !== 'watchlist') {
    return null;
  }

  // Sorted items
  let items = [...(activeGroup?.items || [])];
  if (sortField) {
    items.sort((a, b) => {
      if (sortField === 'symbol') return sortAsc ? a.symbol.localeCompare(b.symbol) : b.symbol.localeCompare(a.symbol);
      if (sortField === 'price') { const pA = a.lastPrice || 0; const pB = b.lastPrice || 0; return sortAsc ? pA - pB : pB - pA; }
      if (sortField === 'change') { const cA = a.changePercent || 0; const cB = b.changePercent || 0; return sortAsc ? cA - cB : cB - cA; }
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

  const getFlagStyle = (color?: FlagColor) => {
    switch (color) {
      case 'red':    return 'text-red-500 fill-red-500/20';
      case 'blue':   return 'text-blue-400 fill-blue-400/20';
      case 'green':  return 'text-emerald-400 fill-emerald-400/20';
      case 'yellow': return 'text-amber-400 fill-amber-400/20';
      case 'purple': return 'text-purple-400 fill-purple-400/20';
      default:       return 'text-red-500 fill-red-500/20';
    }
  };

  const formatPrice = (price?: number | null, provider?: string) => {
    if (price === undefined || price === null) return '—';
    if (provider === 'binance') {
      return price >= 10
        ? price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : price.toFixed(4);
    }
    return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Get the emoji/color for the active list header indicator
  const getListHeaderEmoji = () => activeGroup?.emoji || '📋';
  const getListHeaderColor = () => activeGroup?.color || '#6366f1';

  return (
    <div
      style={{ width: state.panelWidth }}
      className="h-full bg-[#0d1321] border-l border-slate-800/80 flex flex-col z-20 shadow-2xl overflow-hidden animate-slideInRight relative shrink-0"
    >
      {/* Resize handle (left edge) */}
      <div
        onMouseDown={onResizeMouseDown}
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-30 group hover:bg-indigo-500/30 transition-colors"
        title="Genişliği Ayarla"
      >
        <div className="absolute left-0.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
          <GripVertical className="w-3 h-3 text-indigo-400" />
        </div>
      </div>

      {/* Panel Top Header */}
      <div className="pl-2 pr-3 py-3 border-b border-slate-800 flex items-center justify-between bg-[#070b13]">
        {/* Watchlist Name Dropdown Selector */}
        <div className="relative">
          <button
            onClick={() => setIsListDropdownOpen(!isListDropdownOpen)}
            className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-800 hover:border-indigo-500/40 text-xs font-bold text-slate-100 transition-all select-none"
          >
            <span style={{ color: getListHeaderColor() }} className="text-sm leading-none">
              {getListHeaderEmoji()}
            </span>
            <span className="max-w-[110px] truncate">{activeGroup?.name || 'Watchlist'}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {/* List Selector Dropdown */}
          {isListDropdownOpen && (
            <div
              className="absolute top-9 left-0 w-56 bg-[#0d1321] border border-slate-800 rounded-xl shadow-2xl p-1.5 z-50 space-y-0.5 animate-fadeIn"
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
                    <span style={{ color: group.color }} className="text-sm leading-none">{group.emoji}</span>
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
          {/* Refresh */}
          <button
            onClick={() => watchlistStore.fetchQuotes()}
            className={`p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-800/60 rounded-lg transition-all ${
              state.quotesLoading ? 'animate-spin text-indigo-400' : ''
            }`}
            title="Fiyatları Yenile"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          {/* Add Symbol */}
          <button
            onClick={onOpenSearchModal}
            className="p-1.5 bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-600/50 hover:text-white rounded-lg transition-all"
            title="Yeni Hisse / Sembol Ekle"
          >
            <Plus className="w-4 h-4" />
          </button>

          {/* Close Panel */}
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

      {/* Watchlist Item Rows */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/30 p-1 space-y-0.5">
        {items.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 font-medium space-y-3">
            <Sparkles className="w-6 h-6 text-indigo-400/50 mx-auto" />
            <p>Bu listede henüz sembol yok.</p>
            <button
              onClick={onOpenSearchModal}
              className="px-3 py-1.5 bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 rounded-lg font-bold text-xs hover:bg-indigo-600/40 transition"
            >
              + Sembol Ekle
            </button>
          </div>
        ) : sortField ? (
          items.map((item) => {
            const isCurrent =
              currentSymbol.toUpperCase() === item.symbol.toUpperCase() &&
              currentProvider.toLowerCase() === item.provider.toLowerCase();
            const isPositive = (item.changePercent || 0) >= 0;

            return (
              <div
                key={item.id}
                onClick={() => onSelectSymbol(item.symbol, item.provider)}
                className={`group flex items-center justify-between px-2 py-2 rounded-xl cursor-pointer transition-all ${
                  isCurrent
                    ? 'bg-indigo-600/20 border border-indigo-500/50 shadow-md shadow-indigo-500/10'
                    : 'hover:bg-slate-800/50 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      watchlistStore.cycleFlagColor(item.id);
                    }}
                    className="p-0.5 hover:scale-125 transition-transform shrink-0"
                    title="Bayrak Rengini Değiştir"
                  >
                    <Flag className={`w-3.5 h-3.5 ${getFlagStyle(item.flagColor)}`} />
                  </button>

                  <div className="flex flex-col truncate">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-100 font-mono tracking-tight group-hover:text-indigo-300 transition">
                        {item.symbol}
                      </span>
                      <span className="text-[9px] font-bold px-1 rounded bg-slate-900 border border-slate-800 text-slate-400 shrink-0">
                        {item.exchange}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 truncate max-w-[100px]">
                      {item.name}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
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
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              {items.map((item) => {
                const isCurrent =
                  currentSymbol.toUpperCase() === item.symbol.toUpperCase() &&
                  currentProvider.toLowerCase() === item.provider.toLowerCase();
                return (
                  <SortableWatchlistItem
                    key={item.id}
                    item={item}
                    isCurrent={isCurrent}
                    onSelectSymbol={onSelectSymbol}
                  />
                );
              })}
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 bg-[#070b13] border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500 select-none">
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
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0d1321] border border-slate-800 rounded-2xl p-5 w-full max-w-xs space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-slate-100">Yeni İzleme Listesi</h3>
            <input
              type="text"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newListName.trim()) {
                  watchlistStore.createList(newListName.trim());
                  setNewListName('');
                  setIsNewListModalOpen(false);
                }
              }}
              placeholder="Liste Adı (Örn: Bankacılık)..."
              autoFocus
              className="w-full bg-[#070b13] border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 outline-none focus:border-indigo-500 transition"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setIsNewListModalOpen(false); setNewListName(''); }}
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
