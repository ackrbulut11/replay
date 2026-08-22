/**
 * Grafik göstergeleri — backend `indicators/registry.py` ile BİREBİR aynı hesap.
 *
 * **Neden bu dosya var ve neden birebir olmak zorunda:** göstergeler burada bir
 * kez daha, farklı bir formülle yazılmıştı. Ölçülen fark küçük değildi:
 *
 *   - Bollinger: frontend POPÜLASYON, backend ÖRNEKLEM standart sapması
 *     kullanıyordu → bant her barda ~%0,12 farklıydı ve hiç yakınsamıyordu.
 *     Kullanıcı çizilen bandı görüp test edilen başka bir bandın sonucunu
 *     okuyordu.
 *   - EMA/RSI/MACD: frontend SMA ile, backend ilk değerle tohumluyordu.
 *     EMA50'de 55. barda %0,43, RSI14'te 20. barda 1,88 puan fark. Fark tam da
 *     backend'in "gösterge artık geçerli" dediği ısınma bölgesinde en büyüktü:
 *     grafikte kesişim görünüyor, backtest görmüyordu.
 *
 * Bu yüzden buradaki her fonksiyon backend'in pandas karşılığını taklit eder:
 *   - `ewm(span=n, adjust=False)`  → `ewmSpan`
 *   - `ewm(alpha=1/n, adjust=False)` (Wilder) → `ewmAlpha`
 *   - `rolling(n).std()` → ÖRNEKLEM (ddof=1) standart sapma
 *
 * Ayrıca seriler backend'in `IndicatorRegistry.get_value` NaN eşiğiyle aynı
 * bardan başlar (bkz. `warmupBars`): grafikte görünen her nokta, backtest'in
 * gerçekten değerlendirdiği bir noktadır.
 *
 * Uyum `backend/tests/indicator_parity.json` altın örneğiyle iki taraftan da
 * doğrulanır (`test_indicator_parity.py` + `e2e/indicator-parity.spec.ts`).
 *
 * NOT (bilinen borç): RULES.md "Chart/UI tarafına finansal hesaplama mantığı
 * yazmak" yasağı hâlâ ihlal ediliyor — doğru çözüm serileri backend'den
 * çekmek. Replay her mum adımında yeniden hesap istediği için bu ayrı bir iş
 * olarak roadmap'e alındı; o güne kadar altın örnek iki tarafı bağlar.
 */

export interface TimeValue {
  time: number;
  value: number;
}

export interface CandleInput {
  time: number;
  close: number;
}

// ─── pandas karşılıkları ──────────────────────────────────────────────────

/**
 * `pandas.Series.ewm(span=period, adjust=False).mean()`
 *
 * İlk değerle tohumlanır (`out[0] = values[0]`), SMA ile değil. Bu, backend'in
 * kullandığı biçimdir; SMA tohumlaması ilk ~3×period barda görünür sapma
 * üretiyordu.
 */
function ewmSpan(values: number[], period: number): number[] {
  return ewmAlpha(values, 2 / (period + 1));
}

/**
 * `pandas.Series.ewm(alpha=alpha, adjust=False).mean()`
 *
 * Wilder yumuşatması `alpha = 1/period` ile bunu kullanır (RSI, ATR, ADX).
 */
function ewmAlpha(values: number[], alpha: number): number[] {
  const out: number[] = new Array(values.length);
  if (values.length === 0) return out;

  let prev = values[0];
  out[0] = prev;
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * alpha + prev * (1 - alpha);
    out[i] = prev;
  }
  return out;
}

/**
 * Backend'in `INDICATOR_INFO[...]["warmup"]` tablosunun karşılığı.
 *
 * `IndicatorRegistry.get_value` bu bardan ÖNCESİ için NaN döndürür; grafik de
 * aynı yerden başlasın ki görünen her nokta test edilmiş bir nokta olsun.
 */
export function warmupBars(
  name: 'EMA' | 'SMA' | 'RSI' | 'MACD' | 'BollingerBands',
  period: number,
  slowPeriod?: number,
  signalPeriod?: number
): number {
  if (name === 'MACD') {
    return (slowPeriod ?? 26) + (signalPeriod ?? 9);
  }
  return period;
}

// ─── Göstergeler ──────────────────────────────────────────────────────────

/**
 * Üssel Hareketli Ortalama (EMA) — `calc_ema` ile birebir.
 */
export function calculateEMA(data: CandleInput[], period: number): TimeValue[] {
  const warmup = warmupBars('EMA', period);
  if (data.length <= warmup) return [];

  const ema = ewmSpan(
    data.map((d) => d.close),
    period
  );

  const result: TimeValue[] = [];
  for (let i = warmup; i < data.length; i++) {
    result.push({ time: data[i].time, value: ema[i] });
  }
  return result;
}

/**
 * Göreceli Güç Endeksi (RSI) — `calc_rsi` ile birebir (Wilder yumuşatması).
 *
 * Backend `close.diff()` sonucunu kullanır ve ilk bardaki NaN'ı 0'a çevirir;
 * kazanç/kayıp serileri bu 0 ile tohumlanır. Kayıp yokken RSI tanım gereği
 * 100, ne kazanç ne kayıp varken 50'dir.
 */
