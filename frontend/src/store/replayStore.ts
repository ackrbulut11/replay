import { useState, useEffect } from 'react';

import { startReplaySession } from '../services/journalApi';

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
  /**
   * Kör mod: sembol adı ve tarih gizlenir.
   *
   * Manuel backtest'in bilinen en büyük hilesi, sonucu bilerek geçmişe
   * bakmaktır — "bu BTC, 2021'de yükseldi" bilgisi kararı önyargılı kılar.
   * Kör modda grafikte hangi sembole ve hangi döneme baktığınız görünmez;
   * işlemler yine gerçek sembole kaydedilir, yalnızca GÖSTERİM gizlenir.
   */
  isBlindMode: boolean;
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
  isBlindMode: false,
};

type Listener = (state: ReplayState) => void;

let currentState: ReplayState = { ...INITIAL_REPLAY_STATE };
const listeners: Set<Listener> = new Set();

/** Uçuştaki oturum açma isteği — eşzamanlı çağrılar tek isteği paylaşır. */
let pendingSession: Promise<string> | null = null;

export const replayStore = {
  getState: (): ReplayState => currentState,
  
  setState: (partial: Partial<ReplayState> | ((prev: ReplayState) => Partial<ReplayState>)) => {
    const nextPartial = typeof partial === 'function' ? partial(currentState) : partial;
    const next = { ...currentState, ...nextPartial };

    // Replay kapanınca oturum kimliği düşer — sonraki açılış sunucudan yeni
    // bir oturum ister (bkz. ensureSession).
    if (!next.isReplayActive) {
      next.sessionId = null;
      pendingSession = null;
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

  /**
   * Aktif oturumun kimliğini döndürür; yoksa sunucuda yeni bir oturum açar.
   *
   * İşlem paneli bu çağrıyı beklemek zorunda KALMAZ: düğmeler oturum hazır
   * değil diye kilitlenirse (ör. sunucu uykudayken) kullanıcı pozisyon
   * açamıyordu. Onun yerine ilk Long/Short'ta oturum burada garanti edilir.
   *
   * Aynı anda birden çok çağrı gelirse tek istek gider: `pendingSession`
   * uçuştaki sözü paylaşır, aksi halde her tıklama ayrı bir oturum satırı
   * yaratırdı.
   */
  ensureSession: async (symbol: string, timeframe: string): Promise<string> => {
    if (currentState.sessionId) return currentState.sessionId;
    if (pendingSession) return pendingSession;

    pendingSession = startReplaySession({ symbol, timeframe })
      .then((session) => {
        // Bu arada replay kapandıysa kimliği geri yazma.
        if (currentState.isReplayActive) {
          replayStore.setState({ sessionId: session.id });
        }
        return session.id;
      })
      .finally(() => {
        pendingSession = null;
      });

    return pendingSession;
  },

  reset: () => {
    // Kör mod tercihi replay oturumları arasında korunur: kullanıcı bunu bir
    // kez açıp öyle çalışmayı seçiyor, her çıkışta kapanması can sıkıcı olurdu.
    const { isBlindMode } = currentState;
    currentState = { ...INITIAL_REPLAY_STATE, isBlindMode };
    pendingSession = null;
    listeners.forEach((listener) => listener(currentState));
  },

  toggleBlindMode: () => {
    currentState = { ...currentState, isBlindMode: !currentState.isBlindMode };
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