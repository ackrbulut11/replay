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
import type { Drawing } from './types';
import { HIT_THRESHOLD } from './types';

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

export const RECT_HANDLE_LABELS = ['tl', 't', 'tr', 'r', 'br', 'b', 'bl', 'l'];

function getHandlePositions(d: PixelDrawing): PixelPoint[] {
  if (d.tool === 'rectangle') return getRectHandlePositions(d);
  return d.points;
}

class DrawingsPaneRenderer implements ISeriesPrimitivePaneRenderer {
  private _drawings: PixelDrawing[] = [];
  private _preview: PixelDrawing | null = null;
  private _selectedId: string | null = null;
  private _hoveredId: string | null = null;

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

  draw(target: CanvasRenderingTarget2D): void {
    target.useMediaCoordinateSpace(({ context: ctx }) => {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (const d of this._drawings) {
        ctx.globalAlpha = d.opacity;
        const showHandles = d.id === this._selectedId || d.id === this._hoveredId;
        this._render(ctx, d, false, showHandles);
        ctx.globalAlpha = 1;
      }

      if (this._preview) {
        ctx.setLineDash([6, 3]);
        ctx.globalAlpha = this._preview.opacity;
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
    case 'rectangle': {
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
    };
  }

  get drawings(): Drawing[] { return this._drawings; }
  get selectedId(): string | null { return this._selectedId; }
}
