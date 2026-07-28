/**
 * Çizim aracı kullanım istatistiği.
 *
 * Yalnızca admin panelindeki genel istatistikler ("hangi araç ne kadar
 * kullanılmış") için tek satırlık bir kullanım kaydı gönderir. Çizimin
 * kendisi burada saklanmaz/geri yüklenmez (bkz. CandleChart.tsx içindeki
 * bellek içi drawingsBySymbolRef); bu yüzden istek sessizce yutulur —
 * başarısız olması kullanıcının çizim yapmasını etkilememeli.
 */

import { apiRequest } from './api';

export async function logDrawingUsage(tool: string, symbol: string, provider: string): Promise<void> {
  try {
    await apiRequest<void>('/api/analytics/drawing-usage', {
      method: 'POST',
      body: JSON.stringify({ tool, symbol, provider }),
    });
  } catch {
    // istatistik amaçlı çağrı; sessizce yut
  }
}
