import { TOKEN_STORAGE_KEY, notifyUnauthorized, refreshAccessToken } from '../context/AuthContext';
import { logEvent } from './eventLog';

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

/** HTTP durum kodunu taşıyan API hatası — çağıran taraf geçici hataları ayırt edebilsin. */
export class ApiError extends Error {
  readonly status: number;
  /** Sunucuya ulaşılamadığı için oluşmuş, yeniden denenebilir bir hata mı? */
  readonly transient: boolean;

  constructor(message: string, status: number, transient = false) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.transient = transient;
  }
}

/**
 * Geçici (yeniden denenebilir) hata mı?
 *
 * Sunucuya ulaşılamaması, çoğunlukla uyku modundan uyanan Render örneğine denk
 * gelen bir isteğe işaret eder; aynı istek birazdan başarılı olur.
 */
export function isTransientError(error: unknown): boolean {
  if (error instanceof ApiError) return error.transient;
  // fetch ağ hatasında TypeError fırlatır (bağlantı hiç kurulamadı).
  return error instanceof TypeError;
}

const UNREACHABLE_MESSAGE =
  'Sunucuya ulaşılamadı (uyku modundan uyanıyor olabilir). Lütfen tekrar deneyin.';

/**
 * Hata gövdesinden okunabilir bir mesaj ve "yeniden denenebilir mi" bilgisi üretir.
 *
 * Ağ geçidi hataları (Vercel/Render) JSON değil HTML sayfa döndürür; bu gövdeyi
 * olduğu gibi göstermek arayüze ham HTML basardı.
 *
 * Gövdesi boş bir 5xx de "ulaşılamadı" sayılır: uygulamanın kendi 500'ü her
 * zaman bir gövde taşır, boş gövde isteği hiç iletemeyen ara katmandan gelir
 * (Vercel router'ı 502, Vite dev proxy'si 500 döndürür).
 */
function describeError(raw: string, status: number): { message: string; transient: boolean } {
  const body = raw.trim();
  const unreachable =
    status === 502 || status === 503 || status === 504 || (status >= 500 && !body);

  let detail = '';
  try {
    const parsed = JSON.parse(body)?.detail;
    if (typeof parsed === 'string') detail = parsed.trim();
    else if (parsed) detail = JSON.stringify(parsed);
  } catch {
    // JSON değil: aşağıdaki sabit mesajlara düşülür.
  }

  if (unreachable) return { message: detail || UNREACHABLE_MESSAGE, transient: true };
  if (detail) return { message: detail, transient: false };

  // HTML/uzun gövdeyi arayüze basma; yalnızca kısa ve etiketsiz metne güven.
  if (body && body.length <= 200 && !body.includes('<')) {
    return { message: body, transient: false };
  }

  return { message: `API hatası: ${status}`, transient: false };
}

/**
 * `fetch`, bağlantı hiç kurulamadığında ham `TypeError: Failed to fetch`
 * fırlatır. Bu mesaj kullanıcıya gösterilemez; ulaşılamama durumunun geri
 * kalanıyla aynı biçime çevrilir.
 */
async function fetchOrThrow(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new ApiError(UNREACHABLE_MESSAGE, 0, true);
  }
}

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

  let response = await fetchOrThrow(url, { ...options, headers });

  // Access token 30 dakikada doluyor: doğrudan oturumu düşürmeden önce
  // refresh_token cookie'siyle bir kez yeni token almayı dene.
  if (response.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      response = await fetchOrThrow(url, { ...options, headers });
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
    const { message: errorMessage, transient } = describeError(raw, response.status);

    void logEvent('api_error', {
      level: response.status >= 500 ? 'error' : 'warning',
      message: errorMessage,
      context: { status: response.status, url, transient },
    });

    throw new ApiError(errorMessage, response.status, transient);
  }

  // 204 gibi gövdesiz yanıtlarda json() patlar.
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json();
}
