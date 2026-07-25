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

export const INITIAL_BIST_ITEMS: WatchlistItem[] = [
  { id: 'bist:THYAO', symbol: 'THYAO', provider: 'bist', name: 'Türk Hava Yolları A.O.', exchange: 'BIST', flagColor: 'red' },
  { id: 'bist:GARAN', symbol: 'GARAN', provider: 'bist', name: 'Türkiye Garanti Bankası A.Ş.', exchange: 'BIST', flagColor: 'red' },
  { id: 'bist:AKBNK', symbol: 'AKBNK', provider: 'bist', name: 'Akbank T.A.Ş.', exchange: 'BIST', flagColor: 'red' },
  { id: 'bist:ISCTR', symbol: 'ISCTR', provider: 'bist', name: 'Türkiye İş Bankası A.Ş.', exchange: 'BIST', flagColor: 'red' },
  { id: 'bist:EREGL', symbol: 'EREGL', provider: 'bist', name: 'Ereğli Demir ve Çelik Fabrikaları', exchange: 'BIST', flagColor: 'red' },
  { id: 'bist:ASELS', symbol: 'ASELS', provider: 'bist', name: 'Aselsan Elektronik Sanayi', exchange: 'BIST', flagColor: 'red' },
  { id: 'bist:KCHOL', symbol: 'KCHOL', provider: 'bist', name: 'Koç Holding A.Ş.', exchange: 'BIST', flagColor: 'red' },
  { id: 'bist:SAHOL', symbol: 'SAHOL', provider: 'bist', name: 'Hacı Ömer Sabancı Holding', exchange: 'BIST', flagColor: 'red' },
  { id: 'bist:TUPRS', symbol: 'TUPRS', provider: 'bist', name: 'Tüpraş - Türkiye Petrol Rafinerileri', exchange: 'BIST', flagColor: 'red' },
  { id: 'bist:BIMAS', symbol: 'BIMAS', provider: 'bist', name: 'BİM Birleşik Mağazalar A.Ş.', exchange: 'BIST', flagColor: 'red' },
  { id: 'bist:SISE', symbol: 'SISE', provider: 'bist', name: 'Türkiye Şişe ve Cam Fabrikaları', exchange: 'BIST', flagColor: 'red' },
  { id: 'bist:YKBNK', symbol: 'YKBNK', provider: 'bist', name: 'Yapı ve Kredi Bankası A.Ş.', exchange: 'BIST', flagColor: 'red' },
  { id: 'bist:VAKBN', symbol: 'VAKBN', provider: 'bist', name: 'Türkiye Vakıflar Bankası T.A.O.', exchange: 'BIST', flagColor: 'red' },
  { id: 'bist:HALKB', symbol: 'HALKB', provider: 'bist', name: 'Türkiye Halk Bankası A.Ş.', exchange: 'BIST', flagColor: 'red' },
  { id: 'bist:EKGYO', symbol: 'EKGYO', provider: 'bist', name: 'Emlak Konut Gayrimenkul', exchange: 'BIST', flagColor: 'red' },
  { id: 'bist:KOZAL', symbol: 'KOZAL', provider: 'bist', name: 'Koza Altın İşletmeleri A.Ş.', exchange: 'BIST', flagColor: 'red' },
  { id: 'bist:SASA', symbol: 'SASA', provider: 'bist', name: 'SASA Polyester Sanayi A.Ş.', exchange: 'BIST', flagColor: 'red' },
  { id: 'bist:HEKTS', symbol: 'HEKTS', provider: 'bist', name: 'Hektaş Ticaret T.A.Ş.', exchange: 'BIST', flagColor: 'red' },
  { id: 'bist:PETKM', symbol: 'PETKM', provider: 'bist', name: 'Petkim Petrokimya Holding', exchange: 'BIST', flagColor: 'red' },
  { id: 'bist:PGSUS', symbol: 'PGSUS', provider: 'bist', name: 'Pegasus Hava Taşımacılığı', exchange: 'BIST', flagColor: 'red' },
  { id: 'bist:FROTO', symbol: 'FROTO', provider: 'bist', name: 'Ford Otomotiv Sanayi A.Ş.', exchange: 'BIST', flagColor: 'red' },
  { id: 'bist:TOASO', symbol: 'TOASO', provider: 'bist', name: 'Tofaş Türk Otomobil Fabrikası', exchange: 'BIST', flagColor: 'red' },
  { id: 'bist:ODAS', symbol: 'ODAS', provider: 'bist', name: 'Odaş Elektrik Üretim Sanayi', exchange: 'BIST', flagColor: 'red' },
  { id: 'bist:TCELL', symbol: 'TCELL', provider: 'bist', name: 'Turkcell İletişim Hizmetleri', exchange: 'BIST', flagColor: 'red' },
  { id: 'bist:TTKOM', symbol: 'TTKOM', provider: 'bist', name: 'Türk Telekomünikasyon A.Ş.', exchange: 'BIST', flagColor: 'red' },
];

