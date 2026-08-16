import { useState, useRef, useCallback } from 'react';
import { useVisibleInterval } from '../../hooks/useVisibleInterval';
import {
  Plus, RefreshCw, ChevronDown, Flag, Trash2,
  Sparkles, ArrowUpDown, GripVertical, StickyNote, X,
} from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';

import {
  SortableContext, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  useWatchlistStore, watchlistStore, WatchlistItem, markColorHex,
} from '../../store/watchlistStore';
import WatchlistContextMenu, { ContextMenuTarget } from './WatchlistContextMenu';

/**
 * Sağlayıcıya göre varsayılan bayrak rengi — sembol işaretli DEĞİLKEN kullanılır.
 *
 * Piyasalar kâr-zarar paletinden ayrı tutuluyor: BIST eskiden kırmızı, forex
 * yeşildi ve yan yana duran fiyat değişimi sütunuyla aynı iki rengi
 * paylaşıyorlardı — göz "BIST kaybediyor" diye okuyordu. Bu dört renk
 * kategorik bir palet; hiçbiri bir değer yargısı taşımıyor.
 */
function providerFlagStyle(provider?: string, exchange?: string): string {
  const p = (provider || '').toLowerCase();
  const ex = (exchange || '').toLowerCase();
  if (p === 'bist' || ex.includes('bist')) return 'text-warn-400 fill-warn-400/20';
  if (p === 'nasdaq' || ex.includes('nasdaq')) return 'text-accent-300 fill-accent-300/20';
  if (p === 'forex' || p === 'fx' || ex.includes('forex')) return 'text-ink-300 fill-ink-300/20';
  return 'text-accent-500 fill-accent-500/20';
}

