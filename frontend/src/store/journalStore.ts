/**
 * İşlem günlüğü store'u (Faz 4).
 *
 * Aktif sembolün işlemlerini tutar; hem replay işlem paneli hem de grafik
 * (giriş/çıkış işaretleri) aynı listeyi okur. Panel bir pozisyon açıp
 * kapattığında `reload` çağrılır ve grafik işaretleri kendiliğinden tazelenir.
 *
 * Diğer store'larla aynı elle yazılmış desen: modül seviyesinde state,
 * dinleyici kümesi ve `useXStore()` hook'u (SKILLS.md Frontend).
 */

import { useEffect, useState } from 'react';

import { getTrades } from '../services/journalApi';
import type { JournalTrade } from '../types/journal';

export interface JournalState {
  /** Yalnızca `symbol` sembolüne ait işlemler. */
  trades: JournalTrade[];
  symbol: string | null;
  loading: boolean;
}

const INITIAL_STATE: JournalState = {
  trades: [],
  symbol: null,
  loading: false,
};

type Listener = (state: JournalState) => void;

let currentState: JournalState = { ...INITIAL_STATE };
const listeners: Set<Listener> = new Set();

function setState(partial: Partial<JournalState>) {
  currentState = { ...currentState, ...partial };
  listeners.forEach((listener) => listener(currentState));
}

export const journalStore = {
  getState: (): JournalState => currentState,

  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /**
   * Sembolün işlemlerini sunucudan tazeler.
   *
   * Grafik işaretleri için yalnızca giriş/çıkış noktaları gerektiğinden
   * makul bir üst sınır yeterli; tüm geçmişi çekmeye gerek yok.
   */
  reload: async (symbol: string) => {
    if (!symbol) return;
    setState({ loading: true, symbol });
    try {
      const trades = await getTrades({ symbol, limit: 200 });
      // Sembol bu sırada değiştiyse geç gelen yanıtı yazma.
      if (journalStore.getState().symbol === symbol) {
        setState({ trades, loading: false });
      }
    } catch {
      // İşaretler ikincil bir görselleştirme; hata kullanıcıyı engellememeli.
      setState({ loading: false });
    }
  },

  reset: () => {
    currentState = { ...INITIAL_STATE };
    listeners.forEach((listener) => listener(currentState));
  },
};

export function useJournalStore(): JournalState {
  const [state, setState_] = useState<JournalState>(journalStore.getState());

  useEffect(() => journalStore.subscribe(setState_), []);

  return state;
}
