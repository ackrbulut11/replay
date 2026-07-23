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
  emoji: string;  // display emoji instead of color dot
  color: string;  // Hex or CSS color
  items: WatchlistItem[];
}

export interface WatchlistState {
  isOpen: boolean;
  panelWidth: number; // px, resizable
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
    name: 'BIST 100',
    emoji: '🇹🇷',
    color: '#ef4444',
    items: [
      { id: 'bist:THYAO', symbol: 'THYAO', provider: 'bist', name: 'Türk Hava Yolları A.O.', exchange: 'BIST', flagColor: 'red' },
      { id: 'bist:GARAN', symbol: 'GARAN', provider: 'bist', name: 'Türkiye Garanti Bankası A.Ş.', exchange: 'BIST', flagColor: 'red' },
      { id: 'bist:EREGL', symbol: 'EREGL', provider: 'bist', name: 'Ereğli Demir Çelik', exchange: 'BIST', flagColor: 'red' },
      { id: 'bist:SISE', symbol: 'SISE', provider: 'bist', name: 'Türkiye Şişe ve Cam Fab.', exchange: 'BIST', flagColor: 'red' },
      { id: 'bist:AKBNK', symbol: 'AKBNK', provider: 'bist', name: 'Akbank T.A.Ş.', exchange: 'BIST', flagColor: 'red' },
      { id: 'bist:ASELS', symbol: 'ASELS', provider: 'bist', name: 'Aselsan Elektronik Sanayi', exchange: 'BIST', flagColor: 'red' },
      { id: 'bist:TUPRS', symbol: 'TUPRS', provider: 'bist', name: 'Tüpraş Türkiye Pet. Raf.', exchange: 'BIST', flagColor: 'red' },
    ],
  },
  {
    id: 'nasdaq_favoriler',
    name: 'NASDAQ & ABD',
    emoji: '🇺🇸',
    color: '#3b82f6',
    items: [
      { id: 'nasdaq:AAPL', symbol: 'AAPL', provider: 'nasdaq', name: 'Apple Inc.', exchange: 'NASDAQ', flagColor: 'blue' },
      { id: 'nasdaq:MSFT', symbol: 'MSFT', provider: 'nasdaq', name: 'Microsoft Corporation', exchange: 'NASDAQ', flagColor: 'blue' },
      { id: 'nasdaq:NVDA', symbol: 'NVDA', provider: 'nasdaq', name: 'NVIDIA Corporation', exchange: 'NASDAQ', flagColor: 'blue' },
      { id: 'nasdaq:AMZN', symbol: 'AMZN', provider: 'nasdaq', name: 'Amazon.com Inc.', exchange: 'NASDAQ', flagColor: 'blue' },
      { id: 'nasdaq:GOOGL', symbol: 'GOOGL', provider: 'nasdaq', name: 'Alphabet Inc.', exchange: 'NASDAQ', flagColor: 'blue' },
      { id: 'nasdaq:META', symbol: 'META', provider: 'nasdaq', name: 'Meta Platforms Inc.', exchange: 'NASDAQ', flagColor: 'blue' },
      { id: 'nasdaq:TSLA', symbol: 'TSLA', provider: 'nasdaq', name: 'Tesla Inc.', exchange: 'NASDAQ', flagColor: 'blue' },
    ],
  },
  {
    id: 'kripto',
    name: 'Kripto',
    emoji: '₿',
    color: '#f97316',
    items: [
      { id: 'binance:BTCUSDT', symbol: 'BTCUSDT', provider: 'binance', name: 'Bitcoin / Tether', exchange: 'BINANCE', flagColor: 'yellow' },
      { id: 'binance:ETHUSDT', symbol: 'ETHUSDT', provider: 'binance', name: 'Ethereum / Tether', exchange: 'BINANCE', flagColor: 'yellow' },
      { id: 'binance:SOLUSDT', symbol: 'SOLUSDT', provider: 'binance', name: 'Solana / Tether', exchange: 'BINANCE', flagColor: 'purple' },
    ],
  },
];

