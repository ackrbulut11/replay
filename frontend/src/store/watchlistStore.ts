import { useState, useEffect } from 'react';
import { apiRequest } from '../services/api';
import { getQuotes } from '../services/marketApi';
import { TOKEN_STORAGE_KEY } from '../context/AuthContext';

export type FlagColor = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'cyan' | 'pink';

/**
 * Sağ tık menüsündeki işaret renkleri (TradingView sırasıyla).
 *
 * `flagColor` (sağlayıcıya göre atanan eski alan) ile karıştırılmamalı:
 * işaretleme kullanıcının bilinçli seçimidir ve `markColor`'da tutulur.
 */
export const MARK_COLORS: Array<{ key: FlagColor; hex: string }> = [
  { key: 'red', hex: '#ef4444' },
  { key: 'blue', hex: '#3b82f6' },
  { key: 'green', hex: '#22c55e' },
  { key: 'yellow', hex: '#eab308' },
  { key: 'purple', hex: '#a855f7' },
  { key: 'cyan', hex: '#22d3ee' },
  { key: 'pink', hex: '#f472b6' },
];

export function markColorHex(color?: FlagColor | null): string | null {
  if (!color) return null;
  return MARK_COLORS.find((c) => c.key === color)?.hex ?? null;
}

export interface WatchlistItem {
  id: string; // e.g. "bist:THYAO"
  /**
   * Satır tipi. Tanımsız = sembol (eski kayıtlarla geriye dönük uyum).
   * `section` satırları listeyi başlıklara böler; fiyat çekilmez, türetilmiş
   * piyasa listelerine kopyalanmaz.
   */
  kind?: 'symbol' | 'section';
  symbol: string;
  provider: string;
  name: string;
  exchange: string;
  flagColor: FlagColor;
  /** Kullanıcının sağ tık menüsünden seçtiği işaret rengi; yoksa işaretsiz. */
  markColor?: FlagColor | null;
  /** Sembole iliştirilen serbest metin not. */
  note?: string;
  lastPrice?: number | null;
  change?: number | null;
  changePercent?: number | null;
}

/** Bölüm başlığı satırları fiyat/türetme akışlarının dışında tutulur. */
export function isSection(item: WatchlistItem): boolean {
  return item.kind === 'section';
}

export interface WatchlistGroup {
  id: string;
  name: string;
  emoji: string;
  color: string;
  items: WatchlistItem[];
}

export interface WatchlistState {
  isOpen: boolean;
  panelWidth: number;
  activeRightTool: 'watchlist' | 'alerts' | null;
  activeListId: string;
  lists: WatchlistGroup[];
  quotesLoading: boolean;
}

