/**
 * İzleme listesi satırlarının sağ tık menüsü (TradingView düzeni).
 *
 * Menü iki bölümden oluşur:
 *  - Sağ tıklanan SEMBOLE özel maddeler (işaretle, listeye ekle, kıyasla, not)
 *  - Listenin geneline ait maddeler (bölüm ekle, sembol ekle) — bunlar boş
 *    alana sağ tıklandığında da görünür.
 *
 * Menü konumu `position: fixed` ile fare koordinatına yerleşir ve ekran
 * dışına taşacaksa sola/yukarı çevrilir.
 */

import { useEffect, useLayoutEffect, useRef, useState, memo } from 'react';
import {
  ListPlus, PlusCircle, SquarePen, Rows3, Plus, ChevronRight, Check, Trash2, Type,
} from 'lucide-react';
import {
  watchlistStore, WatchlistItem, WatchlistGroup, MARK_COLORS, markColorHex,
} from '../../store/watchlistStore';
import { compareStore } from '../../store/compareStore';

/** Menünün yaklaşık ölçüleri — ekran kenarına taşma hesabı için. */
const MENU_WIDTH = 300;

export interface ContextMenuTarget {
  x: number;
  y: number;
  /** Sağ tıklanan satır; boş alana tıklandıysa `null`. */
  item: WatchlistItem | null;
  /** Sağ tıklamanın yapıldığı listenin kimliği. */
  listId: string;
}

interface WatchlistContextMenuProps {
  target: ContextMenuTarget;
  /** Sembolün eklenebileceği listeler (türetilmiş piyasa listeleri hariç). */
  lists: WatchlistGroup[];
  onClose: () => void;
  onAddNote: (item: WatchlistItem) => void;
  onAddSection: (afterItemId?: string) => void;
  onRenameSection: (item: WatchlistItem) => void;
  onAddSymbol: () => void;
  onCreateList: (item: WatchlistItem | null) => void;
}