// Determine which list a symbol best belongs to based on its provider
function getSmartListId(provider: string): string {
  switch (provider.toLowerCase()) {
    case 'bist': return 'bist_favoriler';
    case 'nasdaq': return 'nasdaq_favoriler';
    case 'binance': return 'kripto';
    default: return 'favoriler';
  }
}

const LOCAL_STORAGE_KEY = 'replay_watchlists_v2';
const DEFAULT_PANEL_WIDTH = 288; // 72 tailwind units = 288px

function loadInitialState(): WatchlistState {
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Merge stored lists with defaults to pick up new lists (like kripto)
      let lists = parsed.lists && parsed.lists.length > 0 ? parsed.lists : DEFAULT_LISTS;
      // Ensure all lists have an emoji field (migration)
      lists = lists.map((l: WatchlistGroup) => {
        if (!l.emoji) {
          const def = DEFAULT_LISTS.find(d => d.id === l.id);
          return { ...l, emoji: def?.emoji || '📋' };
        }
        return l;
      });
      // Add missing default lists (e.g. kripto)
      DEFAULT_LISTS.forEach(def => {
        if (!lists.find((l: WatchlistGroup) => l.id === def.id)) {
          lists = [...lists, def];
        }
      });
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
    lists: DEFAULT_LISTS,
    quotesLoading: false,
  };
}

type Listener = (state: WatchlistState) => void;

let currentState: WatchlistState = loadInitialState();
const listeners: Set<Listener> = new Set();

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

