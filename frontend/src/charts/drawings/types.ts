export type DrawingTool =
  | 'pointer' | 'ruler' | 'trendLine' | 'horizontalRay' | 'rectangle' | 'parallelChannel'
  | 'longPosition' | 'shortPosition'
  | 'brush' | 'brushTemp'
  | 'fibRetracement' | 'fibExtension';

export type DrawingLineStyle = 'solid' | 'dashed' | 'dotted';

export interface DrawingPoint {
  time: number;
  price: number;
}

/**
 * Tek bir Fibonacci seviyesi.
 *
 * `value` oranın kendisidir (0.618 gibi), yüzde değil — çizim sırasında
 * fiyat doğrudan bu oranla hesaplanır, gösterimde 100 ile çarpılır.
 */
export interface FibLevel {
  value: number;
  color: string;
  enabled: boolean;
}

export interface Drawing {
  id: string;
  tool: DrawingTool;
  points: DrawingPoint[];
  color: string;
  lineWidth: number;
  opacity: number;
  lineStyle?: DrawingLineStyle;
  fillOpacity?: number;
  /** Yalnızca Fibonacci araçlarında; her çizim kendi seviye setini taşır. */
  fibLevels?: FibLevel[];
}

export interface DrawingEditOptions {
  color: string;
  lineWidth: number;
  opacity: number;
  lineStyle?: DrawingLineStyle;
  fillOpacity?: number;
  fibLevels?: FibLevel[];
}

export const DRAWING_COLORS = [
  '#ffffff', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#a855f7',
];


export const DEFAULT_DRAWING_COLOR = DRAWING_COLORS[0];
export const DEFAULT_LINE_WIDTH = 2;
export const DEFAULT_OPACITY = 1;
export const DEFAULT_LINE_STYLE: DrawingLineStyle = 'solid';

/** Kalemin varsayılan rengi — diğer araçlardan farklı olarak sarı. */
export const DEFAULT_BRUSH_COLOR = '#facc15';

/** Geçici kalemin ekranda kalma süresi (ms). */
export const TEMP_DRAWING_MS = 3000;

/** Fibonacci seviyelerinin varsayılan çizgi rengi. */
export const DEFAULT_FIB_LEVEL_COLOR = '#9ca3af';

/** Fibonacci çiziminde iki/üç ucu birleştiren yardımcı çizginin rengi. */
export const FIB_ANCHOR_COLOR = '#64748b';

function fibLevels(values: number[]): FibLevel[] {
  return values.map((value) => ({ value, color: DEFAULT_FIB_LEVEL_COLOR, enabled: true }));
}

export const DEFAULT_FIB_RETRACEMENT_LEVELS: FibLevel[] = fibLevels([
  0, 0.236, 0.382, 0.5, 0.618, 0.786, 1,
]);

export const DEFAULT_FIB_EXTENSION_LEVELS: FibLevel[] = fibLevels([
  1, 1.272, 1.414, 1.618, 2, 2.272, 2.618, 3.618,
]);

/** Noktalı stilde 1px noktalar görünmediği için izin verilen en küçük kalınlık. */
export const MIN_DOTTED_LINE_WIDTH = 2;

export const LINE_STYLES: { value: DrawingLineStyle; label: string }[] = [
  { value: 'solid', label: 'Düz' },
  { value: 'dashed', label: 'Kesikli' },
  { value: 'dotted', label: 'Noktalı' },
];

/** Yalnızca çizgi tabanlı araçlarda çizgi tipi seçilebilir (dikdörtgen dolgusu, cetvel vb. hariç). */
export const LINE_STYLE_CAPABLE_TOOLS: ReadonlySet<DrawingTool> = new Set([
  'trendLine', 'horizontalRay', 'rectangle', 'parallelChannel',
  'brush', 'brushTemp', 'fibRetracement', 'fibExtension',
]);

/**
 * Serbest el araçları: tıklamayla değil, fare basılı tutulup sürüklenerek
 * çizilir ve nokta sayıları önceden bilinmez (bkz. TOOL_CONFIG.pointsNeeded).
 */
export const FREEHAND_TOOLS: ReadonlySet<DrawingTool> = new Set(['brush', 'brushTemp']);

/**
 * Kaydedilmeyen araçlar: cetvel bir sonraki tıklamada, geçici kalem ise
 * TEMP_DRAWING_MS sonunda kendiliğinden silinir. Sunucuya yazılmaları
 * bir sonraki oturumu anlamsız çizimlerle karşılardı.
 */
export const TRANSIENT_TOOLS: ReadonlySet<DrawingTool> = new Set(['ruler', 'brushTemp']);

/** Kendi seviye listesini taşıyan araçlar. */
export const FIB_TOOLS: ReadonlySet<DrawingTool> = new Set(['fibRetracement', 'fibExtension']);

export const HIT_THRESHOLD = 8;

export const TOOL_CONFIG: Record<DrawingTool, { label: string; pointsNeeded: number }> = {
  pointer: { label: 'Pointer', pointsNeeded: 0 },
  ruler: { label: 'Cetvel', pointsNeeded: 2 },
  trendLine: { label: 'Trend Line', pointsNeeded: 2 },
  horizontalRay: { label: 'Horizontal Ray', pointsNeeded: 1 },
  rectangle: { label: 'Rectangle', pointsNeeded: 2 },
  parallelChannel: { label: 'Parallel Channel', pointsNeeded: 3 },
  longPosition: { label: 'Long Pozisyon', pointsNeeded: 2 },
  shortPosition: { label: 'Short Pozisyon', pointsNeeded: 2 },
  // Serbest el: nokta sayısı sürüklemenin uzunluğuna bağlı, tıklama sayacı kullanılmaz.
  brush: { label: 'Kalem', pointsNeeded: 0 },
  brushTemp: { label: 'Geçici Kalem', pointsNeeded: 0 },
  fibRetracement: { label: 'Fibonacci Düzeltme', pointsNeeded: 2 },
  // Uzantı trend tabanlıdır: A→B hareketi C noktasından ileri taşınır.
  fibExtension: { label: 'Fibonacci Uzantı', pointsNeeded: 3 },
};

let _nextId = 1;
export function generateDrawingId(): string {
  return `drawing_${_nextId++}`;
}
