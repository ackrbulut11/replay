import { useState, useEffect } from 'react';

export type FlagColor = 'red' | 'blue' | 'green' | 'yellow' | 'purple';

export interface WatchlistItem {
  id: string; // e.g. "bist:THYAO"
  symbol: string;
  provider: string;
  name: string;
  exchange: string;
  flagColor: FlagColor;
  lastPrice?: number | null;
  change?: number | null;
  changePercent?: number | null;
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
];

const LOCAL_STORAGE_KEY = 'replay_watchlists_v2';
const DEFAULT_PANEL_WIDTH = 288;

/**
 * Ensures strict 1-to-1 equivalence between Favoriler and Market Lists (BIST, NASDAQ, Kripto):
 * 1. Favoriler is the master source of truth.
 * 2. Every BIST symbol in Favoriler MUST exist in the BIST list.
 * 3. Every NASDAQ symbol in Favoriler MUST exist in the NASDAQ list.
 * 4. Every Kripto symbol in Favoriler MUST exist in the Kripto list.
 * 5. NO symbol that is not in Favoriler can exist in any market list.
 */
function sanitizeLists(lists: WatchlistGroup[]): WatchlistGroup[] {
  const favorilerGroup = lists.find((g) => g.id === 'favoriler') || DEFAULT_LISTS[0];
  const favoriItems = favorilerGroup.items;

  const bistItems = favoriItems.filter((i) => i.provider.toLowerCase() === 'bist');
  const nasdaqItems = favoriItems.filter((i) => i.provider.toLowerCase() === 'nasdaq' || i.provider.toLowerCase() === 'nyse');
  const kriptoItems = favoriItems.filter((i) => i.provider.toLowerCase() === 'binance' || i.provider.toLowerCase() === 'crypto');

  const defaultMarketGroupIds = new Set(['favoriler', 'bist_favoriler', 'nasdaq_favoriler', 'kripto']);
  const customLists = lists.filter((g) => !defaultMarketGroupIds.has(g.id));

  return [
    { ...favorilerGroup, id: 'favoriler', name: 'Favoriler', emoji: '⭐', color: '#f59e0b', items: favoriItems },
    { id: 'bist_favoriler', name: 'BIST', emoji: '🇹🇷', color: '#ef4444', items: bistItems },
    { id: 'nasdaq_favoriler', name: 'NASDAQ & ABD', emoji: '🇺🇸', color: '#3b82f6', items: nasdaqItems },
    { id: 'kripto', name: 'Kripto', emoji: '₿', color: '#f97316', items: kriptoItems },
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

function applyState(partial: Partial<WatchlistState>) {
  currentState = { ...currentState, ...partial };
  saveToLocalStorage();
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

  createList: (name: string, emoji = '📋', color = '#6366f1') => {
    const newGroup: WatchlistGroup = {
      id: `custom_${Date.now()}`,
      name,
      emoji,
      color,
      items: [],
    };
    applyState({ lists: [...currentState.lists, newGroup], activeListId: newGroup.id });
  },

  addSymbol: (symbol: string, provider: string, name?: string, exchange?: string) => {
    const providerKey = provider.toLowerCase();
    const symKey = symbol.toUpperCase();
    const itemId = `${providerKey}:${symKey}`;

    const newItem: WatchlistItem = {
      id: itemId,
      symbol: symKey,
      provider: providerKey,
      name: name || symKey,
      exchange: (exchange || provider).toUpperCase(),
      flagColor: providerKey === 'bist' ? 'red' : providerKey === 'nasdaq' ? 'blue' : 'yellow',
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

  fetchQuotes: async () => {
    const activeGroup = currentState.lists.find((g) => g.id === currentState.activeListId);
    if (!activeGroup || activeGroup.items.length === 0) return;

    applyState({ quotesLoading: true });

    try {
      const itemsToFetch = activeGroup.items;
      const updatedItems = await Promise.all(
        itemsToFetch.map(async (item) => {
          try {
            const end = new Date().toISOString().split('T')[0];
            const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            const res = await fetch(
              `/api/market/data?provider=${item.provider}&symbol=${item.symbol}&timeframe=1d&start=${start}&end=${end}`
            );
            if (!res.ok) return item;
            const data = await res.json();
            if (!data || data.length === 0) return item;

            const lastCandle = data[data.length - 1];
            const prevCandle = data.length > 1 ? data[data.length - 2] : null;

            const lastPrice = lastCandle.close;
            let change: number | null = null;
            let changePercent: number | null = null;

            if (prevCandle && prevCandle.close) {
              change = lastPrice - prevCandle.close;
              changePercent = (change / prevCandle.close) * 100;
            } else if (lastCandle.open) {
              change = lastPrice - lastCandle.open;
              changePercent = (change / lastCandle.open) * 100;
            }

            return {
              ...item,
              lastPrice,
              change,
              changePercent,
            };
          } catch {
            return item;
          }
        })
      );

      const itemMap = new Map(updatedItems.map((i) => [i.id, i]));
      const newLists = currentState.lists.map((group) => ({
        ...group,
        items: group.items.map((item) => itemMap.get(item.id) || item),
      }));

      applyState({ lists: sanitizeLists(newLists), quotesLoading: false });
    } catch {
      applyState({ quotesLoading: false });
    }
  },
};

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