export const watchlistStore = {
  getState: (): WatchlistState => currentState,

  setState: (partial: Partial<WatchlistState> | ((prev: WatchlistState) => Partial<WatchlistState>)) => {
    const nextPartial = typeof partial === 'function' ? partial(currentState) : partial;
    currentState = { ...currentState, ...nextPartial };
    saveToLocalStorage();
    listeners.forEach((listener) => listener(currentState));
  },

  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  togglePanel: () => {
    const nextOpen = !(currentState.isOpen && currentState.activeRightTool === 'watchlist');
    watchlistStore.setState({
      isOpen: nextOpen,
      activeRightTool: nextOpen ? 'watchlist' : null,
    });
  },

  setActiveRightTool: (tool: 'watchlist' | 'alerts' | null) => {
    if (currentState.activeRightTool === tool && currentState.isOpen) {
      watchlistStore.setState({ isOpen: false, activeRightTool: null });
    } else {
      watchlistStore.setState({ isOpen: true, activeRightTool: tool });
    }
  },

  setActiveList: (listId: string) => {
    watchlistStore.setState({ activeListId: listId });
    watchlistStore.fetchQuotes();
  },

  setPanelWidth: (width: number) => {
    const clamped = Math.max(220, Math.min(480, width));
    watchlistStore.setState({ panelWidth: clamped });
  },

  // Smart add: routes to the appropriate provider-specific list automatically
  addSymbol: (symbol: string, provider: string, name?: string, exchange?: string, listId?: string) => {
    // If no explicit listId, route by provider
    const targetListId = listId || getSmartListId(provider);
    const itemId = `${provider.toLowerCase()}:${symbol.toUpperCase()}`;

    // Also add to Favoriler (first list) always
    const listsToUpdate = new Set([targetListId]);
    // Only add to "favoriler" if we're not already targeting it
    // and always add to the correct provider list
    if (targetListId !== 'favoriler') {
      listsToUpdate.add('favoriler');
    }

    const newLists = currentState.lists.map((group) => {
      if (!listsToUpdate.has(group.id)) return group;
      if (group.items.some((i) => i.id === itemId)) return group;

      const newItem: WatchlistItem = {
        id: itemId,
        symbol: symbol.toUpperCase(),
        provider: provider.toLowerCase(),
        name: name || symbol.toUpperCase(),
        exchange: (exchange || provider).toUpperCase(),
        flagColor: provider === 'bist' ? 'red' : provider === 'nasdaq' ? 'blue' : 'yellow',
      };
      return { ...group, items: [...group.items, newItem] };
    });

    watchlistStore.setState({ lists: newLists });
    watchlistStore.fetchQuotes();
  },

  removeSymbol: (symbol: string, provider: string, listId?: string) => {
    const targetListId = listId || currentState.activeListId;
    const itemId = `${provider.toLowerCase()}:${symbol.toUpperCase()}`;

    const newLists = currentState.lists.map((group) => {
      if (group.id !== targetListId) return group;
      return {
        ...group,
        items: group.items.filter((i) => i.id !== itemId),
      };
    });

    watchlistStore.setState({ lists: newLists });
  },

  toggleSymbol: (symbol: string, provider: string, name?: string, exchange?: string) => {
    const isPresent = watchlistStore.isSymbolInAnyList(symbol, provider);
    if (isPresent) {
      // Remove from all lists
      const itemId = `${provider.toLowerCase()}:${symbol.toUpperCase()}`;
      const newLists = currentState.lists.map((group) => ({
        ...group,
        items: group.items.filter((i) => i.id !== itemId),
      }));
      watchlistStore.setState({ lists: newLists });
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
    return currentState.lists.some((g) => g.items.some((i) => i.id === itemId));
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
    watchlistStore.setState({ lists: newLists });
  },

  createList: (name: string, emoji = '📋', color = '#6366f1') => {
    const id = `list_${Date.now()}`;
    const newList: WatchlistGroup = { id, name, emoji, color, items: [] };
    watchlistStore.setState({
      lists: [...currentState.lists, newList],
      activeListId: id,
    });
  },

  deleteList: (listId: string) => {
    if (currentState.lists.length <= 1) return;
    const newLists = currentState.lists.filter((l) => l.id !== listId);
    const nextActive = newLists[0].id;
    watchlistStore.setState({
      lists: newLists,
      activeListId: nextActive,
    });
  },

  fetchQuotes: async () => {
    const activeGroup = currentState.lists.find((g) => g.id === currentState.activeListId);
    if (!activeGroup || activeGroup.items.length === 0) return;

    watchlistStore.setState({ quotesLoading: true });
    try {
      const itemParams = activeGroup.items.map((i) => `${i.provider}:${i.symbol}`).join(',');
      const res = await fetch(`/api/market/quotes?items=${encodeURIComponent(itemParams)}`);
      if (res.ok) {
        const quotes: Array<{
          provider: string;
          symbol: string;
          lastPrice: number | null;
          change: number | null;
          changePercent: number | null;
        }> = await res.json();

        const quoteMap = new Map<string, { lastPrice: number | null; change: number | null; changePercent: number | null }>();
        quotes.forEach((q) => {
          quoteMap.set(`${q.provider}:${q.symbol}`, {
            lastPrice: q.lastPrice,
            change: q.change,
            changePercent: q.changePercent,
          });
        });

        const newLists = currentState.lists.map((group) => {
          if (group.id !== currentState.activeListId) return group;
          return {
            ...group,
            items: group.items.map((item) => {
              const q = quoteMap.get(item.id);
              if (q) {
                return {
                  ...item,
                  lastPrice: q.lastPrice,
                  change: q.change,
                  changePercent: q.changePercent,
                };
              }
              return item;
            }),
          };
        });

        watchlistStore.setState({ lists: newLists });
      }
    } catch (e) {
      console.error('Failed to fetch watchlist quotes', e);
    } finally {
      watchlistStore.setState({ quotesLoading: false });
    }
  },
};

export function useWatchlistStore(): [WatchlistState, typeof watchlistStore] {
  const [state, setState] = useState<WatchlistState>(watchlistStore.getState());

  useEffect(() => {
    const unsubscribe = watchlistStore.subscribe((newState) => {
      setState(newState);
    });
    return unsubscribe;
  }, []);

  return [state, watchlistStore];
}
