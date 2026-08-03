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
   * Bu replay oturumunun kimliği. Replay her açıldığında yenilenir, kapanınca
   * düşer. Manuel işlemler bu kimlikle kaydedilir ve grafik yalnızca bu
   * kimliğe ait işlemleri çizer — aksi halde önceki oturumların giriş/çıkış
   * okları yeni oturumun grafiğinde asılı kalıyordu.
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

/** `crypto.randomUUID` güvensiz kaynakta/eski tarayıcıda yok; yedeği var. */
function createSessionId(): string {
  const webCrypto = globalThis.crypto as Crypto | undefined;
  if (webCrypto?.randomUUID) return webCrypto.randomUUID();
  return `replay-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

type Listener = (state: ReplayState) => void;

let currentState: ReplayState = { ...INITIAL_REPLAY_STATE };
const listeners: Set<Listener> = new Set();

export const replayStore = {
  getState: (): ReplayState => currentState,
  
  setState: (partial: Partial<ReplayState> | ((prev: ReplayState) => Partial<ReplayState>)) => {
    const nextPartial = typeof partial === 'function' ? partial(currentState) : partial;
    const next = { ...currentState, ...nextPartial };

    // Oturum kimliği durumdan türetilir; çağıranların ayrıca üretmesi gerekmez.
    // Replay birden çok yerden açılıyor (araç çubuğu düğmesi, "Replay" sekmesi)
    // ve kimliği tek tek o noktalara bırakmak er geç unutulacak bir ayrıntıydı.
    if (next.isReplayActive && !next.sessionId) {
      next.sessionId = createSessionId();
    } else if (!next.isReplayActive) {
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