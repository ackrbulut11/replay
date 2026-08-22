/**
 * Gösterge uyumu: frontend backend ile AYNI sayıları üretiyor mu?
 *
 * Göstergeler iki yerde hesaplanıyor — burada (kullanıcının grafikte gördüğü)
 * ve backend `indicators/registry.py` içinde (strateji motorunun gördüğü).
 * İkisi farklı formüller kullandığı sürece kullanıcı grafikte kesişim görüp
 * backtest'te göremiyordu:
 *
 *   - Bollinger: frontend POPÜLASYON, backend ÖRNEKLEM standart sapması →
 *     bant her barda ~%0,12 farklıydı ve hiç yakınsamıyordu.
 *   - EMA/RSI/MACD: frontend SMA ile, backend ilk değerle tohumluyordu →
 *     EMA50'de 55. barda %0,43 fark, tam da backend'in "gösterge artık
 *     geçerli" dediği ısınma bölgesinde.
 *
 * Altın örnek (`backend/tests/indicator_parity.json`) backend tarafından
 * üretilir ve iki taraf da ona karşı test edilir; karşı taraf
 * `backend/tests/test_indicator_parity.py`. Biri kayarsa test kırılır.
 *
 * Yeniden üretmek için: `python scripts/generate_indicator_parity.py`
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { expect, test } from '@playwright/test';

import {
  calculateBollingerBands,
  calculateEMA,
  calculateMACD,
  calculateRSI,
  type TimeValue,
} from '../src/utils/indicators';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(HERE, '../../backend/tests/indicator_parity.json');

interface Fixture {
  close: number[];
  indicators: Record<string, Array<number | null>>;
}

const fixture: Fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
const data = fixture.close.map((close, index) => ({ time: index, close }));

// Altın örnek 10 ondalığa yuvarlı; karşılaştırma o yuvarlamanın bir basamak
// üstünde yapılır. Gerçek bir sapma bundan kat kat büyük olurdu.
const TOLERANCE = 1e-9;

/**
 * Üretilen seriyi altın örnekle karşılaştırır.
 *
 * Yalnızca değerleri değil, serinin HANGİ BARDA başladığını da doğrular:
 * backend `get_value` ısınma bölgesinde NaN döndürüyor ve grafik de aynı
 * bardan başlamalı — aksi halde grafikte görünen bir nokta backtest'in hiç
 * değerlendirmediği bir nokta olurdu.
 */
function expectMatchesFixture(key: string, produced: TimeValue[]): void {
  const expected = fixture.indicators[key];
  expect(expected, `altın örnekte '${key}' serisi yok`).toBeTruthy();

  const byIndex = new Map(produced.map((point) => [point.time, point.value]));

  let compared = 0;
  for (let i = 0; i < expected.length; i++) {
    const want = expected[i];
    const got = byIndex.get(i);

    if (want === null) {
      expect(got, `${key}[${i}]: ısınma bölgesinde değer üretildi`).toBeUndefined();
      continue;
    }

    expect(got, `${key}[${i}]: değer üretilmedi, ${want} bekleniyordu`).toBeDefined();
    expect(Math.abs((got as number) - want), `${key}[${i}] saptı`).toBeLessThan(TOLERANCE);
    compared++;
  }

  // Karşılaştırma gerçekten yapıldı mı? Boş bir seri sessizce "geçer"di.
  expect(compared, `${key}: hiç değer karşılaştırılmadı`).toBeGreaterThan(100);
}

test.describe('gösterge uyumu (backend altın örneği)', () => {
  test('EMA20 ve EMA50 birebir aynı', () => {
    expectMatchesFixture('EMA20', calculateEMA(data, 20));
    expectMatchesFixture('EMA50', calculateEMA(data, 50));
  });

  test('RSI14 birebir aynı', () => {
    expectMatchesFixture('RSI14', calculateRSI(data, 14));
  });

  test('Bollinger bantları birebir aynı (örneklem std)', () => {
    const bb = calculateBollingerBands(data, 20, 2);
    expectMatchesFixture('BB20_upper', bb.upper);
    expectMatchesFixture('BB20_middle', bb.middle);
    expectMatchesFixture('BB20_lower', bb.lower);
  });

  test('MACD çizgisi, sinyali ve histogramı birebir aynı', () => {
    const macd = calculateMACD(data, 12, 26, 9);
    expectMatchesFixture('MACD12_line', macd.macd);
    expectMatchesFixture('MACD12_signal', macd.signal);
    expectMatchesFixture(
      'MACD12_hist',
      macd.histogram.map(({ time, value }) => ({ time, value }))
    );
  });

  test('ısınma bölgesi backend eşiğiyle aynı bardan başlar', () => {
    // EMA20 -> 20. bar, MACD(12/26/9) -> 35. bar (bkz. warmup_bars).
    expect(calculateEMA(data, 20)[0].time).toBe(20);
    expect(calculateMACD(data, 12, 26, 9).macd[0].time).toBe(35);
    expect(calculateBollingerBands(data, 20, 2).upper[0].time).toBe(20);
    expect(calculateRSI(data, 14)[0].time).toBe(14);
  });

  test('veri ısınmadan kısaysa boş seri döner', () => {
    const short = data.slice(0, 10);
    expect(calculateEMA(short, 20)).toHaveLength(0);
    expect(calculateBollingerBands(short, 20, 2).upper).toHaveLength(0);
    expect(calculateMACD(short, 12, 26, 9).macd).toHaveLength(0);
  });
});
