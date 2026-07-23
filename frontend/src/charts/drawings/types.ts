export type DrawingTool = 'pointer' | 'trendLine' | 'horizontalRay' | 'rectangle' | 'parallelChannel';

export interface DrawingPoint {
  time: number;
  price: number;
}

export interface Drawing {
  id: string;
  tool: DrawingTool;
  points: DrawingPoint[];
  color: string;
  lineWidth: number;
  opacity: number;
}

export interface DrawingEditOptions {
  color: string;
  lineWidth: number;
  opacity: number;
}

export const DRAWING_COLORS = [
  '#ffffff', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#a855f7',
];


export const DEFAULT_DRAWING_COLOR = DRAWING_COLORS[0];
export const DEFAULT_LINE_WIDTH = 2;
export const DEFAULT_OPACITY = 1;

export const HIT_THRESHOLD = 8;

export const TOOL_CONFIG: Record<DrawingTool, { label: string; pointsNeeded: number }> = {
  pointer: { label: 'Pointer', pointsNeeded: 0 },
  trendLine: { label: 'Trend Line', pointsNeeded: 2 },
  horizontalRay: { label: 'Horizontal Ray', pointsNeeded: 1 },
  rectangle: { label: 'Rectangle', pointsNeeded: 2 },
  parallelChannel: { label: 'Parallel Channel', pointsNeeded: 3 },
};

let _nextId = 1;
export function generateDrawingId(): string {
  return `drawing_${_nextId++}`;
}
