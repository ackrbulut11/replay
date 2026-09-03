import { expect, test } from '@playwright/test';

import { escapeCsvCell } from '../src/utils/csv';

test.describe('CSV hücre güvenliği', () => {
  test('formül öneklerini metne zorlar', () => {
    expect(escapeCsvCell('=1+1')).toBe("'=1+1");
    expect(escapeCsvCell('+SUM(1;2)')).toBe("\"'+SUM(1;2)\"");
    expect(escapeCsvCell('@komut')).toBe("'@komut");
    expect(escapeCsvCell('-cmd|calc')).toBe("'-cmd|calc");
  });

  test('negatif sayıları sayı olarak korur', () => {
    expect(escapeCsvCell(-12.5)).toBe('-12.5');
    expect(escapeCsvCell('-12,5')).toBe('-12,5');
  });
});