export const INITIAL_NASDAQ_ITEMS: WatchlistItem[] = [
  { id: 'nasdaq:AAPL', symbol: 'AAPL', provider: 'nasdaq', name: 'Apple Inc.', exchange: 'NASDAQ', flagColor: 'blue' },
  { id: 'nasdaq:MSFT', symbol: 'MSFT', provider: 'nasdaq', name: 'Microsoft Corporation', exchange: 'NASDAQ', flagColor: 'blue' },
  { id: 'nasdaq:NVDA', symbol: 'NVDA', provider: 'nasdaq', name: 'NVIDIA Corporation', exchange: 'NASDAQ', flagColor: 'blue' },
  { id: 'nasdaq:AMZN', symbol: 'AMZN', provider: 'nasdaq', name: 'Amazon.com Inc.', exchange: 'NASDAQ', flagColor: 'blue' },
  { id: 'nasdaq:GOOGL', symbol: 'GOOGL', provider: 'nasdaq', name: 'Alphabet Inc.', exchange: 'NASDAQ', flagColor: 'blue' },
  { id: 'nasdaq:META', symbol: 'META', provider: 'nasdaq', name: 'Meta Platforms Inc.', exchange: 'NASDAQ', flagColor: 'blue' },
  { id: 'nasdaq:TSLA', symbol: 'TSLA', provider: 'nasdaq', name: 'Tesla Inc.', exchange: 'NASDAQ', flagColor: 'blue' },
  { id: 'nasdaq:AVGO', symbol: 'AVGO', provider: 'nasdaq', name: 'Broadcom Inc.', exchange: 'NASDAQ', flagColor: 'blue' },
  { id: 'nasdaq:COST', symbol: 'COST', provider: 'nasdaq', name: 'Costco Wholesale Corp.', exchange: 'NASDAQ', flagColor: 'blue' },
  { id: 'nasdaq:AMD', symbol: 'AMD', provider: 'nasdaq', name: 'Advanced Micro Devices', exchange: 'NASDAQ', flagColor: 'blue' },
  { id: 'nasdaq:NFLX', symbol: 'NFLX', provider: 'nasdaq', name: 'Netflix Inc.', exchange: 'NASDAQ', flagColor: 'blue' },
  { id: 'nasdaq:PEP', symbol: 'PEP', provider: 'nasdaq', name: 'PepsiCo Inc.', exchange: 'NASDAQ', flagColor: 'blue' },
  { id: 'nasdaq:TMUS', symbol: 'TMUS', provider: 'nasdaq', name: 'T-Mobile US Inc.', exchange: 'NASDAQ', flagColor: 'blue' },
  { id: 'nasdaq:ADBE', symbol: 'ADBE', provider: 'nasdaq', name: 'Adobe Inc.', exchange: 'NASDAQ', flagColor: 'blue' },
  { id: 'nasdaq:CSCO', symbol: 'CSCO', provider: 'nasdaq', name: 'Cisco Systems Inc.', exchange: 'NASDAQ', flagColor: 'blue' },
  { id: 'nasdaq:INTU', symbol: 'INTU', provider: 'nasdaq', name: 'Intuit Inc.', exchange: 'NASDAQ', flagColor: 'blue' },
  { id: 'nasdaq:AMAT', symbol: 'AMAT', provider: 'nasdaq', name: 'Applied Materials Inc.', exchange: 'NASDAQ', flagColor: 'blue' },
  { id: 'nasdaq:QCOM', symbol: 'QCOM', provider: 'nasdaq', name: 'QUALCOMM Inc.', exchange: 'NASDAQ', flagColor: 'blue' },
  { id: 'nasdaq:TXN', symbol: 'TXN', provider: 'nasdaq', name: 'Texas Instruments Inc.', exchange: 'NASDAQ', flagColor: 'blue' },
  { id: 'nasdaq:HON', symbol: 'HON', provider: 'nasdaq', name: 'Honeywell International', exchange: 'NASDAQ', flagColor: 'blue' },
];

