/**
 * Yüzen bir paneli fareyle sürüklenebilir yapar.
 *
 * Konum React state'inde TUTULMAZ: mousemove saniyede yüzlerce kez tetiklenir
 * ve her birinde state güncellemek paneli baştan render ederek gözle görülür
 * kasmaya yol açıyordu. Bunun yerine transform doğrudan DOM'a, ekran yenileme
 * hızına (rAF) sabitlenerek yazılır — render döngüsü hiç çalışmaz.
 *
 * Kullanım:
 *   const { panelRef, handleDragStart } = useDraggablePanel();
 *   <div ref={panelRef}>
 *     <div onMouseDown={handleDragStart}>tutamaç</div>
 *   </div>
 *
 * `transform` JSX'te verilmemelidir; React'in yeniden render'ı sürükleme
 * sırasında yazılan değeri sıfırlar.
 */

import { useCallback, useEffect, useRef } from 'react';

export function useDraggablePanel() {
  const panelRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(
    null
  );
  const frameRef = useRef<number | null>(null);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: offsetRef.current.x,
      originY: offsetRef.current.y,
    };
  }, []);

  useEffect(() => {
    const paint = () => {
      frameRef.current = null;
      const el = panelRef.current;
      if (el) {
        const { x, y } = offsetRef.current;
        // translate3d: konumlandırmayı GPU katmanına taşır, yeniden yerleşim tetiklemez.
        el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      }
    };

    const handleMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      offsetRef.current = {
        x: drag.originX + (e.clientX - drag.startX),
        y: drag.originY + (e.clientY - drag.startY),
      };
      // Aynı karede birden fazla mousemove gelirse tek çizim yeter.
      if (frameRef.current === null) {
        frameRef.current = requestAnimationFrame(paint);
      }
    };

    const handleUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      // Bekleyen bir kare varsa hemen çiz: rAF kısıtlandığında (ör. arka plan
      // sekmesi) panel son konumuna hiç taşınmadan kalabilirdi.
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        paint();
      }
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return { panelRef, handleDragStart };
}