const DEFAULT_LISTS: WatchlistGroup[] = [
  {
    id: 'favoriler',
    name: 'Favoriler',
    emoji: '⭐',
    color: '#f59e0b',
    items: [
      { id: 'bist:THYAO', symbol: 'THYAO', provider: 'bist', name: 'Türk Hava Yolları A.O.', exchange: 'BIST', flagColor: 'red' },
      { id: 'bist:GARAN', symbol: 'GARAN', provider: 'bist', name: 'Türkiye Garanti Bankası A.Ş.', exchange: 'BIST', flagColor: 'red' },
      { id: 'nasdaq:AAPL', symbol: 'AAPL', provider: 'nasdaq', name: 'Apple Inc.', exchange: 'NASDAQ', flagColor: 'blue' },
      { id: 'nasdaq:NVDA', symbol: 'NVDA', provider: 'nasdaq', name: 'NVIDIA Corporation', exchange: 'NASDAQ', flagColor: 'blue' },
      { id: 'binance:BTCUSDT', symbol: 'BTCUSDT', provider: 'binance', name: 'Bitcoin / Tether', exchange: 'BINANCE', flagColor: 'yellow' },
      { id: 'forex:EUR/USD', symbol: 'EUR/USD', provider: 'forex', name: 'Euro / US Dollar', exchange: 'FOREX', flagColor: 'green' },
    ],
  },
  {
    id: 'bist_favoriler',
    name: 'BIST',
    emoji: '🇹🇷',
    color: '#ef4444',
    items: [
      { id: 'bist:THYAO', symbol: 'THYAO', provider: 'bist', name: 'Türk Hava Yolları A.O.', exchange: 'BIST', flagColor: 'red' },
      { id: 'bist:GARAN', symbol: 'GARAN', provider: 'bist', name: 'Türkiye Garanti Bankası A.Ş.', exchange: 'BIST', flagColor: 'red' },
    ],
  },
  {
    id: 'nasdaq_favoriler',
    name: 'NASDAQ & ABD',
    emoji: '🇺🇸',
    color: '#3b82f6',
    items: [
      { id: 'nasdaq:AAPL', symbol: 'AAPL', provider: 'nasdaq', name: 'Apple Inc.', exchange: 'NASDAQ', flagColor: 'blue' },
      { id: 'nasdaq:NVDA', symbol: 'NVDA', provider: 'nasdaq', name: 'NVIDIA Corporation', exchange: 'NASDAQ', flagColor: 'blue' },
    ],
  },
  {
    id: 'kripto',
    name: 'Kripto',
    emoji: '₿',
    color: '#f97316',
    items: [
      { id: 'binance:BTCUSDT', symbol: 'BTCUSDT', provider: 'binance', name: 'Bitcoin / Tether', exchange: 'BINANCE', flagColor: 'yellow' },
    ],
  },
  {
    id: 'forex_favoriler',
    name: 'Forex (FX)',
    emoji: '💵',
    color: '#10b981',
    items: [
      { id: 'forex:EUR/USD', symbol: 'EUR/USD', provider: 'forex', name: 'Euro / US Dollar', exchange: 'FOREX', flagColor: 'green' },
    ],
  },
];

const LOCAL_STORAGE_KEY = 'replay_watchlists_v2';
const DEFAULT_PANEL_WIDTH = 288;

/**
 * Ensures strict 1-to-1 equivalence between Favoriler and Market Lists (BIST, NASDAQ, Kripto, Forex):
 */
function sanitizeLists(lists: WatchlistGroup[]): WatchlistGroup[] {
  const favorilerGroup = lists.find((g) => g.id === 'favoriler') || DEFAULT_LISTS[0];
  const favoriItems = favorilerGroup.items;

  // Bölüm başlıkları kullanıcının kendi düzenidir; türetilmiş piyasa
  // listelerine kopyalanmaz (orada anlamsız başlıklar oluştururdu).
  const favoriSymbols = favoriItems.filter((i) => !isSection(i));

  const bistItems = favoriSymbols.filter((i) => i.provider.toLowerCase() === 'bist');
  const nasdaqItems = favoriSymbols.filter((i) => i.provider.toLowerCase() === 'nasdaq' || i.provider.toLowerCase() === 'nyse');
  const kriptoItems = favoriSymbols.filter((i) => i.provider.toLowerCase() === 'binance' || i.provider.toLowerCase() === 'crypto');
  const forexItems = favoriSymbols.filter((i) => i.provider.toLowerCase() === 'forex' || i.provider.toLowerCase() === 'fx');

  const defaultMarketGroupIds = new Set(['favoriler', 'bist_favoriler', 'nasdaq_favoriler', 'kripto', 'forex_favoriler']);
  const customLists = lists.filter((g) => !defaultMarketGroupIds.has(g.id));

  return [
    { ...favorilerGroup, id: 'favoriler', name: 'Favoriler', emoji: '⭐', color: '#f59e0b', items: favoriItems },
    { id: 'bist_favoriler', name: 'BIST', emoji: '🇹🇷', color: '#ef4444', items: bistItems },
    { id: 'nasdaq_favoriler', name: 'NASDAQ & ABD', emoji: '🇺🇸', color: '#3b82f6', items: nasdaqItems },
    { id: 'kripto', name: 'Kripto', emoji: '₿', color: '#f97316', items: kriptoItems },
    { id: 'forex_favoriler', name: 'Forex (FX)', emoji: '💵', color: '#10b981', items: forexItems },
    ...customLists,
  ];
}