export const INITIAL_KRIPTO_ITEMS: WatchlistItem[] = [
  { id: 'binance:BTCUSDT', symbol: 'BTCUSDT', provider: 'binance', name: 'Bitcoin / Tether', exchange: 'BINANCE', flagColor: 'yellow' },
  { id: 'binance:ETHUSDT', symbol: 'ETHUSDT', provider: 'binance', name: 'Ethereum / Tether', exchange: 'BINANCE', flagColor: 'yellow' },
  { id: 'binance:SOLUSDT', symbol: 'SOLUSDT', provider: 'binance', name: 'Solana / Tether', exchange: 'BINANCE', flagColor: 'yellow' },
  { id: 'binance:BNBUSDT', symbol: 'BNBUSDT', provider: 'binance', name: 'BNB / Tether', exchange: 'BINANCE', flagColor: 'yellow' },
  { id: 'binance:XRPUSDT', symbol: 'XRPUSDT', provider: 'binance', name: 'XRP / Tether', exchange: 'BINANCE', flagColor: 'yellow' },
  { id: 'binance:ADAUSDT', symbol: 'ADAUSDT', provider: 'binance', name: 'Cardano / Tether', exchange: 'BINANCE', flagColor: 'yellow' },
  { id: 'binance:DOGEUSDT', symbol: 'DOGEUSDT', provider: 'binance', name: 'Dogecoin / Tether', exchange: 'BINANCE', flagColor: 'yellow' },
  { id: 'binance:AVAXUSDT', symbol: 'AVAXUSDT', provider: 'binance', name: 'Avalanche / Tether', exchange: 'BINANCE', flagColor: 'yellow' },
  { id: 'binance:LINKUSDT', symbol: 'LINKUSDT', provider: 'binance', name: 'Chainlink / Tether', exchange: 'BINANCE', flagColor: 'yellow' },
  { id: 'binance:MATICUSDT', symbol: 'MATICUSDT', provider: 'binance', name: 'Polygon / Tether', exchange: 'BINANCE', flagColor: 'yellow' },
  { id: 'binance:DOTUSDT', symbol: 'DOTUSDT', provider: 'binance', name: 'Polkadot / Tether', exchange: 'BINANCE', flagColor: 'yellow' },
  { id: 'binance:NEARUSDT', symbol: 'NEARUSDT', provider: 'binance', name: 'NEAR Protocol / Tether', exchange: 'BINANCE', flagColor: 'yellow' },
  { id: 'binance:ATOMUSDT', symbol: 'ATOMUSDT', provider: 'binance', name: 'Cosmos / Tether', exchange: 'BINANCE', flagColor: 'yellow' },
  { id: 'binance:LTCUSDT', symbol: 'LTCUSDT', provider: 'binance', name: 'Litecoin / Tether', exchange: 'BINANCE', flagColor: 'yellow' },
  { id: 'binance:ETCUSDT', symbol: 'ETCUSDT', provider: 'binance', name: 'Ethereum Classic / Tether', exchange: 'BINANCE', flagColor: 'yellow' },
  { id: 'binance:FETUSDT', symbol: 'FETUSDT', provider: 'binance', name: 'Artificial Superintelligence', exchange: 'BINANCE', flagColor: 'yellow' },
  { id: 'binance:RENDERUSDT', symbol: 'RENDERUSDT', provider: 'binance', name: 'Render Token / Tether', exchange: 'BINANCE', flagColor: 'yellow' },
  { id: 'binance:SUIUSDT', symbol: 'SUIUSDT', provider: 'binance', name: 'Sui / Tether', exchange: 'BINANCE', flagColor: 'yellow' },
  { id: 'binance:INJUSDT', symbol: 'INJUSDT', provider: 'binance', name: 'Injective / Tether', exchange: 'BINANCE', flagColor: 'yellow' },
  { id: 'binance:ARBUSDT', symbol: 'ARBUSDT', provider: 'binance', name: 'Arbitrum / Tether', exchange: 'BINANCE', flagColor: 'yellow' },
];

