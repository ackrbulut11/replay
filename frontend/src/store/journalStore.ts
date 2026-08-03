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
  /** Yalnızca `symbol` sembolüne ve `sessionId` oturumuna ait işlemler. */
  trades: JournalTrade[];
  symbol: string | null;
  /** Hangi replay oturumunun işlemleri yüklü (bkz. replayStore.sessionId). */
  sessionId: string | null;
  loading: boolean;
}

const INITIAL_STATE: JournalState = {
  trades: [],
  symbol: null,
  sessionId: null,
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
   * Sembolün AKTİF REPLAY OTURUMUNA ait işlemlerini sunucudan tazeler.
   *
   * Oturum kimliği zorunludur: filtresiz sorgu sembolün tüm geçmiş replay
   * işlemlerini getiriyordu ve replay yeniden açıldığında grafik, önceki
   * denemelerin giriş/çıkış oklarıyla dolu geliyordu. Kimlik yoksa (replay
   * kapalı) liste boşaltılır ve sunucuya hiç gidilmez.
   *
   * Grafik işaretleri için yalnızca giriş/çıkış noktaları gerektiğinden
   * makul bir üst sınır yeterli; tüm geçmişi çekmeye gerek yok.
   */
  reload: async (symbol: string, sessionId: string | null | undefined) => {
    if (!symbol) return;

    if (!sessionId) {
      setState({ trades: [], symbol, sessionId: null, loading: false });
      return;
    }

    // Farklı bir sembol/oturum isteniyorsa eldeki işlemler hemen düşer: yanıt
    // gelene kadar grafikte önceki oturumun okları görünmeye devam ederdi.
    const prev = journalStore.getState();
    const isSameQuery = prev.symbol === symbol && prev.sessionId === sessionId;
    setState({ loading: true, symbol, sessionId, trades: isSameQuery ? prev.trades : [] });
    try {
      const trades = await getTrades({ symbol, sessionId, limit: 200 });
      // Sembol ya da oturum bu sırada değiştiyse geç gelen yanıtı yazma.
      const state = journalStore.getState();
      if (state.symbol === symbol && state.sessionId === sessionId) {
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
