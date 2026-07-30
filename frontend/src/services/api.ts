import { TOKEN_STORAGE_KEY, notifyUnauthorized, refreshAccessToken } from '../context/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? 'https://replay-xj3e.onrender.com/api' : '/api');

export const fetchWithAuth = async (url: string, options: RequestInit = {}, token: string | null): Promise<Response> => {
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const updatedOptions: RequestInit = {
    ...options,
    headers,
    credentials: 'include'
  };

  const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
  return fetch(fullUrl, updatedOptions);
};

/**
 * Kimlik doğrulamalı JSON isteği — backend'e giden tüm çağrıların ortak yolu.
 *
 * Token'ı localStorage'dan okur, 401'de oturumu düşürür ve hata gövdesini
 * güvenilir biçimde çözer. Doğrudan `fetch` kullanmak yerine bunu tercih edin:
 * aksi halde istek token'sız gider ve 401 alır.
 */
export async function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let response = await fetch(url, { ...options, headers });

  // Access token 30 dakikada doluyor: doğrudan oturumu düşürmeden önce
  // refresh_token cookie'siyle bir kez yeni token almayı dene.
  if (response.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      response = await fetch(url, { ...options, headers });
    }
  }

  if (!response.ok) {
    // Token yok/geçersiz/süresi dolmuş ve refresh de başarısız: oturumu düşür.
    if (response.status === 401) {
      notifyUnauthorized();
      throw new Error('Oturumunuz sona erdi. Lütfen tekrar giriş yapın.');
    }

    // Yakalanmamış sunucu hataları düz metin döner; doğrudan response.json()
    // çağırmak burada patlar ve gerçek hata mesajı kaybolur.
    const raw = await response.text().catch(() => '');
    let detail = '';
    try {
      detail = JSON.parse(raw)?.detail ?? '';
    } catch {
      detail = raw.trim();
    }
    throw new Error(detail || `API hatası: ${response.status}`);
  }

  // 204 gibi gövdesiz yanıtlarda json() patlar.
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json();
}
