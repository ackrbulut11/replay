export interface TimeValue {
  time: number;
  value: number;
}

export interface CandleInput {
  time: number;
  close: number;
}

/**
 * Üssel Hareketli Ortalama (EMA)
 */
export function calculateEMA(data: CandleInput[], period: number): TimeValue[] {
  if (data.length < period) return [];
  const result: TimeValue[] = [];
  const k = 2 / (period + 1);

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i].close;
  }
  let prevEma = sum / period;
  result.push({ time: data[period - 1].time, value: prevEma });

  for (let i = period; i < data.length; i++) {
    const currentEma = data[i].close * k + prevEma * (1 - k);
    result.push({ time: data[i].time, value: currentEma });
    prevEma = currentEma;
  }

  return result;
}

/**
 * Göreceli Güç Endeksi (RSI) - Wilder Yumuşatması
 */
export function calculateRSI(data: CandleInput[], period = 14): TimeValue[] {
  if (data.length <= period) return [];

  const result: TimeValue[] = [];
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = data[i].close - data[i - 1].close;
    if (change >= 0) gains += change;
    else losses -= change;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  let firstRsi = 50;
  if (avgLoss === 0 && avgGain > 0) {
    firstRsi = 100;
  } else if (avgLoss > 0) {
    const firstRs = avgGain / avgLoss;
    firstRsi = 100 - 100 / (1 + firstRs);
  }
  result.push({ time: data[period].time, value: firstRsi });

  for (let i = period + 1; i < data.length; i++) {
    const change = data[i].close - data[i - 1].close;
    const gain = change >= 0 ? change : 0;
    const loss = change < 0 ? -change : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    let rsi = 50;
    if (avgLoss === 0 && avgGain > 0) {
      rsi = 100;
    } else if (avgLoss > 0) {
      const rs = avgGain / avgLoss;
      rsi = 100 - 100 / (1 + rs);
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
 * Hareketli Ortalama Yakınsama Iraksama (MACD)
 */
export function calculateMACD(
  data: CandleInput[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): MACDResult {
  if (data.length < slowPeriod) {
    return { macd: [], signal: [], histogram: [] };
  }

  const fastEmaMap = new Map<number, number>();
  calculateEMA(data, fastPeriod).forEach((item) => fastEmaMap.set(item.time, item.value));

  const slowEmaMap = new Map<number, number>();
  calculateEMA(data, slowPeriod).forEach((item) => slowEmaMap.set(item.time, item.value));

  const macdData: CandleInput[] = [];
  const macdLine: TimeValue[] = [];

  data.forEach((item) => {
    const fast = fastEmaMap.get(item.time);
    const slow = slowEmaMap.get(item.time);
    if (fast !== undefined && slow !== undefined) {
      const macdVal = fast - slow;
      macdLine.push({ time: item.time, value: macdVal });
      macdData.push({ time: item.time, close: macdVal });
    }
  });

  const signalLine = calculateEMA(macdData, signalPeriod);
  const signalMap = new Map<number, number>();
  signalLine.forEach((item) => signalMap.set(item.time, item.value));

  const histogram: MACDHistogramValue[] = [];

  macdLine.forEach((item) => {
    const sig = signalMap.get(item.time);
    if (sig !== undefined) {
      const histVal = item.value - sig;
      histogram.push({
        time: item.time,
        value: histVal,
        color: histVal >= 0 ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)',
      });
    }
  });

  return {
    macd: macdLine.filter((item) => signalMap.has(item.time)),
    signal: signalLine,
    histogram,
  };
}

export interface BollingerBandsResult {
  upper: TimeValue[];
  middle: TimeValue[];
  lower: TimeValue[];
}

/**
 * Bollinger Bands (BB)
 */
export function calculateBollingerBands(
  data: CandleInput[],
  period = 20,
  stdDevMult = 2
): BollingerBandsResult {
  if (data.length < period) return { upper: [], middle: [], lower: [] };

  const upper: TimeValue[] = [];
  const middle: TimeValue[] = [];
  const lower: TimeValue[] = [];

  for (let i = period - 1; i < data.length; i++) {
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
    const stdDev = Math.sqrt(varianceSum / period);

    const time = data[i].time;
    middle.push({ time, value: sma });
    upper.push({ time, value: sma + stdDevMult * stdDev });
    lower.push({ time, value: sma - stdDevMult * stdDev });
  }

  return { upper, middle, lower };
}
