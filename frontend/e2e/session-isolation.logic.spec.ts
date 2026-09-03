import { expect, test } from '@playwright/test';

test('eski oturumun geç gelen API yanıtı reddedilir', async () => {
  const storage = new Map<string, string>();
  const target = new EventTarget();
  const localStorageMock = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
    key: () => null,
    get length() { return storage.size; },
  };
  Object.assign(globalThis, { window: target, localStorage: localStorageMock });
  let finish: ((value: Response) => void) | undefined;
  globalThis.fetch = () => new Promise<Response>((resolve) => { finish = resolve; });
  const session = await import('../src/auth/authSession');
  const { apiRequest } = await import('../src/services/api');
  session.setSessionAccessToken('hesap-a');
  const pending = apiRequest<{ owner: string }>('/api/test');
  session.clearStoredSession();
  session.setSessionAccessToken('hesap-b');
  finish?.(new Response(JSON.stringify({ owner: 'hesap-a' }), { status: 200 }));
  await expect(pending).rejects.toBeInstanceOf(session.SessionChangedError);
});
