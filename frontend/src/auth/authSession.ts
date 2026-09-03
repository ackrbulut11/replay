// Access token yalnızca bu sekmenin belleğinde yaşar. Sayfa yenilendiğinde
// httpOnly refresh cookie üzerinden yeniden alınır; localStorage'daki bir token
// XSS tarafından kalıcı olarak okunamaz.
let currentAccessToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;
let refreshController: AbortController | null = null;
let sessionGeneration = 0;

export class SessionChangedError extends Error {
  constructor() {
    super('Oturum değişti; önceki isteğin sonucu kullanılmadı.');
    this.name = 'SessionChangedError';
  }
}

export const getSessionGeneration = () => sessionGeneration;
export function assertSessionGeneration(generation: number): void {
  if (generation !== sessionGeneration) throw new SessionChangedError();
}

export const TOKEN_STORAGE_KEY = 'replay_access_token';
export const UNAUTHORIZED_EVENT = 'replay:unauthorized';
export const SESSION_CLEARED_EVENT = 'replay:session-cleared';
export const TOKEN_CHANGED_EVENT = 'replay:token-changed';

const LEGACY_SESSION_KEYS = [
  TOKEN_STORAGE_KEY,
  'replay_auth_token',
  'replay_user',
  'replay_single_eval_history',
  'replay_strategy_order',
  'replay_watchlists_v2',
];

export function getAccessToken(): string | null {
  return currentAccessToken;
}

export function hasAccessToken(): boolean {
  return currentAccessToken !== null;
}

export function setSessionAccessToken(token: string | null): void {
  currentAccessToken = token;
  window.dispatchEvent(new CustomEvent(TOKEN_CHANGED_EVENT, { detail: token }));
}

export function clearStoredSession(): void {
  sessionGeneration += 1;
  refreshController?.abort();
  refreshController = null;
  refreshInFlight = null;
  LEGACY_SESSION_KEYS.forEach((key) => localStorage.removeItem(key));
  setSessionAccessToken(null);
  window.dispatchEvent(new Event(SESSION_CLEARED_EVENT));
}

export function notifyUnauthorized(): void {
  clearStoredSession();
  window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
}

export async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  const generation = sessionGeneration;
  const controller = new AbortController();
  refreshController = controller;

  refreshInFlight = (async () => {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const data = await response.json();
      assertSessionGeneration(generation);
      const token = typeof data.access_token === 'string' ? data.access_token : null;
      setSessionAccessToken(token);
      return token;
    } catch {
      return null;
    } finally {
      if (generation === sessionGeneration) {
        refreshInFlight = null;
        refreshController = null;
      }
    }
  })();

  return refreshInFlight;
}