function loadInitialState(): WatchlistState {
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      let lists: WatchlistGroup[] = parsed.lists && parsed.lists.length > 0 ? parsed.lists : DEFAULT_LISTS;
      lists = sanitizeLists(lists);

      return {
        isOpen: parsed.isOpen !== undefined ? parsed.isOpen : true,
        panelWidth: parsed.panelWidth || DEFAULT_PANEL_WIDTH,
        activeRightTool: 'watchlist',
        activeListId: parsed.activeListId || 'favoriler',
        lists,
        quotesLoading: false,
      };
    }
  } catch (e) {
    console.error('Failed to load watchlist from localStorage', e);
  }
  return {
    isOpen: true,
    panelWidth: DEFAULT_PANEL_WIDTH,
    activeRightTool: 'watchlist',
    activeListId: 'favoriler',
    lists: sanitizeLists(DEFAULT_LISTS),
    quotesLoading: false,
  };
}

type Listener = (state: WatchlistState) => void;

let currentState: WatchlistState = loadInitialState();
const listeners: Set<Listener> = new Set();

let fetchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Süren bir fiyat sorgusu var mı.
 *
 * `/market/quotes` sembol başına veri yüklüyor; yavaş bir sağlayıcıda tek
 * çağrı 15 sn'lik periyottan uzun sürebiliyor ve istekler birikiyordu.
 */
let quotesInFlight = false;

function saveToLocalStorage() {
  try {
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({
        isOpen: currentState.isOpen,
        panelWidth: currentState.panelWidth,
        activeListId: currentState.activeListId,
        lists: currentState.lists,
      })
    );
  } catch (e) {
    console.error('Failed to save watchlist to localStorage', e);
  }
}

// ─── Sunucu senkronizasyonu ────────────────────────────────────────────────
//
// Listeler artık kullanıcıya bağlı olarak veritabanında saklanıyor; localStorage
// yalnızca ilk boyamada anında içerik göstermek için önbellek olarak kullanılıyor.
// Panel genişliği / açık-kapalı gibi cihaza özel tercihler sunucuya gitmez.

/** Sunucuda saklanan listeler: türetilmiş piyasa listeleri hariç tutulur. */
const DERIVED_LIST_IDS = new Set(['bist_favoriler', 'nasdaq_favoriler', 'kripto', 'forex_favoriler']);

/**
 * Sunucuya gidecek biçimi üretir.
 *
 * Fiyat alanları (lastPrice/change/changePercent) bilinçli olarak dışarıda
 * bırakılır: bunlar her fiyat yenilemesinde değişen geçici verilerdir,
 * kullanıcının listesi değil. Dahil edilseydi her fiyat güncellemesi sunucuya
 * gereksiz bir yazma tetiklerdi.
 */
function persistableLists(lists: WatchlistGroup[]): WatchlistGroup[] {
  return lists
    .filter((g) => !DERIVED_LIST_IDS.has(g.id))
    .map((g) => ({
      id: g.id,
      name: g.name,
      emoji: g.emoji,
      color: g.color,
      items: g.items.map((i) => ({
        id: i.id,
        kind: i.kind,
        symbol: i.symbol,
        provider: i.provider,
        name: i.name,
        exchange: i.exchange,
        flagColor: i.flagColor,
        markColor: i.markColor ?? null,
        note: i.note ?? '',
      })),
    }));
}

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let syncedOnce = false;
let syncInFlight = false;
// Son sunucuya yazılan içerik; aynı içerik tekrar gönderilmesin.
let lastPersistedJson = '';

