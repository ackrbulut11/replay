/**
 * Trade Journal API Servisi.
 *
 * Backend `/api/journal` uçlarıyla iletişim kurar. Bileşenler doğrudan
 * fetch çağırmaz (SKILLS.md Frontend); tüm erişim buradan geçer.
 */

import type {
  JournalTrade,
  PerformanceReport,
  TradeCloseRequest,
  TradeOpenRequest,
  TradeStatus,
  TradeUpdateRequest,
} from '../types/journal';

import { ApiError, apiRequest as request, isTransientError } from './api';

const API_BASE = '/api/journal';

/**
 * Render ücretsiz katmanı hareketsizlikte uykuya geçer ve replay oynatımı
 * tamamen istemci tarafında olduğu için oynatma sırasında backend'e hiç istek
 * gitmez. Bu yüzden pozisyon açma/kapatma isteği çoğu zaman "uyuyan" bir
 * sunucuya denk gelir; ilk istek sunucuyu uyandırır ama ağ geçidi zaman aşımına
 * uğrar. Aşağıdaki mutabakat mantığı bu durumu kullanıcıya yansıtmadan çözer.
 */
const WAKE_RETRY_DELAY_MS = 2500;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface TradeListFilters {
  symbol?: string;
  status?: TradeStatus;
  sessionId?: string;
  limit?: number;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

export async function getTrades(filters: TradeListFilters = {}): Promise<JournalTrade[]> {
  const query = buildQuery({
    symbol: filters.symbol,
    status: filters.status,
    session_id: filters.sessionId,
    limit: filters.limit,
  });
  return request<JournalTrade[]>(`${API_BASE}/trades${query}`);
}

export async function getTrade(tradeId: string): Promise<JournalTrade> {
  return request<JournalTrade>(`${API_BASE}/trades/${tradeId}`);
}

/**
 * Pozisyon açar.
 *
 * Geçici bir hatada isteği KÖR ŞEKİLDE TEKRARLAMAZ — ilk istek sunucuya
 * ulaşmış olabilir ve ikinci deneme ikinci bir pozisyon açardı. Bunun yerine
 * mutabakat yapılır: sunucuda bu sembol için açık pozisyon oluşmuşsa istek
 * aslında başarılıdır ve o pozisyon döndürülür.
 */
export async function openTrade(data: TradeOpenRequest): Promise<JournalTrade> {
  try {
    return await request<JournalTrade>(`${API_BASE}/trades`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  } catch (err) {
    if (!isTransientError(err)) throw err;

    await delay(WAKE_RETRY_DELAY_MS);

    // Oturum filtresi zorunlu: sembolde önceki bir replay oturumundan kalmış
    // açık pozisyon, bu isteğin sonucu sanılıp geri döndürülürdü.
    const open = await getTrades({
      symbol: data.symbol,
      status: 'OPEN',
      sessionId: data.session_id ?? undefined,
      limit: 1,
    }).catch(() => []);
    if (open.length > 0) return open[0];

    // Sunucuya gerçekten ulaşılamamış; artık uyanık olduğu için tek deneme yeterli.
    return request<JournalTrade>(`${API_BASE}/trades`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}

/**
 * Açık pozisyonu kapatır.
 *
 * Geçici hatada bir kez daha dener. Tekrar denemek burada güvenlidir: ilk
 * istek aslında başarılı olduysa sunucu ikinciyi "İşlem zaten kapatılmış"
 * (400) ile reddeder ve bu, hata değil başarı olarak yorumlanıp işlemin
 * güncel hâli döndürülür — aksi halde kullanıcı kapanmış bir pozisyon için
 * hata görürdü.
 */
export async function closeTrade(
  tradeId: string,
  data: TradeCloseRequest
): Promise<JournalTrade> {
  const send = () =>
    request<JournalTrade>(`${API_BASE}/trades/${tradeId}/close`, {
      method: 'POST',
      body: JSON.stringify(data),
    });

  try {
    return await send();
  } catch (err) {
    if (!isTransientError(err)) throw err;

    await delay(WAKE_RETRY_DELAY_MS);

    try {
      return await send();
    } catch (retryErr) {
      const alreadyClosed =
        retryErr instanceof ApiError &&
        retryErr.status === 400 &&
        retryErr.message.includes('zaten kapat');

      if (alreadyClosed) return getTrade(tradeId);
      throw retryErr;
    }
  }
}

export async function updateTrade(
  tradeId: string,
  data: TradeUpdateRequest
): Promise<JournalTrade> {
  return request<JournalTrade>(`${API_BASE}/trades/${tradeId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteTrade(tradeId: string): Promise<void> {
  return request<void>(`${API_BASE}/trades/${tradeId}`, { method: 'DELETE' });
}

export async function getPerformance(
  options: { symbol?: string; sessionId?: string; startingBalance?: number } = {}
): Promise<PerformanceReport> {
  const query = buildQuery({
    symbol: options.symbol,
    session_id: options.sessionId,
    starting_balance: options.startingBalance,
  });
  return request<PerformanceReport>(`${API_BASE}/performance${query}`);
}
