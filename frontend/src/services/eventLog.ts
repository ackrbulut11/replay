/**
 * Kullanıcının karşılaştığı hataları ve etiketlenmiş önemli aksiyonları
 * (strateji kaydetme, alarm oluşturma vb.) backend'deki user_events
 * tablosuna kaydeder.
 *
 * İstatistik/gözlemleme amaçlıdır — başarısız olması kullanıcının akışını
 * etkilememeli, bu yüzden çağrı sessizce yutulur (bkz. chartAnalytics.ts).
 */

import { apiRequest } from './api';

export type EventLevel = 'info' | 'warning' | 'error';

export async function logEvent(
  eventType: string,
  options: { level?: EventLevel; message?: string; context?: Record<string, unknown> } = {}
): Promise<void> {
  try {
    await apiRequest<void>('/api/analytics/events', {
      method: 'POST',
      body: JSON.stringify({
        event_type: eventType,
        level: options.level ?? 'info',
        message: options.message,
        context: options.context,
      }),
    });
  } catch {
    // istatistik amaçlı çağrı; sessizce yut
  }
}

export function logError(eventType: string, error: unknown, context?: Record<string, unknown>): void {
  const message = error instanceof Error ? error.message : String(error);
  void logEvent(eventType, { level: 'error', message, context });
}