export function calculateRSI(data: CandleInput[], period = 14): TimeValue[] {
  const warmup = warmupBars('RSI', period);
  if (data.length <= warmup) return [];

  const gains: number[] = new Array(data.length);
  const losses: number[] = new Array(data.length);
  // İlk barın değişimi tanımsız; backend'de NaN > 0 yanlış olduğu için 0 olur.
  gains[0] = 0;
  losses[0] = 0;
  for (let i = 1; i < data.length; i++) {
    const change = data[i].close - data[i - 1].close;
    gains[i] = change > 0 ? change : 0;
    losses[i] = change < 0 ? -change : 0;
  }

  const avgGain = ewmAlpha(gains, 1 / period);
  const avgLoss = ewmAlpha(losses, 1 / period);

  const result: TimeValue[] = [];
  for (let i = warmup; i < data.length; i++) {
    let rsi: number;
    if (avgLoss[i] === 0) {
      // Hiç kayıp yoksa RSI 100; tamamen yatay fiyatta nötr 50.
      rsi = avgGain[i] > 0 ? 100 : 50;
    } else {
      rsi = 100 - 100 / (1 + avgGain[i] / avgLoss[i]);
    }
    result.push({ time: data[i].time, value: rsi });
  }
  return result;
}

export interface MACDHistogramValue {
  time: number;
  value: number;
  color: string;
}

export interface MACDResult {
  macd: TimeValue[];
  signal: TimeValue[];
  histogram: MACDHistogramValue[];
}

/**
 * MACD — `calc_macd` ile birebir.
 *
 * DİKKAT: backend yavaş periyodu HIZLIDAN TÜRETİR (`slow = max(fast*2+2, 26)`),
 * burada ise üçü de kullanıcı ayarından gelir. Varsayılan 12/26/9 ikisinde de
 * aynı sonucu verir; grafikte hızlı periyot değiştirilip yavaş sabit
 * bırakılırsa backend farklı bir yavaş periyot kullanır. Bu, hesap değil
 * PARAMETRE farkıdır ve ayrı bir düzeltme gerektirir.
 */
export function calculateMACD(
  data: CandleInput[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): MACDResult {
  const warmup = warmupBars('MACD', fastPeriod, slowPeriod, signalPeriod);
  if (data.length <= warmup) {
    return { macd: [], signal: [], histogram: [] };
  }

  const closes = data.map((d) => d.close);
  const emaFast = ewmSpan(closes, fastPeriod);
  const emaSlow = ewmSpan(closes, slowPeriod);

  const macdLineFull: number[] = closes.map((_, i) => emaFast[i] - emaSlow[i]);
  const signalLineFull = ewmSpan(macdLineFull, signalPeriod);

  const macd: TimeValue[] = [];
  const signal: TimeValue[] = [];
  const histogram: MACDHistogramValue[] = [];

  for (let i = warmup; i < data.length; i++) {
    const time = data[i].time;
    const histValue = macdLineFull[i] - signalLineFull[i];
    macd.push({ time, value: macdLineFull[i] });
    signal.push({ time, value: signalLineFull[i] });
    histogram.push({
      time,
      value: histValue,
      color: histValue >= 0 ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)',
    });
  }

  return { macd, signal, histogram };
}

export interface BollingerBandsResult {
  upper: TimeValue[];
  middle: TimeValue[];
  lower: TimeValue[];
}

/**
 * Bollinger Bantları — `calc_bollinger` ile birebir.
 *
 * Standart sapma ÖRNEKLEM (ddof=1, `/(n-1)`) biçimindedir; pandas'ın
 * `rolling().std()` varsayılanı budur. Popülasyon sapması (`/n`) kullanmak
 * period=20'de bandı ~%2,6 dar çiziyordu ve bu fark hiç kapanmıyordu.
 */
export function calculateBollingerBands(
  data: CandleInput[],
  period = 20,
  stdDevMult = 2
): BollingerBandsResult {
  const warmup = warmupBars('BollingerBands', period);
  if (data.length <= warmup || period < 2) {
    return { upper: [], middle: [], lower: [] };
  }

  const upper: TimeValue[] = [];
  const middle: TimeValue[] = [];
  const lower: TimeValue[] = [];

  for (let i = warmup; i < data.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += data[j].close;
    }
    const sma = sum / period;

    let varianceSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = data[j].close - sma;
      varianceSum += diff * diff;
    }
    // ddof=1: örneklem standart sapması (pandas rolling().std() varsayılanı).
    const stdDev = Math.sqrt(varianceSum / (period - 1));

    const time = data[i].time;
    middle.push({ time, value: sma });
    upper.push({ time, value: sma + stdDevMult * stdDev });
    lower.push({ time, value: sma - stdDevMult * stdDev });
  }

  return { upper, middle, lower };
}
