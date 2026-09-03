/**
 * Erken erişim (waitlist) servisi.
 *
 * Landing page giriş yapılmadan görüntülendiği için `apiRequest` kullanılmaz:
 * o katman 401'de oturumu düşürür ve token bekler. Burada token yok, olması da
 * gerekmiyor — uç nokta herkese açık.
 */

const API_BASE_URL = '/api';

export interface WaitlistResponse {
  ok: boolean;
  message: string;
}

/** Formun bulunduğu bölüm; hangi CTA'nın çalıştığını görmek için gönderilir. */
export type WaitlistSource = 'hero' | 'footer';

export async function joinWaitlist(
  email: string,
  source: WaitlistSource
): Promise<WaitlistResponse> {
  const response = await fetch(`${API_BASE_URL}/waitlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, source }),
  });

  if (!response.ok) {
    // Doğrulama hatası (422) FastAPI'de detail'i liste olarak döner;
    // doğrudan string'e basmak "[object Object]" üretir.
    const raw = await response.text().catch(() => '');
    let detail = '';
    try {
      const parsed = JSON.parse(raw)?.detail;
      detail = Array.isArray(parsed) ? 'Enter a valid email address.' : parsed ?? '';
    } catch {
      detail = raw.trim();
    }
    throw new Error(detail || 'Something went wrong. Please try again.');
  }

  return response.json();
}