function WatchlistContextMenu({
  target,
  lists,
  onClose,
  onAddNote,
  onAddSection,
  onRenameSection,
  onAddSymbol,
  onCreateList,
}: WatchlistContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: target.x, top: target.y });

  const { item, listId } = target;
  const isSection = item?.kind === 'section';
  const symbolItem = item && !isSection ? item : null;
  const label = symbolItem?.symbol ?? '';

  // Sembolün hangi listelerde olduğu (onay kutuları için).
  const containingListIds = symbolItem
    ? watchlistStore.listIdsContaining(symbolItem.symbol, symbolItem.provider)
    : [];
  const isCompared = symbolItem ? compareStore.isCompared(symbolItem.symbol, symbolItem.provider) : false;
  const isMarked = !!symbolItem?.markColor;
  // Türetilmiş piyasa listelerinden satır çıkarılamaz (içerik Favoriler'den üretilir).
  const canRemoveFromList = !!symbolItem && lists.some((l) => l.id === listId);

  // Ölçüldükten sonra ekran dışına taşmayacak şekilde yerleştir.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const { offsetWidth: w, offsetHeight: h } = el;
    const left = target.x + w > window.innerWidth - 8 ? Math.max(8, target.x - w) : target.x;
    const top = target.y + h > window.innerHeight - 8 ? Math.max(8, window.innerHeight - h - 8) : target.y;
    setPos({ left, top });
  }, [target.x, target.y]);

  // Dışarı tıklama / Esc / kaydırma menüyü kapatır. Alt+Enter, TradingView'daki
  // gibi işareti açıp kapatır (menüdeki kısayol ipucu bunu gösteriyor).
  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'Enter' && e.altKey && symbolItem) {
        e.preventDefault();
        watchlistStore.toggleMark(symbolItem.id);
        onClose();
      }
    };

    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose, symbolItem]);

  const itemClass =
    'w-full flex items-center gap-3 px-3 py-2 text-[13px] text-zinc-200 hover:bg-white/[0.06] rounded-lg transition-colors text-left';

  return (
    <div
      ref={menuRef}
      style={{ left: pos.left, top: pos.top, width: MENU_WIDTH }}
      className="fixed z-[100] bg-[#0d1117] border border-white/[0.1] rounded-xl shadow-2xl p-1.5 select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      {symbolItem && (
        <>
          {/* İşaretle / işareti kaldır + renk seçenekleri */}
          <button
            type="button"
            className={itemClass}
            onClick={() => {
              watchlistStore.toggleMark(symbolItem.id);
              onClose();
            }}
          >
            <span className="flex-1">
              {label} sembolünü {isMarked ? 'işaretini kaldır' : 'işaretle'}
            </span>
            <span className="text-[11px] text-zinc-500 font-mono shrink-0">Alt + ↵</span>
          </button>

          <div className="flex items-center gap-2 px-3 py-2">
            {MARK_COLORS.map((c) => {
              const isActive = symbolItem.markColor === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  title={`${label} — ${c.key}`}
                  onClick={() => {
                    // Aynı renge tekrar tıklamak işareti kaldırır.
                    watchlistStore.setMarkColor(symbolItem.id, isActive ? null : c.key);
                    onClose();
                  }}
                  className="w-5 h-5 rounded-full shrink-0 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: isActive ? 'transparent' : c.hex,
                    border: isActive ? `3px solid ${c.hex}` : `1px solid ${c.hex}`,
                    boxShadow: isActive ? `0 0 0 1px ${c.hex}` : undefined,
                  }}
                />
              );
            })}
          </div>

          <button
            type="button"
            className={itemClass}
            onClick={() => {
              watchlistStore.clearAllMarks();
              onClose();
            }}
          >
            <span>Tüm sembollerin işaretini kaldır</span>
          </button>

          <div className="h-px bg-white/[0.08] my-1.5" />

          {/* İzleme listesine ekle — alt menüde listeler.
              Açılma tetiği saf CSS `group-hover` ile yapılıyor: React state
              üzerinden mouseenter/mouseleave'de yeniden render beklemek,
              backdrop-blur'lu bir menüde fare hareketine göze çarpan bir
              gecikmeyle tepki verilmesine yol açıyordu. */}
          <div className="relative group">
            <button type="button" className={itemClass}>
              <ListPlus className="w-4 h-4 text-zinc-400 shrink-0" />
              <span className="flex-1">{label} İzleme Listesine Ekle</span>
              <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
            </button>

            <div
              className="absolute left-[calc(100%-6px)] -top-1 hidden w-56 bg-[#0d1117] border border-white/[0.1] rounded-xl shadow-2xl p-1.5 z-10 group-hover:block"
              style={
                // Alt menü sağa sığmıyorsa sola aç.
                pos.left + MENU_WIDTH + 224 > window.innerWidth
                  ? { left: 'auto', right: 'calc(100% - 6px)' }
                  : undefined
              }
            >
              {lists.map((list) => {
                const checked = containingListIds.includes(list.id);
                return (
                  <button
                    key={list.id}
                    type="button"
                    className={itemClass}
                    onClick={() => {
                      watchlistStore.toggleSymbolInList(
                        list.id,
                        symbolItem.symbol,
                        symbolItem.provider,
                        symbolItem.name,
                        symbolItem.exchange,
                      );
                      onClose();
                    }}
                  >
                    <span
                      className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center ${
                        checked ? 'bg-indigo-500 border-indigo-500' : 'border-zinc-600'
                      }`}
                    >
                      {checked && <Check className="w-3 h-3 text-white" />}
                    </span>
                    <span className="truncate">{list.name}</span>
                  </button>
                );
              })}

              <div className="h-px bg-white/[0.08] my-1.5" />
              <button
                type="button"
                className={itemClass}
                onClick={() => {
                  onCreateList(symbolItem);
                  onClose();
                }}
              >
                <span>Yeni Liste Oluştur...</span>
              </button>
            </div>
          </div>

          {/* Kıyaslama serisi */}
          <button
            type="button"
            className={itemClass}
            onClick={() => {
              if (isCompared) compareStore.remove(symbolItem.id);
              else compareStore.add(symbolItem.symbol, symbolItem.provider);
              onClose();
            }}
          >
            <PlusCircle className="w-4 h-4 text-zinc-400 shrink-0" />
            <span>
              {isCompared
                ? `${label} sembolünü kıyaslamadan kaldır`
                : `Kıyaslamak için ${label} sembolünü ekleyin`}
            </span>
          </button>

          {/* Not */}
          <button
            type="button"
            className={itemClass}
            onClick={() => {
              onAddNote(symbolItem);
              onClose();
            }}
          >
            <SquarePen className="w-4 h-4 text-zinc-400 shrink-0" />
            <span>
              {symbolItem.note ? `${label} notunu düzenle` : `${label} için not ekle`}
            </span>
          </button>

          <div className="h-px bg-white/[0.08] my-1.5" />
        </>
      )}

      {isSection && item && (
        <>
          <button
            type="button"
            className={itemClass}
            onClick={() => {
              onRenameSection(item);
              onClose();
            }}
          >
            <Type className="w-4 h-4 text-zinc-400 shrink-0" />
            <span>Bölümü yeniden adlandır</span>
          </button>
          <button
            type="button"
            className={`${itemClass} text-red-400 hover:bg-red-500/10`}
            onClick={() => {
              watchlistStore.removeSection(listId, item.id);
              onClose();
            }}
          >
            <Trash2 className="w-4 h-4 shrink-0" />
            <span>Bölümü kaldır</span>
          </button>
          <div className="h-px bg-white/[0.08] my-1.5" />
        </>
      )}

      {/* Listenin geneline ait maddeler — sağ tıklanan sembolden bağımsızdır */}
      <button
        type="button"
        className={itemClass}
        onClick={() => {
          onAddSection(item?.id);
          onClose();
        }}
      >
        <Rows3 className="w-4 h-4 text-zinc-400 shrink-0" />
        <span>Bölüm ekle</span>
      </button>

      <button
        type="button"
        className={itemClass}
        onClick={() => {
          onAddSymbol();
          onClose();
        }}
      >
        <Plus className="w-4 h-4 text-zinc-400 shrink-0" />
        <span>Sembol ekle</span>
      </button>

      {canRemoveFromList && symbolItem && (
        <>
          <div className="h-px bg-white/[0.08] my-1.5" />
          <button
            type="button"
            className={`${itemClass} text-red-400 hover:bg-red-500/10`}
            onClick={() => {
              watchlistStore.removeSymbolFromList(listId, symbolItem.symbol, symbolItem.provider);
              onClose();
            }}
          >
            <Trash2 className="w-4 h-4 shrink-0" />
            <span>{label} sembolünü listeden kaldır</span>
          </button>
        </>
      )}

      {/* Menüdeki işaret renginin satırda göründüğü yer için görsel ipucu */}
      {symbolItem?.markColor && (
        <div className="px-3 pt-1.5 pb-1 text-[11px] text-zinc-500 flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: markColorHex(symbolItem.markColor) ?? undefined }}
          />
          <span>İşaretli</span>
        </div>
      )}
    </div>
  );
}

export default memo(WatchlistContextMenu);