function scheduleServerSave(delayMs = 800) {
  // Kullanıcı henüz senkronize olmadıysa yazma: sunucudaki kaydı
  // varsayılanlarla ezme riski olur.
  if (!syncedOnce) return;

  const payload = JSON.stringify(persistableLists(currentState.lists));
  // Yalnızca fiyatlar değiştiyse (liste yapısı aynıysa) sunucuya gitme.
  if (payload === lastPersistedJson) return;

  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    try {
      await apiRequest('/api/watchlist', { method: 'PUT', body: `{"lists":${payload}}` });
      lastPersistedJson = payload;
    } catch (e) {
      // Ağ hatasında yerel kopya korunur; bir sonraki değişiklikte tekrar denenir.
      console.warn('İzleme listesi sunucuya kaydedilemedi:', e);
    }
  }, delayMs);
}

function applyState(partial: Partial<WatchlistState>) {
  currentState = { ...currentState, ...partial };
  saveToLocalStorage();
  if (partial.lists) {
    scheduleServerSave();
  }
  listeners.forEach((listener) => listener(currentState));
}

function scheduleFetchQuotes(delayMs = 1500) {
  if (fetchDebounceTimer) clearTimeout(fetchDebounceTimer);
  fetchDebounceTimer = setTimeout(() => {
    watchlistStore.fetchQuotes();
  }, delayMs);
}

