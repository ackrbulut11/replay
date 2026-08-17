/**
 * Sağdaki yan panelin (izleme listesi / alarmlar) genişlik tutamacı.
 *
 * Sürükleme sırasında store'a HİÇ yazılmaz. Eskiden her `mousemove`
 * `setPanelWidth` çağırıyordu; bu da her piksel için sırayla şunları yapıyordu:
 * tüm listelerin `JSON.stringify`'ı + eşzamanlı `localStorage.setItem`, ardından
 * store'u dinleyen her bileşenin (App, grafik, paneller, sağ ray) yeniden
 * render'ı. Panel bu yüzden fareyi takip edemiyor, kasarak kayıyordu.
 *
 * Bunun yerine genişlik doğrudan panelin `--panel-w` CSS değişkenine yazılır ve
 * yazma `requestAnimationFrame` ile kareye bağlanır: yerleşim React'e hiç
 * uğramadan değişir, grafik zaten `ResizeObserver` ile kendini toparlar
 * (bkz. CandleChart). Store'a yalnızca fare bırakıldığında bir kez yazılır.
 *
 * Değişken React'in `style` niteliği yerine ref üzerinden yazılıyor: aksi halde
 * sürükleme ortasına denk gelen herhangi bir render (ör. 15 sn'lik fiyat
 * yenilemesi) niteliği store'daki eski genişlikle geri yazar ve panel zıplardı.
 */

import { useCallback, useLayoutEffect, useRef } from 'react';
import { watchlistStore, PANEL_MIN_WIDTH, PANEL_MAX_WIDTH } from '../store/watchlistStore';

function clampWidth(width: number): number {
  return Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, width));
}

export function usePanelResize(storedWidth: number) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Store'daki genişlik (ilk boyama, başka bir panelde yapılan değişiklik)
  // panele buradan uygulanır; boyama öncesi çalışsın diye layout effect.
  useLayoutEffect(() => {
    panelRef.current?.style.setProperty('--panel-w', `${storedWidth}px`);
  }, [storedWidth]);

  const onResizePointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const panel = panelRef.current;
    if (!panel || e.button !== 0) return;
    e.preventDefault();

    const startX = e.clientX;
    const startWidth = panel.getBoundingClientRect().width;
    let width = startWidth;
    let frame = 0;

    const paint = () => {
      frame = 0;
      panel.style.setProperty('--panel-w', `${width}px`);
    };

    // Fare panelden hızlıca çıkıp grafiğin üstüne kaçtığında da olaylar
    // gelmeye devam etsin diye işaretçi tutamaca kilitlenir.
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);

    // Sürükleme boyunca imleç her yerde aynı kalsın ve metin seçilmesin.
    const previousCursor = document.body.style.cursor;
    const previousSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onPointerMove = (me: PointerEvent) => {
      // Panel sağda: sola çekmek genişletir.
      width = clampWidth(startWidth + (startX - me.clientX));
      if (!frame) frame = requestAnimationFrame(paint);
    };

    const onPointerUp = () => {
      if (frame) {
        cancelAnimationFrame(frame);
        paint();
      }
      handle.releasePointerCapture(e.pointerId);
      handle.removeEventListener('pointermove', onPointerMove);
      handle.removeEventListener('pointerup', onPointerUp);
      handle.removeEventListener('pointercancel', onPointerUp);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelect;

      // Kalıcı hale getirme (localStorage + diğer panel) sürüklemenin sonunda,
      // tek seferde.
      watchlistStore.setPanelWidth(width);
    };

    // İşaretçi kilitlendiği için olaylar `window`a değil tutamaca gelir.
    handle.addEventListener('pointermove', onPointerMove);
    handle.addEventListener('pointerup', onPointerUp);
    handle.addEventListener('pointercancel', onPointerUp);
  }, []);

  return { panelRef, onResizePointerDown };
}