export const INITIAL_FOREX_ITEMS: WatchlistItem[] = [
  { id: 'forex:EUR/USD', symbol: 'EUR/USD', provider: 'forex', name: 'Euro / US Dollar', exchange: 'FOREX', flagColor: 'green' },
  { id: 'forex:GBP/USD', symbol: 'GBP/USD', provider: 'forex', name: 'British Pound / US Dollar', exchange: 'FOREX', flagColor: 'green' },
  { id: 'forex:USD/JPY', symbol: 'USD/JPY', provider: 'forex', name: 'US Dollar / Japanese Yen', exchange: 'FOREX', flagColor: 'green' },
  { id: 'forex:USD/CHF', symbol: 'USD/CHF', provider: 'forex', name: 'US Dollar / Swiss Franc', exchange: 'FOREX', flagColor: 'green' },
  { id: 'forex:AUD/USD', symbol: 'AUD/USD', provider: 'forex', name: 'Australian Dollar / US Dollar', exchange: 'FOREX', flagColor: 'green' },
  { id: 'forex:USD/CAD', symbol: 'USD/CAD', provider: 'forex', name: 'US Dollar / Canadian Dollar', exchange: 'FOREX', flagColor: 'green' },
  { id: 'forex:NZD/USD', symbol: 'NZD/USD', provider: 'forex', name: 'New Zealand Dollar / US Dollar', exchange: 'FOREX', flagColor: 'green' },
  { id: 'forex:EUR/JPY', symbol: 'EUR/JPY', provider: 'forex', name: 'Euro / Japanese Yen', exchange: 'FOREX', flagColor: 'green' },
  { id: 'forex:EUR/GBP', symbol: 'EUR/GBP', provider: 'forex', name: 'Euro / British Pound', exchange: 'FOREX', flagColor: 'green' },
  { id: 'forex:EUR/CHF', symbol: 'EUR/CHF', provider: 'forex', name: 'Euro / Swiss Franc', exchange: 'FOREX', flagColor: 'green' },
  { id: 'forex:GBP/JPY', symbol: 'GBP/JPY', provider: 'forex', name: 'British Pound / Japanese Yen', exchange: 'FOREX', flagColor: 'green' },
  { id: 'forex:AUD/JPY', symbol: 'AUD/JPY', provider: 'forex', name: 'Australian Dollar / Japanese Yen', exchange: 'FOREX', flagColor: 'green' },
  { id: 'forex:USD/TRY', symbol: 'USD/TRY', provider: 'forex', name: 'US Dollar / Turkish Lira', exchange: 'FOREX', flagColor: 'green' },
  { id: 'forex:EUR/TRY', symbol: 'EUR/TRY', provider: 'forex', name: 'Euro / Turkish Lira', exchange: 'FOREX', flagColor: 'green' },
  { id: 'forex:USD/CNH', symbol: 'USD/CNH', provider: 'forex', name: 'US Dollar / Chinese Yuan (Offshore)', exchange: 'FOREX', flagColor: 'green' },
  { id: 'forex:USD/SGD', symbol: 'USD/SGD', provider: 'forex', name: 'US Dollar / Singapore Dollar', exchange: 'FOREX', flagColor: 'green' },
  { id: 'forex:USD/INR', symbol: 'USD/INR', provider: 'forex', name: 'US Dollar / Indian Rupee', exchange: 'FOREX', flagColor: 'green' },
  { id: 'forex:USD/MXN', symbol: 'USD/MXN', provider: 'forex', name: 'US Dollar / Mexican Peso', exchange: 'FOREX', flagColor: 'green' },
  { id: 'forex:USD/ZAR', symbol: 'USD/ZAR', provider: 'forex', name: 'US Dollar / South African Rand', exchange: 'FOREX', flagColor: 'green' },
  { id: 'forex:USD/HKD', symbol: 'USD/HKD', provider: 'forex', name: 'US Dollar / Hong Kong Dollar', exchange: 'FOREX', flagColor: 'green' },
];

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
    items: INITIAL_BIST_ITEMS,
  },
  {
    id: 'nasdaq_favoriler',
    name: 'NASDAQ & ABD',
    emoji: '🇺🇸',
    color: '#3b82f6',
    items: INITIAL_NASDAQ_ITEMS,
  },
  {
    id: 'kripto',
    name: 'Kripto',
    emoji: '₿',
    color: '#f97316',
    items: INITIAL_KRIPTO_ITEMS,
  },
  {
    id: 'forex_favoriler',
    name: 'Forex (FX)',
    emoji: '💵',
    color: '#10b981',
    items: INITIAL_FOREX_ITEMS,
  },
];

