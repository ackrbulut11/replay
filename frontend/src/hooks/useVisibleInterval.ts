/**
 * Yalnızca sekme GÖRÜNÜRKEN çalışan periyodik iş.
 *
 * Düz `setInterval` sekme arka plandayken de tetikleniyor: kullanıcı başka bir
 * sekmeye geçtiğinde izleme listesi fiyatlarını ve alarmları saatlerce boşuna
 * sorgulamaya devam ediyorduk. Bu, ücretsiz barındırma katmanında iki şekilde
 * zarar veriyor — sunucu uykuya hiç geçemiyor ve kullanıcı başına dakikalık
 * istek sınırı (bkz. backend MARKET_RATE_LIMIT_PER_MINUTE) boşuna tüketiliyor.
 *
 * Sekme yeniden görünür olduğunda iş HEMEN bir kez çalışır: arka planda
 * geçen sürede veri bayatlamış olur, bir sonraki periyodu beklemek yanlış
 * fiyat göstermek olurdu.
 */

import { useEffect, useRef } from 'react';

export function useVisibleInterval(
  callback: () => void,
  intervalMs: number,
  /** Değiştiğinde iş yeniden kurulur ve hemen bir kez çalışır. */
  deps: unknown[] = [],
  /** false ise hiç çalışmaz (ör. replay modunda alarm kontrolü). */
  enabled = true,
): void {
  // Callback'i ref'te tut: her render'da yeni bir fonksiyon gelse bile
  // interval yeniden kurulmasın.
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled) return;

    const run = () => callbackRef.current();

    // Sekme zaten gizliyse ilk çalıştırma da ertelenir; görünür olunca
    // aşağıdaki dinleyici çalıştırır.
    if (!document.hidden) run();

    const timer = setInterval(() => {
      if (!document.hidden) run();
    }, intervalMs);

    const handleVisibility = () => {
      if (!document.hidden) run();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, enabled, ...deps]);
}
