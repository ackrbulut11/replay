/**
 * Kritik akış duman testleri (SKILLS.md "Test").
 *
 * **Backend'e gidilmez.** Ağ istekleri `page.route` ile taklit edilir; testler
 * çalışan bir API, veritabanı ya da Google OAuth oturumu gerektirmez. Bunları
 * şart koşmak testlerin pratikte hiç koşmaması demek olurdu — nitekim `e2e/`
 * dizini bugüne kadar boştu.
 *
 * Kapsam bilinçli olarak dar: "uygulama açılıyor mu, korumalı yol gerçekten
 * koruyor mu, oturum varken kabuk çiziliyor mu". Grafik/replay etkileşimleri
 * canvas üzerinde olduğu için ayrı bir iş.
 */

import { expect, test, type Page } from '@playwright/test';

const TOKEN_KEY = 'replay_access_token';
const USER_KEY = 'replay_user';

const FAKE_USER = {
  id: 'user-e2e',
  email: 'e2e@example.com',
  name: 'E2E Trader',
  initial_balance: 10000,
  currency: 'USD',
  is_admin: false,
};

/**
 * Sahte mum üretir — grafiğin veri beklemeden çizilebilmesi için.
 *
 * Biçim `MarketCandle[]`: backend düz bir DİZİ döndürüyor, sarmalanmış bir
 * nesne değil (bkz. services/marketApi.ts).
 */
function fakeCandles(count = 200) {
  const start = Math.floor(Date.UTC(2024, 0, 1) / 1000);
  return Array.from({ length: count }, (_, i) => {
    const close = 100 + Math.sin(i / 8) * 5 + i * 0.1;
    return {
      time: start + i * 86400,
      open: close,
      high: close * 1.01,
      low: close * 0.99,
      close,
      volume: 1000,
    };
  });
}

/** Tüm `/api/*` isteklerini taklit eder; hiçbir gerçek istek dışarı çıkmaz. */
async function stubApi(page: Page): Promise<void> {
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();

    // Kimlik uçları yalnızca test bir oturum tohumladıysa başarılı döner;
    // aksi halde 401. Koşulsuz başarı döndürmek "korumalı yol gerçekten
    // koruyor mu" testini anlamsız kılardı.
    const authed = await page.evaluate(
      (key) => Boolean(window.localStorage.getItem(key)),
      TOKEN_KEY
    );
    if (url.includes('/auth/me')) {
      return authed
        ? route.fulfill({ json: FAKE_USER })
        : route.fulfill({ status: 401, json: { detail: 'yetkisiz' } });
    }
    if (url.includes('/auth/refresh')) {
      return authed
        ? route.fulfill({ json: { access_token: 'sahte-token', token_type: 'bearer' } })
        : route.fulfill({ status: 401, json: { detail: 'yetkisiz' } });
    }
    if (url.includes('/market/data') || url.includes('/market/window')) {
      return route.fulfill({ json: fakeCandles() });
    }
    if (url.includes('/market/quotes')) {
      return route.fulfill({ json: [] });
    }
    if (url.includes('/strategy/list')) {
      return route.fulfill({ json: { strategies: [], count: 0 } });
    }
    if (url.includes('/strategy/indicators')) {
      return route.fulfill({ json: { indicators: [] } });
    }
    if (url.includes('/journal/trades')) {
      return route.fulfill({ json: [] });
    }
    if (url.includes('/alerts')) {
      return route.fulfill({ json: { alerts: [], count: 0 } });
    }
    // Kalan her şey için boş ama geçerli bir yanıt: test ettiğimiz şey
    // arayüzün ayakta kalması, uçların doğruluğu değil (o backend testlerinde).
    return route.fulfill({ json: {} });
  });
}

/** Giriş yapmış bir oturumu localStorage'a yazar (AuthContext oradan okuyor). */
async function seedSession(page: Page): Promise<void> {
  await page.addInitScript(
    ([tokenKey, userKey, user]) => {
      window.localStorage.setItem(tokenKey as string, 'sahte-token');
      window.localStorage.setItem(userKey as string, JSON.stringify(user));
    },
    [TOKEN_KEY, USER_KEY, FAKE_USER] as const
  );
}

test.describe('oturum açılmamışken', () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
  });

  test('landing sayfası açılır', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/replay/i);
    // Sayfa gerçekten boyandı mı (beyaz ekran değil)?
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('korumalı yol giriş ekranına yönlendirir', async ({ page }) => {
    await page.goto('/app/strategy');
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    expect(page.url()).toContain('/login');
  });

  test('giriş sayfası açılır', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('body')).not.toBeEmpty();
  });
});

test.describe('oturum açıkken', () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
    await seedSession(page);
  });

  test('uygulama kabuğu çizilir ve giriş ekranına atmaz', async ({ page }) => {
    await page.goto('/app/strategy');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('konsolda çalışma zamanı hatası oluşmaz', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/app/strategy');
    await page.waitForLoadState('networkidle');

    expect(errors, `sayfa hataları: ${errors.join(' | ')}`).toHaveLength(0);
  });
});
