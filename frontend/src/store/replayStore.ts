import { useState, useEffect } from 'react';

export interface ReplayState {
  isReplayActive: boolean;
  isSelectingCutoff: boolean;
  cutoffIndex: number | null;
  currentIndex: number | null;
  targetTimestamp: number | null;
  isPlaying: boolean;
  speedMs: number; // e.g. 1000ms = 1 sec per candle
}

export const INITIAL_REPLAY_STATE: ReplayState = {
  isReplayActive: false,
  isSelectingCutoff: false,
  cutoffIndex: null,
  currentIndex: null,
  targetTimestamp: null,
  isPlaying: false,
  speedMs: 1000,
};

type Listener = (state: ReplayState) => void;

let currentState: ReplayState = { ...INITIAL_REPLAY_STATE };
const listeners: Set<Listener> = new Set();

export const replayStore = {
  getState: (): ReplayState => currentState,
  
  setState: (partial: Partial<ReplayState> | ((prev: ReplayState) => Partial<ReplayState>)) => {
    const nextPartial = typeof partial === 'function' ? partial(currentState) : partial;
    currentState = { ...currentState, ...nextPartial };
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