export const watchlistStore = {
  getState: (): WatchlistState => currentState,

  setState: (partial: Partial<WatchlistState> | ((prev: WatchlistState) => Partial<WatchlistState>)) => {
    const nextPartial = typeof partial === 'function' ? partial(currentState) : partial;
    applyState(nextPartial);
  },

  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /**
   * Giriş yapıldıktan sonra listeleri sunucudan yükler.
   *
   * Sunucuda kayıt yoksa (ilk geçiş veya yeni kullanıcı) yereldeki listeler
   * bir kez yukarı gönderilir; böylece mevcut favoriler kaybolmaz.
   */
  syncFromServer: async () => {
    // Token henüz yerleşmediyse istek 401 alır ve oturumu düşürür; bekle.
    if (!localStorage.getItem(TOKEN_STORAGE_KEY)) return;
    // Aynı anda birden fazla senkronizasyon çalışmasın (React StrictMode
    // geliştirmede effect'leri iki kez çağırır).
    if (syncInFlight) return;
    syncInFlight = true;

    try {
      const data = await apiRequest<{ lists: WatchlistGroup[] }>('/api/watchlist');
      const serverLists = data?.lists ?? [];

      if (serverLists.length > 0) {
        // Sunucudaki kayıt esastır.
        lastPersistedJson = JSON.stringify(persistableLists(serverLists));
        syncedOnce = true;
        applyState({ lists: sanitizeLists(serverLists) });
      } else {
        // Sunucu boş (yeni kullanıcı veya ilk geçiş): yereldekini yukarı taşı.
        const payload = JSON.stringify(persistableLists(currentState.lists));
        await apiRequest('/api/watchlist', { method: 'PUT', body: `{"lists":${payload}}` });
        lastPersistedJson = payload;
        syncedOnce = true;
      }
      watchlistStore.fetchQuotes();
    } catch (e) {
      // Sunucuya ulaşılamazsa yerel kopyayla çalışmaya devam edilir.
      console.warn('İzleme listesi sunucudan alınamadı:', e);
    } finally {
      syncInFlight = false;
    }
  },

  /**
   * Oturum kapandığında senkronizasyon durumunu ve bellekteki listeleri sıfırlar.
   *
   * Sadece senkronizasyon bayraklarını sıfırlamak yetmez: `currentState.lists`
   * (ve localStorage önbelleği) önceki kullanıcının verisiyle dolu kalırsa,
   * bir sonraki kullanıcı sunucuda henüz kaydı olmayan yeni bir hesapla giriş
   * yaptığında `syncFromServer`'daki "sunucu boş: yereldekini yukarı taşı"
   * dalı önceki kullanıcının favorilerini yeni hesaba yazar. Bu yüzden burada
   * bellek durumu da uygulamanın varsayılanlarına döndürülür.
   */
  resetForLogout: () => {
    syncedOnce = false;
    syncInFlight = false;
    lastPersistedJson = '';
    if (syncTimer) {
      clearTimeout(syncTimer);
      syncTimer = null;
    }
    currentState = {
      ...currentState,
      activeListId: 'favoriler',
      lists: sanitizeLists(DEFAULT_LISTS),
    };
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    } catch (e) {
      console.error('Failed to clear watchlist localStorage on logout', e);
    }
    listeners.forEach((listener) => listener(currentState));
  },

  togglePanel: () => {
    const nextOpen = !(currentState.isOpen && currentState.activeRightTool === 'watchlist');
    applyState({
      isOpen: nextOpen,
      activeRightTool: nextOpen ? 'watchlist' : null,
    });
  },

  setActiveRightTool: (tool: 'watchlist' | 'alerts' | null) => {
    if (currentState.activeRightTool === tool && currentState.isOpen) {
      applyState({ isOpen: false, activeRightTool: null });
    } else {
      applyState({ isOpen: true, activeRightTool: tool });
    }
  },

  setActiveList: (listId: string) => {
    applyState({ activeListId: listId });
    watchlistStore.fetchQuotes();
  },

  setPanelWidth: (width: number) => {
    const clamped = Math.max(220, Math.min(480, width));
    applyState({ panelWidth: clamped });
  },

  /** Yeni liste oluşturur ve kimliğini döndürür (çağıran hemen sembol ekleyebilsin). */
  createList: (name: string, emoji = '📋', color = '#6366f1'): string => {
    const newGroup: WatchlistGroup = {
      id: `custom_${Date.now()}`,
      name,
      emoji,
      color,
      items: [],
    };
    applyState({ lists: [...currentState.lists, newGroup], activeListId: newGroup.id });
    return newGroup.id;
  },

  addSymbol: (symbol: string, provider: string, name?: string, exchange?: string) => {
    const providerKey = provider.toLowerCase();
    const symKey = symbol.toUpperCase();
    const itemId = `${providerKey}:${symKey}`;

    const newItem: WatchlistItem = {
      id: itemId,
      kind: 'symbol',
      symbol: symKey,
      provider: providerKey,
      name: name || symKey,
      exchange: (exchange || provider).toUpperCase(),
      flagColor: providerKey === 'bist' ? 'red' : providerKey === 'nasdaq' ? 'blue' : 'yellow',
      markColor: null,
    };

    const favorilerGroup = currentState.lists.find((g) => g.id === 'favoriler') || currentState.lists[0];
    if (favorilerGroup.items.some((i) => i.id === itemId)) return; // already in favoriler

    const updatedFavoriItems = [...favorilerGroup.items, newItem];
    const updatedLists = currentState.lists.map((g) =>
      g.id === 'favoriler' ? { ...g, items: updatedFavoriItems } : g
    );

    applyState({ lists: sanitizeLists(updatedLists) });
    scheduleFetchQuotes(1500);
  },

  /**
   * Belirli bir listeye sembol ekler (Favoriler veya kullanıcının özel listesi).
   *
   * Türetilmiş piyasa listeleri (BIST/NASDAQ/Kripto/Forex) doğrudan
   * düzenlenemez — içerikleri Favoriler'den üretilir — bu yüzden sessizce
   * yok sayılır.
   */
  addSymbolToList: (listId: string, symbol: string, provider: string, name?: string, exchange?: string) => {
    if (DERIVED_LIST_IDS.has(listId)) return;

    const providerKey = provider.toLowerCase();
    const symKey = symbol.toUpperCase();
    const itemId = `${providerKey}:${symKey}`;

    const target = currentState.lists.find((g) => g.id === listId);
    if (!target || target.items.some((i) => i.id === itemId)) return;

    // Sembol başka bir listede zaten varsa işaret/not gibi kullanıcı verisi
    // korunsun diye oradaki kayıt temel alınır.
    const existing = currentState.lists
      .flatMap((g) => g.items)
      .find((i) => i.id === itemId);

    const newItem: WatchlistItem = existing
      ? { ...existing, lastPrice: undefined, change: undefined, changePercent: undefined }
      : {
          id: itemId,
          kind: 'symbol',
          symbol: symKey,
          provider: providerKey,
          name: name || symKey,
          exchange: (exchange || provider).toUpperCase(),
          flagColor: providerKey === 'bist' ? 'red' : providerKey === 'nasdaq' ? 'blue' : 'yellow',
          markColor: null,
        };

    const updatedLists = currentState.lists.map((g) =>
      g.id === listId ? { ...g, items: [...g.items, newItem] } : g
    );

    applyState({ lists: sanitizeLists(updatedLists) });
    scheduleFetchQuotes(1500);
  },

  /** Sembolü yalnızca verilen listeden çıkarır. */
  removeSymbolFromList: (listId: string, symbol: string, provider: string) => {
    if (DERIVED_LIST_IDS.has(listId)) return;
    const itemId = `${provider.toLowerCase()}:${symbol.toUpperCase()}`;
    const updatedLists = currentState.lists.map((g) =>
      g.id === listId ? { ...g, items: g.items.filter((i) => i.id !== itemId) } : g
    );
    applyState({ lists: sanitizeLists(updatedLists) });
  },

  /** Sağ tık menüsündeki liste onay kutuları için: ekliyse çıkarır, değilse ekler. */
  toggleSymbolInList: (listId: string, symbol: string, provider: string, name?: string, exchange?: string) => {
    const itemId = `${provider.toLowerCase()}:${symbol.toUpperCase()}`;
    const target = currentState.lists.find((g) => g.id === listId);
    if (!target) return;

    if (target.items.some((i) => i.id === itemId)) {
      watchlistStore.removeSymbolFromList(listId, symbol, provider);
    } else {
      watchlistStore.addSymbolToList(listId, symbol, provider, name, exchange);
    }
  },

  /** Sembolün bulunduğu, kullanıcı tarafından düzenlenebilir liste kimlikleri. */
  listIdsContaining: (symbol: string, provider: string): string[] => {
    const itemId = `${provider.toLowerCase()}:${symbol.toUpperCase()}`;
    return currentState.lists
      .filter((g) => !DERIVED_LIST_IDS.has(g.id) && g.items.some((i) => i.id === itemId))
      .map((g) => g.id);
  },

  /** Türetilmiş piyasa listeleri hariç, kullanıcının düzenleyebildiği listeler. */
  editableLists: (): WatchlistGroup[] =>
    currentState.lists.filter((g) => !DERIVED_LIST_IDS.has(g.id)),

  removeSymbol: (symbol: string, provider: string) => {
    const itemId = `${provider.toLowerCase()}:${symbol.toUpperCase()}`;

    const favorilerGroup = currentState.lists.find((g) => g.id === 'favoriler') || currentState.lists[0];
    const updatedFavoriItems = favorilerGroup.items.filter((i) => i.id !== itemId);
    const updatedLists = currentState.lists.map((g) =>
      g.id === 'favoriler' ? { ...g, items: updatedFavoriItems } : g
    );

    applyState({ lists: sanitizeLists(updatedLists) });
  },

  reorderSymbols: (listId: string, fromIndex: number, toIndex: number) => {
    const newLists = currentState.lists.map((group) => {
      if (group.id !== listId) return group;
      const newItems = [...group.items];
      const [removed] = newItems.splice(fromIndex, 1);
      newItems.splice(toIndex, 0, removed);
      return { ...group, items: newItems };
    });
    applyState({ lists: sanitizeLists(newLists) });
  },

  toggleSymbol: (symbol: string, provider: string, name?: string, exchange?: string) => {
    const isPresent = watchlistStore.isSymbolInAnyList(symbol, provider);
    if (isPresent) {
      watchlistStore.removeSymbol(symbol, provider);
    } else {
      watchlistStore.addSymbol(symbol, provider, name, exchange);
    }
  },

  isSymbolInActiveList: (symbol: string, provider: string): boolean => {
    const itemId = `${provider.toLowerCase()}:${symbol.toUpperCase()}`;
    const activeGroup = currentState.lists.find((g) => g.id === currentState.activeListId);
    return activeGroup ? activeGroup.items.some((i) => i.id === itemId) : false;
  },

  isSymbolInAnyList: (symbol: string, provider: string): boolean => {
    const itemId = `${provider.toLowerCase()}:${symbol.toUpperCase()}`;
    const favorilerGroup = currentState.lists.find((g) => g.id === 'favoriler');
    return favorilerGroup ? favorilerGroup.items.some((i) => i.id === itemId) : false;
  },

  cycleFlagColor: (itemId: string) => {
    const colors: FlagColor[] = ['red', 'blue', 'green', 'yellow', 'purple'];
    const newLists = currentState.lists.map((group) => ({
      ...group,
      items: group.items.map((item) => {
        if (item.id !== itemId) return item;
        const currentIdx = colors.indexOf(item.flagColor || 'red');
        const nextColor = colors[(currentIdx + 1) % colors.length];
        return { ...item, flagColor: nextColor };
      }),
    }));
    applyState({ lists: sanitizeLists(newLists) });
  },

  /**
   * Sembolü işaretler / işaretini kaldırır (`null` = işareti kaldır).
   *
   * İşaret sembole aittir, listeye değil: aynı sembol hangi listede geçiyorsa
   * hepsinde aynı rengi gösterir.
   */
  setMarkColor: (itemId: string, color: FlagColor | null) => {
    const newLists = currentState.lists.map((group) => ({
      ...group,
      items: group.items.map((item) => (item.id === itemId ? { ...item, markColor: color } : item)),
    }));
    applyState({ lists: sanitizeLists(newLists) });
  },

  /** İşaretliyse kaldırır, değilse varsayılan renkle işaretler. */
  toggleMark: (itemId: string) => {
    const item = currentState.lists.flatMap((g) => g.items).find((i) => i.id === itemId);
    watchlistStore.setMarkColor(itemId, item?.markColor ? null : 'red');
  },

  /** Tüm listelerdeki bütün işaretleri kaldırır. */
  clearAllMarks: () => {
    const newLists = currentState.lists.map((group) => ({
      ...group,
      items: group.items.map((item) => (item.markColor ? { ...item, markColor: null } : item)),
    }));
    applyState({ lists: sanitizeLists(newLists) });
  },

  /** Sembole not yazar; boş metin notu siler. İşaret gibi tüm listelerde ortaktır. */
  setNote: (itemId: string, note: string) => {
    const trimmed = note.trim();
    const newLists = currentState.lists.map((group) => ({
      ...group,
      items: group.items.map((item) =>
        item.id === itemId ? { ...item, note: trimmed || undefined } : item
      ),
    }));
    applyState({ lists: sanitizeLists(newLists) });
  },

  getNote: (itemId: string): string =>
    currentState.lists.flatMap((g) => g.items).find((i) => i.id === itemId)?.note || '',

  /**
   * Listeye bölüm başlığı ekler.
   *
   * `afterItemId` verilirse başlık o satırın hemen altına, verilmezse listenin
   * sonuna eklenir (sağ tık hangi satırda yapıldıysa oraya).
   */
  addSection: (listId: string, title: string, afterItemId?: string) => {
    if (DERIVED_LIST_IDS.has(listId)) return;

    const section: WatchlistItem = {
      id: `section_${Date.now()}`,
      kind: 'section',
      symbol: '',
      provider: '',
      name: title,
      exchange: '',
      flagColor: 'red',
      markColor: null,
    };

    const newLists = currentState.lists.map((group) => {
      if (group.id !== listId) return group;
      const items = [...group.items];
      const at = afterItemId ? items.findIndex((i) => i.id === afterItemId) : -1;
      if (at === -1) items.push(section);
      else items.splice(at + 1, 0, section);
      return { ...group, items };
    });

    applyState({ lists: sanitizeLists(newLists) });
  },

  renameSection: (listId: string, sectionId: string, title: string) => {
    const newLists = currentState.lists.map((group) =>
      group.id === listId
        ? { ...group, items: group.items.map((i) => (i.id === sectionId ? { ...i, name: title } : i)) }
        : group
    );
    applyState({ lists: sanitizeLists(newLists) });
  },

  removeSection: (listId: string, sectionId: string) => {
    const newLists = currentState.lists.map((group) =>
      group.id === listId ? { ...group, items: group.items.filter((i) => i.id !== sectionId) } : group
    );
    applyState({ lists: sanitizeLists(newLists) });
  },

  fetchQuotes: async () => {
    const activeGroup = currentState.lists.find((g) => g.id === currentState.activeListId);
    if (!activeGroup || activeGroup.items.length === 0) return;
    // Önceki sorgu hâlâ sürüyorsa bu turu atla.
    if (quotesInFlight) return;

    quotesInFlight = true;
    applyState({ quotesLoading: true });

    try {
      // Bölüm başlıklarının sembolü yoktur; fiyat sorgusuna girmemeli.
      const itemsToFetch = activeGroup.items.filter((i) => !isSection(i));
      if (itemsToFetch.length === 0) {
        applyState({ quotesLoading: false });
        return;
      }
      // Doğrudan fetch değil servis katmanı: token'sız istek 401 alır
      // (piyasa uçları artık giriş gerektiriyor).
      const quotes = await getQuotes(itemsToFetch.map((i) => `${i.provider}:${i.symbol}`));
      const quoteMap = new Map(quotes.map((q) => [`${q.provider.toLowerCase()}:${q.symbol.toUpperCase()}`, q]));

      const newLists = currentState.lists.map((group) => ({
        ...group,
        items: group.items.map((item) => {
          const q = quoteMap.get(item.id);
          if (!q) return item;
          return {
            ...item,
            lastPrice: q.lastPrice !== null ? q.lastPrice : item.lastPrice,
            change: q.change !== null ? q.change : item.change,
            changePercent: q.changePercent !== null ? q.changePercent : item.changePercent,
          };
        }),
      }));

      applyState({ lists: sanitizeLists(newLists), quotesLoading: false });
    } catch {
      applyState({ quotesLoading: false });
    } finally {
      quotesInFlight = false;
    }
  },

};

// Oturum kapandığında senkronizasyon durumunu sıfırla (bkz. SESSION_CLEARED_EVENT).
if (typeof window !== 'undefined') {
  window.addEventListener('replay:session-cleared', () => {
    watchlistStore.resetForLogout();
  });
}

export function useWatchlistStore(): [WatchlistState, (partial: Partial<WatchlistState> | ((prev: WatchlistState) => Partial<WatchlistState>)) => void] {
  const [state, setState] = useState<WatchlistState>(watchlistStore.getState());

  useEffect(() => {
    const unsubscribe = watchlistStore.subscribe((newState) => {
      setState(newState);
    });
    return unsubscribe;
  }, []);

  return [state, watchlistStore.setState];
}