const LOCAL_STORAGE_KEY = 'replay_watchlists_v2';
const DEFAULT_PANEL_WIDTH = 288;

/**
 * Ensures Market Lists (BIST, NASDAQ, Kripto, Forex) contain full category items,
 * and Favoriler contains only user-favorited symbols.
 */
function sanitizeLists(lists: WatchlistGroup[]): WatchlistGroup[] {
  const favorilerGroup = lists.find((g) => g.id === 'favoriler') || DEFAULT_LISTS[0];

  const mergeItems = (defaultItems: WatchlistItem[], existingGroup?: WatchlistGroup) => {
    if (!existingGroup) return defaultItems;
    const priceMap = new Map(existingGroup.items.map((i) => [i.id, i]));
    return defaultItems.map((def) => {
      const live = priceMap.get(def.id);
      return live ? { ...def, ...live } : def;
    });
  };

  const existingBist = lists.find((g) => g.id === 'bist_favoriler');
  const existingNasdaq = lists.find((g) => g.id === 'nasdaq_favoriler');
  const existingKripto = lists.find((g) => g.id === 'kripto');
  const existingForex = lists.find((g) => g.id === 'forex_favoriler');

  const defaultMarketGroupIds = new Set(['favoriler', 'bist_favoriler', 'nasdaq_favoriler', 'kripto', 'forex_favoriler']);
  const customLists = lists.filter((g) => !defaultMarketGroupIds.has(g.id));

  return [
    { ...favorilerGroup, id: 'favoriler', name: 'Favoriler', emoji: '⭐', color: '#f59e0b' },
    { id: 'bist_favoriler', name: 'BIST', emoji: '🇹🇷', color: '#ef4444', items: mergeItems(INITIAL_BIST_ITEMS, existingBist) },
    { id: 'nasdaq_favoriler', name: 'NASDAQ & ABD', emoji: '🇺🇸', color: '#3b82f6', items: mergeItems(INITIAL_NASDAQ_ITEMS, existingNasdaq) },
    { id: 'kripto', name: 'Kripto', emoji: '₿', color: '#f97316', items: mergeItems(INITIAL_KRIPTO_ITEMS, existingKripto) },
    { id: 'forex_favoriler', name: 'Forex (FX)', emoji: '💵', color: '#10b981', items: mergeItems(INITIAL_FOREX_ITEMS, existingForex) },
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
      const itemKeys = itemsToFetch.map((i) => `${i.provider}:${i.symbol}`).join(',');
      const res = await fetch(`/api/market/quotes?items=${encodeURIComponent(itemKeys)}`);
      if (res.ok) {
        const quotes: Array<{ provider: string; symbol: string; lastPrice: number | null; change: number | null; changePercent: number | null }> = await res.json();
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
      } else {
        applyState({ quotesLoading: false });
      }
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
