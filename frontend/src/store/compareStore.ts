/**
 * Grafiğe kıyaslama (karşılaştırma) sembolleri ekleyen mağaza.
 *
 * Ana sembolün mum grafiği yerinde kalır; buraya eklenen her sembol grafiğe
 * ayrı bir çizgi olarak biner (bkz. CandleChart `compare` efekti). Çizgiler
 * ana fiyat ekseninde okunabilsin diye ham fiyat değil, pencerenin ilk mumuna
 * göre ORANLANMIŞ değer çizilir: iki sembolün fiyat seviyeleri (ör. 4.300 USD
 * altın ile 65.000 USD bitcoin) birbirinden bağımsız olarak aynı grafikte
 * yüzdesel olarak karşılaştırılabilir.
 *
 * Kalıcı değildir: kıyaslama, üzerinde çalışılan grafiğe ait geçici bir
 * görünüm tercihidir; sayfa yenilendiğinde temiz bir grafikle başlanır.
 */

import { useState, useEffect } from 'react';

export interface CompareItem {
  /** `provider:SYMBOL` — izleme listesi öğe kimliğiyle aynı biçim. */
  id: string;
  symbol: string;
  provider: string;
  /** Grafikteki çizgi rengi. */
  color: string;
  /** Çizgi kalınlığı (piksel). */
  lineWidth: number;
  /** Lejanttaki göz düğmesi: seri kalır, yalnızca gizlenir. */
  visible: boolean;
}

export interface CompareState {
  items: CompareItem[];
}

/** Sırayla dağıtılan çizgi renkleri (gösterge renkleriyle çakışmayacak tonlar). */
const COMPARE_COLORS = ['#f472b6', '#22d3ee', '#a855f7', '#facc15', '#fb923c', '#4ade80'];

type Listener = (state: CompareState) => void;

let currentState: CompareState = { items: [] };
const listeners: Set<Listener> = new Set();

function applyState(partial: Partial<CompareState>) {
  currentState = { ...currentState, ...partial };
  listeners.forEach((listener) => listener(currentState));
}

export const compareStore = {
  getState: (): CompareState => currentState,

  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /** Zaten ekliyse yok sayar (aynı sembol iki kez çizilmez). */
  add: (symbol: string, provider: string) => {
    const id = `${provider.toLowerCase()}:${symbol.toUpperCase()}`;
    if (currentState.items.some((i) => i.id === id)) return;

    const usedColors = new Set(currentState.items.map((i) => i.color));
    const color = COMPARE_COLORS.find((c) => !usedColors.has(c)) || COMPARE_COLORS[currentState.items.length % COMPARE_COLORS.length];

    applyState({
      items: [
        ...currentState.items,
        { id, symbol: symbol.toUpperCase(), provider: provider.toLowerCase(), color, lineWidth: 2, visible: true },
      ],
    });
  },

  remove: (id: string) => {
    applyState({ items: currentState.items.filter((i) => i.id !== id) });
  },

  toggleVisible: (id: string) => {
    applyState({
      items: currentState.items.map((i) => (i.id === id ? { ...i, visible: !i.visible } : i)),
    });
  },

  /** Kıyaslama çizgisinin rengini ve/veya kalınlığını günceller. */
  updateStyle: (id: string, style: Partial<Pick<CompareItem, 'color' | 'lineWidth'>>) => {
    applyState({
      items: currentState.items.map((i) => (i.id === id ? { ...i, ...style } : i)),
    });
  },

  clear: () => {
    applyState({ items: [] });
  },

  isCompared: (symbol: string, provider: string): boolean => {
    const id = `${provider.toLowerCase()}:${symbol.toUpperCase()}`;
    return currentState.items.some((i) => i.id === id);
  },
};

export function useCompareStore(): CompareState {
  const [state, setState] = useState<CompareState>(compareStore.getState());

  useEffect(() => compareStore.subscribe(setState), []);

  return state;
}
