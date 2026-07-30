import * as Sentry from '@sentry/react';

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;

/**
 * Yalnızca VITE_SENTRY_DSN doluysa başlatılır (güvenli varsayılan: kapalı).
 * Böylece yerel geliştirmede hiçbir olay gönderilmez.
 */
export function initSentry(): void {
  if (!SENTRY_DSN) return;

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.PROD ? 'production' : 'development',
    // Ücretsiz/düşük plan kotasını hızla tüketmemek için düşük tutulur;
    // hata (exception) yakalama bundan etkilenmez.
    tracesSampleRate: 0.1,
  });
}

export { Sentry };
