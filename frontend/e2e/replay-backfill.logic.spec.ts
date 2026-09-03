import { expect, test } from '@playwright/test';
import { pendingReplayBars } from '../src/utils/replayBars';

test('geçmiş mumlar öne eklendiğinde giriş öncesi mum stop kontrolüne girmez', () => {
  const bars = [5, 10, 11, 12].map((time) => ({ time }));
  expect(pendingReplayBars(bars, 3, new Date(10_000).toISOString(), 0, null)
    .map(({ bar }) => bar.time)).toEqual([11, 12]);
});

test('kontrol imleci dizi indeksinden bağımsız olarak zamanı izler', () => {
  const bars = [1, 2, 3, 4].map((time) => ({ time }));
  expect(pendingReplayBars(bars, 3, null, 0, 3).map(({ bar }) => bar.time)).toEqual([4]);
});
