import { useState, useEffect } from 'react';

export interface ReplayState {
  isReplayActive: boolean;
  isSelectingCutoff: boolean;
  cutoffIndex: number | null;
  currentIndex: number | null;
  targetTimestamp: number | null;
  isPlaying: boolean;
  speedMs: number; // e.g. 1000ms = 1 sec per candle
  /**
   * Bu replay oturumunun kimliği — backend'de gerçek bir `replay_sessions`
   * satırının id'si (bkz. `startReplaySession` in journalApi.ts). `journal_trades.
   * session_id` bu tabloya YABANCI ANAHTAR olduğundan istemcide üretilmiş
   * rastgele bir kimlik burada KULLANILAMAZ — pozisyon açılırken sunucuda
   * "IntegrityError" ile patlar. Kimlik, replay etkinleşince CandleChart'taki
   * bir efekt tarafından sunucudan istenir; hazır olana kadar null kalır ve
   * işlem paneli o süre boyunca devre dışıdır.
   */
  sessionId: string | null;
}

export const INITIAL_REPLAY_STATE: ReplayState = {
  isReplayActive: false,
  isSelectingCutoff: false,
  cutoffIndex: null,
  currentIndex: null,
  targetTimestamp: null,
  isPlaying: false,
  speedMs: 1000,
  sessionId: null,
};

type Listener = (state: ReplayState) => void;

let currentState: ReplayState = { ...INITIAL_REPLAY_STATE };
const listeners: Set<Listener> = new Set();

export const replayStore = {
  getState: (): ReplayState => currentState,
  
  setState: (partial: Partial<ReplayState> | ((prev: ReplayState) => Partial<ReplayState>)) => {
    const nextPartial = typeof partial === 'function' ? partial(currentState) : partial;
    const next = { ...currentState, ...nextPartial };

    // Replay kapanınca oturum kimliği düşer — sonraki açılış sunucudan yeni
    // bir oturum ister (bkz. CandleChart.tsx sessionCreationRef efekti).
    if (!next.isReplayActive) {
      next.sessionId = null;
    }

    currentState = next;
    listeners.forEach((listener) => listener(currentState));
  },

  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  reset: () => {
    currentState = { ...INITIAL_REPLAY_STATE };
    listeners.forEach((listener) => listener(currentState));
  },
};

export function useReplayStore(): [ReplayState, (partial: Partial<ReplayState> | ((prev: ReplayState) => Partial<ReplayState>)) => void] {
  const [state, setState] = useState<ReplayState>(replayStore.getState());

  useEffect(() => {
    const unsubscribe = replayStore.subscribe((newState) => {
      setState(newState);
    });
    return unsubscribe;
  }, []);

  return [state, replayStore.setState];
}