function formatPrice(price?: number | null, provider?: string): string {
  if (price === undefined || price === null) return '—';
  if (provider === 'binance' || provider === 'forex' || provider === 'fx') {
    return price >= 10 && provider === 'binance'
      ? price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : price.toFixed(4);
  }
  return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface RowProps {
  item: WatchlistItem;
  isCurrent: boolean;
  onSelectSymbol: (symbol: string, provider: string) => void;
  onContextMenu: (e: React.MouseEvent, item: WatchlistItem) => void;
  /** Satırın bulunduğu listeye göre doğru çıkarma işlemini yapar (bkz. panel). */
  onRemove: () => void;
}

/**
 * Tek bir sembol satırı.
 *
 * Sıralama açıkken (sürükle-bırak kapalı) ve kapalıyken aynı görünüm
 * kullanılabilsin diye sunum katmanı ayrı tutulur; sürükleme özellikleri
 * dışarıdan sarmalayıcı tarafından verilir.
 */
function WatchlistRow({
  item, isCurrent, onSelectSymbol, onContextMenu, onRemove,
  dragRef, dragStyle, dragProps, isDragging,
}: RowProps & {
  dragRef?: (node: HTMLElement | null) => void;
  dragStyle?: React.CSSProperties;
  dragProps?: Record<string, unknown>;
  isDragging?: boolean;
}) {
  const isPositive = (item.changePercent || 0) >= 0;
  const markHex = markColorHex(item.markColor);

  return (
    <div
      ref={dragRef}
      style={dragStyle}
      onClick={() => onSelectSymbol(item.symbol, item.provider)}
      onContextMenu={(e) => onContextMenu(e, item)}
      className={`group flex items-center justify-between px-2 py-2 rounded-xl cursor-pointer transition-all ${
        isCurrent
          ? 'bg-accent-600/20 border border-accent-500/50 shadow-md shadow-accent-500/10'
          : 'hover:bg-surface-hover border border-transparent'
      } ${isDragging ? 'shadow-xl shadow-accent-500/20 scale-[1.02] bg-surface-hover' : ''}`}
      {...(dragProps || {})}
    >
      <div className="flex items-center gap-2 min-w-0">
        <div
          className="p-0.5 shrink-0"
          title={markHex ? 'İşaretli sembol' : `${(item.provider || '').toUpperCase()} Piyasası`}
        >
          {markHex ? (
            <Flag className="w-3.5 h-3.5" style={{ color: markHex, fill: markHex }} />
          ) : (
            <Flag className={`w-3.5 h-3.5 ${providerFlagStyle(item.provider, item.exchange)}`} />
          )}
        </div>

        <div className="flex flex-col truncate">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-content-strong font-mono tracking-tight group-hover:text-accent-300 transition">
              {item.symbol}
            </span>
            <span className="text-2xs font-medium px-1 rounded bg-surface-raised border border-line text-content-muted shrink-0">
              {item.exchange}
            </span>
            {item.note && (
              <StickyNote
                className="w-3 h-3 text-warn-400 shrink-0"
                // Not metni tooltip olarak görünür; düzenlemek için sağ tık menüsü.
                aria-label="Notu var"
              />
            )}
          </div>
          <span className="text-2xs text-content-faint truncate max-w-[100px]">
            {item.note || item.name}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <div className="flex flex-col items-end font-mono">
          <span className="text-xs font-medium text-content-strong">
            {formatPrice(item.lastPrice, item.provider)}
          </span>
          {item.changePercent !== undefined && item.changePercent !== null ? (
            <span className={`text-2xs font-medium ${isPositive ? 'text-profit-400' : 'text-loss-400'}`}>
              {isPositive ? '+' : ''}{item.changePercent.toFixed(2)}%
            </span>
          ) : (
            <span className="text-2xs text-content-faint">—</span>
          )}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="opacity-0 group-hover:opacity-100 touch:opacity-100 p-1 text-content-faint hover:text-loss-400 hover:bg-loss-950/40 rounded transition-all"
          title="Listeden Çıkar"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

/** Listeyi bölen başlık satırı (sağ tık menüsündeki "Bölüm ekle"). */
function SectionRow({
  item, onContextMenu,
  dragRef, dragStyle, dragProps,
}: {
  item: WatchlistItem;
  onContextMenu: (e: React.MouseEvent, item: WatchlistItem) => void;
  dragRef?: (node: HTMLElement | null) => void;
  dragStyle?: React.CSSProperties;
  dragProps?: Record<string, unknown>;
}) {
  return (
    <div
      ref={dragRef}
      style={dragStyle}
      onContextMenu={(e) => onContextMenu(e, item)}
      className="flex items-center gap-2 px-2 pt-3 pb-1 cursor-default select-none"
      {...(dragProps || {})}
    >
      <span className="text-2xs font-medium text-content-muted truncate">
        {item.name}
      </span>
      <div className="flex-1 h-px bg-surface-hover" />
    </div>
  );
}

/** Sürükle-bırak sarmalayıcısı: hem sembol hem bölüm satırları taşınabilir. */
function SortableWatchlistItem(props: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.item.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : undefined,
    zIndex: isDragging ? 50 : undefined,
    position: 'relative' as const,
  };

  const dragProps = { ...attributes, ...listeners } as Record<string, unknown>;

  if (props.item.kind === 'section') {
    return (
      <SectionRow
        item={props.item}
        onContextMenu={props.onContextMenu}
        dragRef={setNodeRef}
        dragStyle={style}
        dragProps={dragProps}
      />
    );
  }

  return (
    <WatchlistRow
      {...props}
      dragRef={setNodeRef}
      dragStyle={style}
      dragProps={dragProps}
      isDragging={isDragging}
    />
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
  // "Yeni Liste Oluştur..." sağ tık menüsünden geldiyse, liste oluşturulur
  // oluşturulmaz bu sembol içine eklenir.
  const [pendingListSymbol, setPendingListSymbol] = useState<WatchlistItem | null>(null);
  const [sortField, setSortField] = useState<'symbol' | 'price' | 'change' | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  // Sağ tık menüsü ve ona bağlı diyaloglar
  const [menuTarget, setMenuTarget] = useState<ContextMenuTarget | null>(null);
  const [noteTarget, setNoteTarget] = useState<WatchlistItem | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [sectionDraft, setSectionDraft] = useState('');
  // Yeni bölüm: hangi satırın altına ekleneceği. Düzenleme: hangi bölüm.
  const [sectionModal, setSectionModal] = useState<
    { mode: 'create'; afterItemId?: string } | { mode: 'rename'; sectionId: string } | null
  >(null);

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

  // Fiyatları düzenli tazele — yalnızca sekme GÖRÜNÜRKEN.
  //
  // Düz setInterval arka planda da çalışıyordu: başka bir sekmeye geçen
  // kullanıcı için saatlerce boşuna sorgu atılıyor, ücretsiz barındırmada
  // sunucu hiç uykuya geçemiyor ve kullanıcı başına istek sınırı boşuna
  // tükeniyordu (bkz. hooks/useVisibleInterval).
  useVisibleInterval(() => watchlistStore.fetchQuotes(), 15000, [state.activeListId]);

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

  const openContextMenu = useCallback((e: React.MouseEvent, item: WatchlistItem | null) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuTarget({ x: e.clientX, y: e.clientY, item, listId: state.activeListId });
  }, [state.activeListId]);

  if (!state.isOpen || state.activeRightTool !== 'watchlist') {
    return null;
  }

  // Sıralama açıkken bölüm başlıkları anlamını yitirir (satırlar başka bir
  // düzene girer), bu yüzden yalnızca sembol satırları gösterilir.
  const rawItems = activeGroup?.items || [];
  let items = sortField ? rawItems.filter((i) => i.kind !== 'section') : [...rawItems];
  if (sortField) {
    items = [...items].sort((a, b) => {
      if (sortField === 'symbol') return sortAsc ? a.symbol.localeCompare(b.symbol) : b.symbol.localeCompare(a.symbol);
      if (sortField === 'price') { const pA = a.lastPrice || 0; const pB = b.lastPrice || 0; return sortAsc ? pA - pB : pB - pA; }
      if (sortField === 'change') { const cA = a.changePercent || 0; const cB = b.changePercent || 0; return sortAsc ? cA - cB : cB - cA; }
      return 0;
    });
  }

  const symbolCount = rawItems.filter((i) => i.kind !== 'section').length;

  const handleSort = (field: 'symbol' | 'price' | 'change') => {
    if (sortField === field) {
      if (sortAsc) setSortAsc(false);
      else setSortField(null);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const removeItemFromActiveList = (item: WatchlistItem) => {
    // Türetilmiş piyasa listelerinde (BIST/NASDAQ/...) satır Favoriler'den
    // gelir; oradan çıkarmak gerekir, yoksa liste bir sonraki türetmede geri gelir.
    const isEditable = watchlistStore.editableLists().some((l) => l.id === state.activeListId);
    if (isEditable) {
      watchlistStore.removeSymbolFromList(state.activeListId, item.symbol, item.provider);
    } else {
      watchlistStore.removeSymbol(item.symbol, item.provider);
    }
  };

  const submitSectionModal = () => {
    const title = sectionDraft.trim();
    if (!title || !sectionModal) return;
    if (sectionModal.mode === 'create') {
      watchlistStore.addSection(state.activeListId, title, sectionModal.afterItemId);
    } else {
      watchlistStore.renameSection(state.activeListId, sectionModal.sectionId, title);
    }
    setSectionModal(null);
    setSectionDraft('');
  };

  const submitNewList = () => {
    const name = newListName.trim();
    if (!name) return;
    const listId = watchlistStore.createList(name);
    if (pendingListSymbol) {
      watchlistStore.addSymbolToList(
        listId,
        pendingListSymbol.symbol,
        pendingListSymbol.provider,
        pendingListSymbol.name,
        pendingListSymbol.exchange,
      );
    }
    setNewListName('');
    setPendingListSymbol(null);
    setIsNewListModalOpen(false);
  };

  // Get the emoji/color for the active list header indicator
  const getListHeaderEmoji = () => activeGroup?.emoji || '📋';
  const getListHeaderColor = () => activeGroup?.color || '#6366f1';

  return (
    /* Dar ekranda panel grafiğin YANINA değil ÜSTÜNE açılır.
       Yan yana dururken 288px'lik panel + iki 41px'lik ray, 375px'lik bir
       telefonda grafiğe sıfır piksel bırakıyordu: grafik hiç görünmüyor,
       paneller iç içe geçiyordu. `lg`den itibaren eski yerleşim aynen sürer.

       Genişlik CSS değişkeniyle veriliyor: satır içi `style` her zaman
       sınıfları ezerdi, yani sürüklenerek ayarlanan masaüstü genişliği
       telefonda da uygulanır ve bu düzeltme hiç çalışmazdı. */
    <div
      style={{ ['--panel-w' as string]: `${state.panelWidth}px` }}
      /* Genişlik `vw` DEĞİL yüzde: panelin kabı ekrandan dar (solda gezinme
         rayı + dolgu), `86vw` o kabı aşıp sağ kenarından kırpılıyordu.
         Kalan %14 grafiği gösterir — panelin üste binen bir katman olduğu
         böylece görünür. */
      className="absolute inset-y-0 right-0 z-40 flex w-[86%] max-w-[320px] flex-col overflow-hidden border-l border-line bg-canvas shadow-2xl animate-slideInRight lg:static lg:z-20 lg:w-[var(--panel-w)] lg:max-w-none lg:shrink-0"
    >
      {/* Resize handle (left edge) — fareyle sürüklenir; dokunmatikte panel
          zaten tam boy açıldığı için gizli. */}
      <div
        onMouseDown={onResizeMouseDown}
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-30 group hover:bg-accent-600/30 transition-colors hidden lg:block"
        title="Genişliği Ayarla"
      >
        <div className="absolute left-0.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
          <GripVertical className="w-3 h-3 text-content-muted group-hover:text-accent-300" />
        </div>
      </div>

      {/* Panel Top Header */}
      <div className="pl-2 pr-3 py-3 border-b border-line flex items-center justify-between bg-canvas">
        {/* Watchlist Name Dropdown Selector */}
        <div className="relative">
          <button
            onClick={() => setIsListDropdownOpen(!isListDropdownOpen)}
            className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-white/[0.03] border border-line hover:border-accent-500/40 text-xs font-medium text-content-strong transition-all select-none"
          >
            <span
              style={{ color: getListHeaderColor() }}
              className="w-5 h-4 flex items-center justify-center shrink-0 text-xs font-medium leading-none select-none"
            >
              {getListHeaderEmoji()}
            </span>
            <span className="max-w-[110px] truncate">{activeGroup?.name || 'Watchlist'}</span>
            <ChevronDown className="w-3.5 h-3.5 text-content-muted" />
          </button>

          {/* List Selector Dropdown */}
          {isListDropdownOpen && (
            <div
              className="absolute top-9 left-0 w-60 bg-surface-raised border border-line rounded-xl shadow-2xl p-1.5 z-50 space-y-0.5 animate-fadeIn"
              onMouseLeave={() => setIsListDropdownOpen(false)}
            >
              <div className="text-2xs text-content-faint font-medium px-2.5 py-1 select-none">
                İzleme Listelerim
              </div>
              <div className="w-full h-px bg-surface-hover my-1" />
              {state.lists.map((group) => (
                <button
                  key={group.id}
                  onClick={() => {
                    watchlistStore.setActiveList(group.id);
                    setIsListDropdownOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    group.id === state.activeListId
                      ? 'bg-accent-600/20 text-accent-300 border border-accent-500/30'
                      : 'text-content hover:bg-surface-hover hover:text-content-strong'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      style={{ color: group.color }}
                      className="w-6 h-5 flex items-center justify-center shrink-0 text-xs font-medium leading-none text-center select-none"
                    >
                      {group.emoji}
                    </span>
                    <span className="truncate">{group.name}</span>
                  </div>
                  <span className="text-2xs text-content-faint font-mono ml-2 shrink-0">
                    ({group.items.filter((i) => i.kind !== 'section').length})
                  </span>
                </button>
              ))}

              <div className="w-full h-px bg-surface-hover my-1" />
              <button
                onClick={() => {
                  setIsListDropdownOpen(false);
                  setPendingListSymbol(null);
                  setIsNewListModalOpen(true);
                }}
                className="w-full flex items-center gap-3 px-2.5 py-1.5 text-xs text-accent-400 hover:bg-accent-300/10 rounded-lg font-medium transition-all"
              >
                <div className="w-6 h-5 flex items-center justify-center shrink-0">
                  <Plus className="w-3.5 h-3.5 text-accent-400" />
                </div>
                <span>Yeni Liste Oluştur</span>
              </button>
            </div>
          )}
        </div>


        {/* Header Action Buttons */}
        <div className="flex items-center gap-1">
          {/* Refresh */}
          <button
            onClick={() => watchlistStore.fetchQuotes()}
            className={`p-1.5 text-content-muted hover:text-accent-400 hover:bg-surface-hover rounded-lg transition-all ${
              state.quotesLoading ? 'animate-spin text-accent-400' : ''
            }`}
            title="Fiyatları Yenile"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          {/* Add Symbol */}
          <button
            onClick={onOpenSearchModal}
            className="p-1.5 bg-accent-600/30 text-accent-300 border border-accent-500/40 hover:bg-accent-600/50 hover:text-content-strong rounded-lg transition-all"
            title="Yeni Hisse / Sembol Ekle"
          >
            <Plus className="w-4 h-4" />
          </button>

          {/* Kapat — dar ekranda panel grafiğin üstüne bindiği için kendi
              kapatma düğmesini taşır; sağdaki dikey ray orada gizli. */}
          <button
            onClick={() => watchlistStore.togglePanel()}
            className="tap-target p-1.5 text-content-muted hover:text-content-strong hover:bg-surface-hover rounded-lg transition-all lg:hidden"
            title="Paneli Kapat"
            aria-label="İzleme listesi panelini kapat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Table Column Headers */}
      <div className="px-3 py-2 bg-canvas border-b border-line flex items-center justify-between text-2xs font-medium text-content-muted select-none">
        <button
          onClick={() => handleSort('symbol')}
          className="flex items-center gap-1 hover:text-content transition"
        >
          <span>SEMBOL</span>
          {sortField === 'symbol' && <ArrowUpDown className="w-3 h-3 text-accent-400" />}
        </button>

        <div className="flex items-center gap-4">
          <button
            onClick={() => handleSort('price')}
            className="flex items-center gap-1 hover:text-content transition"
          >
            <span>SON</span>
            {sortField === 'price' && <ArrowUpDown className="w-3 h-3 text-accent-400" />}
          </button>
          <button
            onClick={() => handleSort('change')}
            className="flex items-center gap-1 hover:text-content transition"
          >
            <span>DEĞ%</span>
            {sortField === 'change' && <ArrowUpDown className="w-3 h-3 text-accent-400" />}
          </button>
        </div>
      </div>

      {/* Watchlist Item Rows — boş alana sağ tık da menüyü açar (liste geneli maddeleri) */}
      <div
        className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-line/30 p-1 space-y-0.5"
        onContextMenu={(e) => openContextMenu(e, null)}
      >
        {items.length === 0 ? (
          <div className="p-8 text-center text-xs text-content-faint font-medium space-y-3">
            <Sparkles className="w-6 h-6 text-accent-400/50 mx-auto" />
            <p>Bu listede henüz sembol yok.</p>
            <button
              onClick={onOpenSearchModal}
              className="px-3 py-1.5 bg-accent-600/20 text-accent-300 border border-accent-500/30 rounded-lg font-medium text-xs hover:bg-accent-600/40 transition"
            >
              + Sembol Ekle
            </button>
          </div>
        ) : sortField ? (
          items.map((item) => (
            <WatchlistRow
              key={item.id}
              item={item}
              isCurrent={
                currentSymbol.toUpperCase() === item.symbol.toUpperCase() &&
                currentProvider.toLowerCase() === item.provider.toLowerCase()
              }
              onSelectSymbol={onSelectSymbol}
              onContextMenu={openContextMenu}
              onRemove={() => removeItemFromActiveList(item)}
            />
          ))
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              {items.map((item) => (
                <SortableWatchlistItem
                  key={item.id}
                  item={item}
                  isCurrent={
                    currentSymbol.toUpperCase() === item.symbol.toUpperCase() &&
                    currentProvider.toLowerCase() === item.provider.toLowerCase()
                  }
                  onSelectSymbol={onSelectSymbol}
                  onContextMenu={openContextMenu}
                  onRemove={() => removeItemFromActiveList(item)}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 bg-canvas border-t border-line flex items-center justify-between text-2xs text-content-faint select-none">
        <span>{symbolCount} Sembol</span>
        <button
          onClick={onOpenSearchModal}
          className="text-xs font-medium text-accent-400 hover:text-accent-300 transition"
        >
          + Sembol Ekle
        </button>
      </div>

      {/* Sağ Tık Menüsü */}
      {menuTarget && (
        <WatchlistContextMenu
          target={menuTarget}
          lists={watchlistStore.editableLists()}
          onClose={() => setMenuTarget(null)}
          onAddNote={(item) => {
            setNoteTarget(item);
            setNoteDraft(item.note || '');
          }}
          onAddSection={(afterItemId) => {
            setSectionModal({ mode: 'create', afterItemId });
            setSectionDraft('');
          }}
          onRenameSection={(item) => {
            setSectionModal({ mode: 'rename', sectionId: item.id });
            setSectionDraft(item.name);
          }}
          onAddSymbol={onOpenSearchModal}
          onCreateList={(item) => {
            setPendingListSymbol(item);
            setNewListName('');
            setIsNewListModalOpen(true);
          }}
        />
      )}

      {/* Not Ekleme / Düzenleme Modalı */}
      {noteTarget && (
        <div className="fixed inset-0 z-50 bg-canvas backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-raised border border-line rounded-2xl p-5 w-full max-w-sm space-y-4 shadow-2xl">
            <h3 className="text-sm font-medium text-content-strong">
              {noteTarget.symbol} için not
            </h3>
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Bu sembolle ilgili notunuz (örn. 'destek 63.500, kırılırsa al')..."
              autoFocus
              rows={4}
              className="w-full bg-canvas border border-line rounded-xl px-3 py-2 text-xs text-content-strong outline-none focus:border-accent-500 transition resize-none"
            />
            <div className="flex justify-between items-center gap-2">
              <button
                onClick={() => {
                  watchlistStore.setNote(noteTarget.id, '');
                  setNoteTarget(null);
                }}
                disabled={!noteTarget.note}
                className="px-3 py-1.5 text-xs text-loss-400 hover:text-loss-300 font-medium disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Notu Sil
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setNoteTarget(null)}
                  className="px-3 py-1.5 text-xs text-content-muted hover:text-content font-medium"
                >
                  İptal
                </button>
                <button
                  onClick={() => {
                    watchlistStore.setNote(noteTarget.id, noteDraft);
                    setNoteTarget(null);
                  }}
                  className="px-3 py-1.5 bg-accent-600 text-ink-950 rounded-lg text-xs font-medium hover:bg-accent-300 transition"
                >
                  Kaydet
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bölüm Ekleme / Yeniden Adlandırma Modalı */}
      {sectionModal && (
        <div className="fixed inset-0 z-50 bg-canvas backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-raised border border-line rounded-2xl p-5 w-full max-w-xs space-y-4 shadow-2xl">
            <h3 className="text-sm font-medium text-content-strong">
              {sectionModal.mode === 'create' ? 'Yeni Bölüm' : 'Bölümü Yeniden Adlandır'}
            </h3>
            <input
              type="text"
              value={sectionDraft}
              onChange={(e) => setSectionDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitSectionModal()}
              placeholder="Bölüm Adı (Örn: Bankalar)..."
              autoFocus
              className="w-full bg-canvas border border-line rounded-xl px-3 py-2 text-xs text-content-strong outline-none focus:border-accent-500 transition"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setSectionModal(null); setSectionDraft(''); }}
                className="px-3 py-1.5 text-xs text-content-muted hover:text-content font-medium"
              >
                İptal
              </button>
              <button
                onClick={submitSectionModal}
                className="px-3 py-1.5 bg-accent-600 text-ink-950 rounded-lg text-xs font-medium hover:bg-accent-300 transition"
              >
                {sectionModal.mode === 'create' ? 'Ekle' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New List Modal */}
      {isNewListModalOpen && (
        <div className="fixed inset-0 z-50 bg-canvas backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-raised border border-line rounded-2xl p-5 w-full max-w-xs space-y-4 shadow-2xl">
            <h3 className="text-sm font-medium text-content-strong">Yeni İzleme Listesi</h3>
            {pendingListSymbol && (
              <p className="text-2xs text-content-muted">
                <span className="font-mono font-medium text-accent-300">{pendingListSymbol.symbol}</span>{' '}
                oluşturulan listeye eklenecek.
              </p>
            )}
            <input
              type="text"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitNewList()}
              placeholder="Liste Adı (Örn: Bankacılık)..."
              autoFocus
              className="w-full bg-canvas border border-line rounded-xl px-3 py-2 text-xs text-content-strong outline-none focus:border-accent-500 transition"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setIsNewListModalOpen(false);
                  setNewListName('');
                  setPendingListSymbol(null);
                }}
                className="px-3 py-1.5 text-xs text-content-muted hover:text-content font-medium"
              >
                İptal
              </button>
              <button
                onClick={submitNewList}
                className="px-3 py-1.5 bg-accent-600 text-ink-950 rounded-lg text-xs font-medium hover:bg-accent-300 transition"
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
