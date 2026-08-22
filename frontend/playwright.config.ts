import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright yapılandırması.
 *
 * `e2e/` dizini vardı ama BOŞTU: SKILLS.md kritik akışlar için Playwright
 * istiyordu, frontend'de hiç test yoktu.
 *
 * İki tür test var ve ikisi ayrı projelerde koşuyor:
 *
 *   `logic`   — Tarayıcı gerektirmeyen saf hesap testleri. En önemlisi
 *               gösterge uyumu: frontend `utils/indicators.ts` ile backend
 *               `indicators/registry.py` aynı sayıları üretmek zorunda
 *               (bkz. backend/tests/indicator_parity.json altın örneği).
 *               Bu testler dev sunucusu bile başlatmadan koşar.
 *
 *   `browser` — Gerçek arayüz akışları. Backend'e gitmezler: ağ istekleri
 *               `page.route` ile taklit edilir. Böylece testler çalışan bir
 *               API, veritabanı ya da Google OAuth oturumu gerektirmez —
 *               bunları şart koşmak, testlerin hiç koşmaması demek olurdu.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',

  projects: [
    {
      name: 'logic',
      testMatch: /.*\.logic\.spec\.ts/,
    },
    {
      name: 'browser',
      testMatch: /.*\.ui\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://127.0.0.1:1420',
        trace: 'on-first-retry',
      },
    },
  ],

  // Sunucu YALNIZCA tarayıcı testleri için başlatılır. Playwright yapılandırmayı
  // proje seçiminden önce değerlendirdiği için ayrım bir ortam değişkeniyle
  // yapılıyor (`npm run test:logic` bunu set eder): saf hesap testlerini
  // koşturmak için Vite'ı ayağa kaldırmayı beklemek gereksiz.
  webServer: process.env.PW_SKIP_SERVER
    ? undefined
    : {
        // `--host 127.0.0.1` şart: Vite varsayılanda `localhost`a bağlanıyor ve
        // Windows'ta bu `::1` (IPv6) demek. Playwright ise `127.0.0.1` (IPv4)
        // yokluyor, sunucu ayakta olmasına rağmen "timeout" veriyordu.
        command: 'npm run dev -- --host 127.0.0.1',
        url: 'http://127.0.0.1:1420',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
