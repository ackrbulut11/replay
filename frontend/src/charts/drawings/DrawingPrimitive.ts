import type {
  ISeriesPrimitivePaneView,
  ISeriesPrimitivePaneRenderer,
  SeriesAttachedParameter,
  ISeriesPrimitiveBase,
  IChartApiBase,
  ISeriesApi,
  PrimitiveHoveredItem,
  SeriesType,
  Time,
} from 'lightweight-charts';
import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type { Drawing, DrawingPoint } from './types';
import { HIT_THRESHOLD } from './types';

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PixelPoint {
  x: number;
  y: number;
}

export interface PixelDrawing {
  id?: string;
  tool: Drawing['tool'];
  points: PixelPoint[];
  color: string;
  lineWidth: number;
  opacity: number;
  fillOpacity?: number;
  logicalPoints?: DrawingPoint[];
}

const HANDLE_RADIUS = 5;
const HIT_RADIUS = HIT_THRESHOLD;
const BODY_HIT_THRESHOLD = 6;

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export function getRectHandlePositions(d: PixelDrawing): PixelPoint[] {
  if (d.points.length < 2) return [];
  const x1 = Math.min(d.points[0].x, d.points[1].x);
  const y1 = Math.min(d.points[0].y, d.points[1].y);
  const x2 = Math.max(d.points[0].x, d.points[1].x);
  const y2 = Math.max(d.points[0].y, d.points[1].y);
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  return [
    { x: x1, y: y1 }, { x: mx, y: y1 }, { x: x2, y: y1 },
    { x: x2, y: my },
    { x: x2, y: y2 }, { x: mx, y: y2 }, { x: x1, y: y2 },
    { x: x1, y: my },
  ];
}

export function getPositionHandlePositions(d: PixelDrawing): PixelPoint[] {
  if (d.points.length < 2) return [];
  const startX = d.points[0].x;
  const rightX = d.points[1].x;
  const mx = (startX + rightX) / 2;

  const yEntry = d.points[0].y;
  const yTarget = d.points[1].y;
  const yStop = d.points.length >= 3 ? d.points[2].y : (yEntry + (yEntry - yTarget) / 2);

  return [
    { x: mx, y: yTarget },   // 0: Target
    { x: mx, y: yStop },     // 1: Stop
    { x: mx, y: yEntry },    // 2: Entry
    { x: rightX, y: yEntry },// 3: Right time limit
  ];
}

export const RECT_HANDLE_LABELS = ['tl', 't', 'tr', 'r', 'br', 'b', 'bl', 'l'];
export const POSITION_HANDLE_LABELS = ['target', 'stop', 'entry', 'right'];

function getHandlePositions(d: PixelDrawing): PixelPoint[] {
  if (d.tool === 'rectangle' || d.tool === 'ruler') return getRectHandlePositions(d);
  if (d.tool === 'longPosition' || d.tool === 'shortPosition') return getPositionHandlePositions(d);
  return d.points;
}

function formatNumberTR(val: number, decimals: number = 2): string {
  const parts = val.toFixed(decimals).split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  if (decimals > 0 && parts[1]) {
    const dec = parts[1].replace(/0+$/, '');
    if (dec.length > 0) return `${intPart},${dec}`;
    return intPart;
  }
  return intPart;
}

function drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawArrowHead(ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number, size: number = 8) {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(
    toX - size * Math.cos(angle - Math.PI / 6),
    toY - size * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    toX - size * Math.cos(angle + Math.PI / 6),
    toY - size * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fillStyle = ctx.strokeStyle;
  ctx.fill();
  ctx.restore();
}

function computeRulerStats(p1: DrawingPoint, p2: DrawingPoint, candles: CandleData[]) {
  const price1 = p1.price;
  const price2 = p2.price;
  const priceDiff = price2 - price1;
  const pricePercent = price1 !== 0 ? (priceDiff / price1) * 100 : 0;

  const absPrice = Math.abs(price1);
  let tickSize = 0.01;
  if (absPrice >= 10000) tickSize = 0.1;
  else if (absPrice >= 100) tickSize = 0.01;
  else if (absPrice >= 1) tickSize = 0.001;
  else tickSize = 0.00001;

  const ticks = Math.round(Math.abs(priceDiff) / tickSize);

  const priceDiffFormatted = formatNumberTR(Math.abs(priceDiff), 1);
  const percentFormatted = formatNumberTR(Math.abs(pricePercent), 2);
  const ticksFormatted = formatNumberTR(ticks, 0);

  const line1 = `${priceDiff < 0 ? '-' : ''}${priceDiffFormatted} (${pricePercent < 0 ? '-' : ''}${percentFormatted}%) ${ticksFormatted}`;

  const t1 = p1.time;
  const t2 = p2.time;
  const minTime = Math.min(t1, t2);
  const maxTime = Math.max(t1, t2);

  let barCount = 0;
  let volumeSum = 0;

  if (candles.length > 0) {
    for (const c of candles) {
      if (c.time >= minTime && c.time <= maxTime) {
        barCount++;
        volumeSum += c.volume || 0;
      }
    }
  }

  if (barCount === 0) barCount = 1;

  const durationSec = Math.abs(t2 - t1);
  const seconds = durationSec > 1e11 ? Math.floor(durationSec / 1000) : durationSec;
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  let durationStr = '';
  if (days > 0) {
    durationStr = `${days}g`;
  } else if (hours > 0) {
    durationStr = `${hours}sa`;
  } else if (minutes > 0) {
    durationStr = `${minutes}dk`;
  } else {
    durationStr = `${seconds}s`;
  }

  const line2 = `${barCount} çubukta, ${durationStr}`;

  let volStr = '';
  if (volumeSum >= 1e9) {
    volStr = formatNumberTR(volumeSum / 1e9, 2) + ' B';
  } else if (volumeSum >= 1e6) {
    volStr = formatNumberTR(volumeSum / 1e6, 2) + ' M';
  } else if (volumeSum >= 1e3) {
    volStr = formatNumberTR(volumeSum / 1e3, 2) + ' K';
  } else {
    volStr = formatNumberTR(volumeSum, 0);
  }

  const line3 = `Hacim ${volStr}`;

  return { line1, line2, line3, isPositive: priceDiff >= 0 };
}

class DrawingsPaneRenderer implements ISeriesPrimitivePaneRenderer {
  private _drawings: PixelDrawing[] = [];
  private _preview: PixelDrawing | null = null;
  private _selectedId: string | null = null;
  private _hoveredId: string | null = null;
  private _candles: CandleData[] = [];

  setDrawings(drawings: PixelDrawing[]) {
    this._drawings = drawings;
  }

  setPreview(preview: PixelDrawing | null) {
    this._preview = preview;
  }

  setSelectedId(id: string | null) {
    this._selectedId = id;
  }

  setHoveredId(id: string | null) {
    this._hoveredId = id;
  }

  setCandles(candles: CandleData[]) {
    this._candles = candles;
  }

  draw(target: CanvasRenderingTarget2D): void {
    target.useMediaCoordinateSpace(({ context: ctx }) => {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (const d of this._drawings) {
        ctx.globalAlpha = d.tool === 'ruler' ? 1 : d.opacity;
        const showHandles = d.id === this._selectedId || d.id === this._hoveredId;
        this._render(ctx, d, false, showHandles);
        ctx.globalAlpha = 1;
      }

      if (this._preview) {
        ctx.setLineDash([6, 3]);
        ctx.globalAlpha = this._preview.tool === 'ruler' ? 1 : this._preview.opacity;
        this._render(ctx, this._preview, true, false);
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
    });
  }

  private _render(ctx: CanvasRenderingContext2D, d: PixelDrawing, isPreview: boolean, showHandles: boolean) {
    if (d.points.length < 1) return;

    const lw = isPreview ? 1.5 : d.lineWidth;
    ctx.strokeStyle = d.color;
    ctx.lineWidth = lw;

    switch (d.tool) {
      case 'trendLine': {
        if (d.points.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(d.points[0].x, d.points[0].y);
        ctx.lineTo(d.points[1].x, d.points[1].y);
        ctx.stroke();
        break;
      }

      case 'horizontalRay': {
        ctx.beginPath();
        ctx.moveTo(d.points[0].x, d.points[0].y);
        ctx.lineTo(d.points[0].x + 99999, d.points[0].y);
        ctx.stroke();
        break;
      }

      case 'rectangle': {
        if (d.points.length < 2) return;
        const x = Math.min(d.points[0].x, d.points[1].x);
        const y = Math.min(d.points[0].y, d.points[1].y);
        const w = Math.abs(d.points[1].x - d.points[0].x);
        const h = Math.abs(d.points[1].y - d.points[0].y);
        if (!isFinite(w) || !isFinite(h)) return;

        // İç dolgu
        if (d.fillOpacity != null && d.fillOpacity > 0) {
          const savedAlpha = ctx.globalAlpha;
          ctx.globalAlpha = savedAlpha * d.fillOpacity;
          ctx.fillStyle = d.color;
          ctx.fillRect(x, y, w, h);
          ctx.globalAlpha = savedAlpha;
        }

        // Kenar çizgisi
        ctx.strokeRect(x, y, w, h);
        break;
      }

      case 'parallelChannel': {
        if (d.points.length < 3) return;
        const dx = d.points[1].x - d.points[0].x;
        const dy = d.points[1].y - d.points[0].y;
        if (!isFinite(dx) || !isFinite(dy)) return;
        const p2x = d.points[2].x + dx;
        const p2y = d.points[2].y + dy;

        ctx.beginPath();
        ctx.moveTo(d.points[0].x, d.points[0].y);
        ctx.lineTo(d.points[1].x, d.points[1].y);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(d.points[2].x, d.points[2].y);
        ctx.lineTo(p2x, p2y);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(d.points[0].x, d.points[0].y);
        ctx.lineTo(d.points[2].x, d.points[2].y);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(d.points[1].x, d.points[1].y);
        ctx.lineTo(p2x, p2y);
        ctx.stroke();
        break;
      }

      case 'ruler': {
        if (d.points.length < 2) return;
        const x1 = d.points[0].x;
        const y1 = d.points[0].y;
        const x2 = d.points[1].x;
        const y2 = d.points[1].y;

        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);
        const rectW = maxX - minX;
        const rectH = maxY - minY;

        // Kardaysa Mavi, Zarardaysa Koyu Kırmızı; Çizerken ve bitince birebir aynı şeffaflık (%14)
        const isPositive = d.logicalPoints && d.logicalPoints.length >= 2
          ? d.logicalPoints[1].price >= d.logicalPoints[0].price
          : y2 <= y1;

        const mainColor = isPositive ? '#2962ff' : '#a71d2a'; // Kar: Mavi, Zarar: Koyu Kırmızı
        const fillColor = isPositive ? 'rgba(41, 98, 255, 0.14)' : 'rgba(167, 29, 42, 0.14)'; // Çizerkenki %14 şeffaflık sabit

        // 1. Fill shaded background box
        ctx.fillStyle = fillColor;
        ctx.fillRect(minX, minY, rectW, rectH);

        // 2. Dashed crosshair lines
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(minX, minY); ctx.lineTo(maxX, minY);
        ctx.moveTo(minX, maxY); ctx.lineTo(maxX, maxY);
        ctx.moveTo(minX, minY); ctx.lineTo(minX, maxY);
        ctx.moveTo(maxX, minY); ctx.lineTo(maxX, maxY);
        ctx.stroke();
        ctx.setLineDash([]);

        // 3. Directional vectors / arrows
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;

        ctx.strokeStyle = mainColor;
        ctx.fillStyle = mainColor;
        ctx.lineWidth = 2;

        // Vertical arrow (price span)
        ctx.beginPath();
        ctx.moveTo(midX, y1);
        ctx.lineTo(midX, y2);
        ctx.stroke();
        drawArrowHead(ctx, midX, y1, midX, y2, 8);

        // Horizontal arrow (time span)
        ctx.beginPath();
        ctx.moveTo(x1, midY);
        ctx.lineTo(x2, midY);
        ctx.stroke();
        drawArrowHead(ctx, x1, midY, x2, midY, 8);

        // 4. Callout Tooltip Badge
        if (d.logicalPoints && d.logicalPoints.length >= 2) {
          const stats = computeRulerStats(d.logicalPoints[0], d.logicalPoints[1], this._candles);

          const fontHeader = 'bold 13px system-ui, -apple-system, sans-serif';
          const fontBody = '13px system-ui, -apple-system, sans-serif';

          ctx.font = fontHeader;
          const w1 = ctx.measureText(stats.line1).width;
          ctx.font = fontBody;
          const w2 = ctx.measureText(stats.line2).width;
          const w3 = ctx.measureText(stats.line3).width;

          const maxTextWidth = Math.max(w1, w2, w3);
          const boxPaddingX = 14;
          const boxPaddingY = 10;
          const lineHeight = 18;
          const boxW = maxTextWidth + boxPaddingX * 2;
          const boxH = lineHeight * 3 + boxPaddingY * 2;

          let boxX = midX - boxW / 2;
          let boxY = minY - boxH - 12;

          if (boxY < 10) {
            boxY = maxY + 12;
          }

          // Draw badge background (Kar: Mavi, Zarar: Kırmızı)
          ctx.fillStyle = mainColor;
          drawRoundRect(ctx, boxX, boxY, boxW, boxH, 8);
          ctx.fill();

          // Draw badge text
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';

          const textCenterX = boxX + boxW / 2;
          let textY = boxY + boxPaddingY;

          ctx.font = fontHeader;
          ctx.fillText(stats.line1, textCenterX, textY);

          textY += lineHeight;
          ctx.font = fontBody;
          ctx.fillText(stats.line2, textCenterX, textY);

          textY += lineHeight;
          ctx.fillText(stats.line3, textCenterX, textY);
        }

        break;
      }

      case 'longPosition':
      case 'shortPosition': {
        if (d.points.length < 2) return;
        const x1 = d.points[0].x;
        const yEntry = d.points[0].y;
        const x2 = d.points[1].x;
        const yTarget = d.points[1].y;
        const yStop = d.points.length >= 3 ? d.points[2].y : (yEntry + (yEntry - yTarget) / 2);

        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        const rectW = Math.max(2, maxX - minX);

        const isLong = d.tool === 'longPosition';

        // Long: Target arriba (yTarget < yEntry), Stop abajo (yStop > yEntry)
        // Short: Target abajo (yTarget > yEntry), Stop arriba (yStop < yEntry)
        const profitTopY = Math.min(yEntry, yTarget);
        const profitHeight = Math.abs(yEntry - yTarget);

        const lossTopY = Math.min(yEntry, yStop);
        const lossHeight = Math.abs(yEntry - yStop);

        // 1. Kar Bölgesi (Yeşil Dolgu)
        ctx.fillStyle = 'rgba(16, 185, 129, 0.20)';
        ctx.fillRect(minX, profitTopY, rectW, profitHeight);
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.85)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(minX, profitTopY, rectW, profitHeight);

        // 2. Zarar Bölgesi (Kırmızı Dolgu)
        ctx.fillStyle = 'rgba(239, 68, 68, 0.20)';
        ctx.fillRect(minX, lossTopY, rectW, lossHeight);
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(minX, lossTopY, rectW, lossHeight);

        // 3. Giriş Çizgisi (Mavi Ortadaki Çizgi)
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(minX, yEntry);
        ctx.lineTo(maxX, yEntry);
        ctx.stroke();

        // 4. Değer Rozeti (Merkez Bilgi Kutusu - Yalnızca üstüne tıklandığında/seçildiğinde gösterilir)
        if (showHandles && d.logicalPoints && d.logicalPoints.length >= 2) {
          const pEntry = d.logicalPoints[0].price;
          const pTarget = d.logicalPoints[1].price;
          const pStop = d.logicalPoints.length >= 3 ? d.logicalPoints[2].price : (pEntry - (pTarget - pEntry) / 2);

          let targetDiff: number, targetPct: number, stopDiff: number, stopPct: number;
          if (isLong) {
            targetDiff = pTarget - pEntry;
            targetPct = (targetDiff / pEntry) * 100;
            stopDiff = pEntry - pStop;
            stopPct = (stopDiff / pEntry) * 100;
          } else {
            targetDiff = pEntry - pTarget;
            targetPct = (targetDiff / pEntry) * 100;
            stopDiff = pStop - pEntry;
            stopPct = (stopDiff / pEntry) * 100;
          }
          const rrRatio = stopDiff !== 0 ? Math.abs(targetDiff / stopDiff) : 0;

          const text1 = `R:R  ${formatNumberTR(rrRatio, 2)}`;
          const text2 = `Hedef: ${targetPct >= 0 ? '+' : ''}${formatNumberTR(targetPct, 2)}% (${targetDiff >= 0 ? '+' : ''}${formatNumberTR(targetDiff, 2)})`;
          const text3 = `Stop: -${formatNumberTR(Math.abs(stopPct), 2)}% (-${formatNumberTR(Math.abs(stopDiff), 2)})`;

          ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
          const w1 = ctx.measureText(text1).width;
          const w2 = ctx.measureText(text2).width;
          const w3 = ctx.measureText(text3).width;
          const badgeW = Math.max(w1, w2, w3) + 20;
          const badgeH = 54;
          const badgeX = minX + (rectW - badgeW) / 2;
          const badgeY = yEntry - badgeH / 2;

          ctx.fillStyle = 'rgba(13, 19, 33, 0.92)';
          ctx.strokeStyle = 'rgba(51, 65, 85, 0.8)';
          ctx.lineWidth = 1;
          drawRoundRect(ctx, badgeX, badgeY, badgeW, badgeH, 6);
          ctx.fill();
          ctx.stroke();

          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';

          ctx.fillStyle = '#f59e0b';
          ctx.fillText(text1, minX + rectW / 2, badgeY + 6);

          ctx.fillStyle = '#34d399';
          ctx.fillText(text2, minX + rectW / 2, badgeY + 22);

          ctx.fillStyle = '#f87171';
          ctx.fillText(text3, minX + rectW / 2, badgeY + 38);

          ctx.textAlign = 'left';
        }

        // 5. Sağ Kenar Fiyat Etiketleri
        if (d.logicalPoints && d.logicalPoints.length >= 2) {
          const pEntry = d.logicalPoints[0].price;
          const pTarget = d.logicalPoints[1].price;
          const pStop = d.logicalPoints.length >= 3 ? d.logicalPoints[2].price : (pEntry - (pTarget - pEntry));

          ctx.font = '10px monospace';
          ctx.textBaseline = 'middle';

          // Kar Al Etiketi
          const tText = `Kar Al: ${formatNumberTR(pTarget)}`;
          const tW = ctx.measureText(tText).width + 8;
          ctx.fillStyle = 'rgba(16, 185, 129, 0.9)';
          drawRoundRect(ctx, maxX + 4, yTarget - 8, tW, 16, 3);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.fillText(tText, maxX + 8, yTarget);

          // Durdur Etiketi
          const sText = `Durdur: ${formatNumberTR(pStop)}`;
          const sW = ctx.measureText(sText).width + 8;
          ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
          drawRoundRect(ctx, maxX + 4, yStop - 8, sW, 16, 3);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.fillText(sText, maxX + 8, yStop);

          // Giriş Etiketi
          const eText = `Giriş: ${formatNumberTR(pEntry)}`;
          const eW = ctx.measureText(eText).width + 8;
          ctx.fillStyle = 'rgba(56, 189, 248, 0.9)';
          drawRoundRect(ctx, maxX + 4, yEntry - 8, eW, 16, 3);
          ctx.fill();
          ctx.fillStyle = '#0f172a';
          ctx.fillText(eText, maxX + 8, yEntry);
        }

        break;
      }
    }

    if (showHandles) {
      this._drawHandles(ctx, d);
    }
  }

  private _drawHandles(ctx: CanvasRenderingContext2D, d: PixelDrawing) {
    const positions = getHandlePositions(d);
    for (const p of positions) {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = d.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, HANDLE_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}

class DrawingsPaneView implements ISeriesPrimitivePaneView {
  private _renderer: DrawingsPaneRenderer;

  constructor(renderer: DrawingsPaneRenderer) {
    this._renderer = renderer;
  }

  renderer(): ISeriesPrimitivePaneRenderer {
    return this._renderer;
  }
}

function getDrawingSegments(d: PixelDrawing): [PixelPoint, PixelPoint][] {
  if (d.points.length < 2) return [];
  const segs: [PixelPoint, PixelPoint][] = [];
  switch (d.tool) {
    case 'trendLine':
      segs.push([d.points[0], d.points[1]]);
      break;
    case 'horizontalRay':
      segs.push([d.points[0], { x: d.points[0].x + 99999, y: d.points[0].y }]);
      break;
    case 'rectangle':
    case 'ruler': {
      const x1 = Math.min(d.points[0].x, d.points[1].x);
      const y1 = Math.min(d.points[0].y, d.points[1].y);
      const x2 = Math.max(d.points[0].x, d.points[1].x);
      const y2 = Math.max(d.points[0].y, d.points[1].y);
      segs.push([{ x: x1, y: y1 }, { x: x2, y: y1 }]);
      segs.push([{ x: x2, y: y1 }, { x: x2, y: y2 }]);
      segs.push([{ x: x2, y: y2 }, { x: x1, y: y2 }]);
      segs.push([{ x: x1, y: y2 }, { x: x1, y: y1 }]);
      break;
    }
    case 'longPosition':
    case 'shortPosition': {
      const x1 = d.points[0].x;
      const x2 = d.points[1].x;
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      const yEntry = d.points[0].y;
      const yTarget = d.points[1].y;
      const yStop = d.points.length >= 3 ? d.points[2].y : (yEntry + (yEntry - yTarget) / 2);

      segs.push([{ x: minX, y: yTarget }, { x: maxX, y: yTarget }]);
      segs.push([{ x: minX, y: yEntry }, { x: maxX, y: yEntry }]);
      segs.push([{ x: minX, y: yStop }, { x: maxX, y: yStop }]);
      segs.push([{ x: minX, y: yTarget }, { x: minX, y: yStop }]);
      segs.push([{ x: maxX, y: yTarget }, { x: maxX, y: yStop }]);
      break;
    }
    case 'parallelChannel': {
      if (d.points.length < 3) break;
      const dx = d.points[1].x - d.points[0].x;
      const dy = d.points[1].y - d.points[0].y;
      const p2x = d.points[2].x + dx;
      const p2y = d.points[2].y + dy;
      segs.push([d.points[0], d.points[1]]);
      segs.push([d.points[2], { x: p2x, y: p2y }]);
      segs.push([d.points[0], d.points[2]]);
      segs.push([d.points[1], { x: p2x, y: p2y }]);
      break;
    }
  }
  return segs;
}

export class DrawingsPrimitive implements ISeriesPrimitiveBase<SeriesAttachedParameter<Time, SeriesType>> {
  private _chart: IChartApiBase | null = null;
  private _series: ISeriesApi<any> | null = null;
  private _requestUpdate: (() => void) | null = null;
  private _renderer: DrawingsPaneRenderer = new DrawingsPaneRenderer();
  private _paneView: DrawingsPaneView = new DrawingsPaneView(this._renderer);
  private _drawings: Drawing[] = [];
  private _preview: Drawing | null = null;
  private _selectedId: string | null = null;
  private _hoveredId: string | null = null;

  attached(param: SeriesAttachedParameter<Time, SeriesType>): void {
    this._chart = param.chart;
    this._series = param.series;
    this._requestUpdate = param.requestUpdate;
    this._updateRenderer();
  }

  detached(): void {
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
  }

  paneViews(): readonly ISeriesPrimitivePaneView[] {
    return [this._paneView];
  }

  updateAllViews(): void {
    this._updateRenderer();
  }

  hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    const allPixels = this._drawings
      .map(d => ({ drawing: d, pixels: this._toPixelDrawingOrNull(d) }))
      .filter((r): r is { drawing: Drawing; pixels: PixelDrawing } => r.pixels !== null);

    let bestHandle: { id: string; index: number; dist: number } | null = null;
    let bestBody: { id: string; dist: number } | null = null;

    for (const { drawing, pixels } of allPixels) {
      const handlePositions = getHandlePositions(pixels);
      for (let i = 0; i < handlePositions.length; i++) {
        const pos = handlePositions[i];
        const d = Math.hypot(x - pos.x, y - pos.y);
        if (d < HIT_RADIUS && (!bestHandle || d < bestHandle.dist)) {
          bestHandle = { id: drawing.id, index: i, dist: d };
        }
      }

      const segs = getDrawingSegments(pixels);
      for (const [a, b] of segs) {
        const d = distToSegment(x, y, a.x, a.y, b.x, b.y);
        if (d < BODY_HIT_THRESHOLD && (!bestBody || d < bestBody.dist)) {
          bestBody = { id: drawing.id, dist: d };
        }
      }
    }

    if (bestHandle) {
      return { externalId: 'h:' + bestHandle.id + ':' + bestHandle.index, cursorStyle: 'pointer', zOrder: 'top' };
    }
    if (bestBody) {
      return { externalId: 'b:' + bestBody.id, cursorStyle: 'pointer', zOrder: 'top' };
    }
    return null;
  }

  setDrawings(drawings: Drawing[]) {
    this._drawings = drawings;
    this._updateRenderer();
    this._requestUpdate?.();
  }

  setPreview(preview: Drawing | null) {
    this._preview = preview;
    this._updateRenderer();
    this._requestUpdate?.();
  }

  setSelectedId(id: string | null) {
    this._selectedId = id;
    this._renderer.setSelectedId(id);
    this._requestUpdate?.();
  }

  setHoveredId(id: string | null) {
    this._hoveredId = id;
    this._renderer.setHoveredId(id);
    this._requestUpdate?.();
  }

  setCandles(candles: CandleData[]) {
    this._renderer.setCandles(candles);
    this._requestUpdate?.();
  }

  get chart() { return this._chart; }
  get series() { return this._series; }

  pointToPixel(time: number, price: number): PixelPoint | null {
    if (!this._chart || !this._series) return null;
    const x = this._chart.timeScale().timeToCoordinate(time as any);
    const y = this._series.priceToCoordinate(price);
    if (x === null || y === null) return null;
    return { x, y };
  }

  private _updateRenderer() {
    if (!this._chart || !this._series) return;
    this._renderer.setDrawings(
      this._drawings
        .map(d => this._toPixelDrawingOrNull(d))
        .filter((d): d is PixelDrawing => d !== null)
    );
    this._renderer.setSelectedId(this._selectedId);
    this._renderer.setHoveredId(this._hoveredId);
    if (this._preview) {
      this._renderer.setPreview(this._toPixelDrawingOrNull(this._preview));
    } else {
      this._renderer.setPreview(null);
    }
  }

  private _toPixelDrawingOrNull(d: Drawing): PixelDrawing | null {
    if (!this._chart || !this._series) return null;
    const points: PixelPoint[] = [];
    for (const p of d.points) {
      const x = this._chart.timeScale().timeToCoordinate(p.time as any);
      const y = this._series.priceToCoordinate(p.price);
      if (x === null || y === null) return null;
      points.push({ x, y });
    }
    return {
      id: d.id,
      tool: d.tool,
      points,
      color: d.color,
      lineWidth: d.lineWidth,
      opacity: d.opacity,
      fillOpacity: d.fillOpacity,
      logicalPoints: d.points,
    };
  }

  get drawings(): Drawing[] { return this._drawings; }
  get selectedId(): string | null { return this._selectedId; }
}
