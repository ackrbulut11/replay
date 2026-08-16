import { Trash2 } from 'lucide-react';
import { LINE_STYLES, LINE_STYLE_CAPABLE_TOOLS, MIN_DOTTED_LINE_WIDTH } from './types';
import type { DrawingEditOptions, DrawingTool } from './types';

interface DrawingEditPanelProps {
  options: DrawingEditOptions;
  onChange: (opts: DrawingEditOptions) => void;
  onDelete?: () => void;
  title?: string;
  isRuler?: boolean;
  tool?: string;
}

export default function DrawingEditPanel({ options, onChange, onDelete, title = 'Edit:', isRuler = false, tool }: DrawingEditPanelProps) {
  const isRectangle = tool === 'rectangle';
  const supportsLineStyle = tool != null && LINE_STYLE_CAPABLE_TOOLS.has(tool as DrawingTool);

  // Noktalı stilde 1px noktalar gözle görülmeyecek kadar küçük kalıyor;
  // bu yüzden noktalı seçiliyken kalınlık en az 2px olur.
  const isDotted = options.lineStyle === 'dotted';
  const widthOptions = isDotted ? [2, 3, 4, 5] : [1, 2, 3, 4, 5];

  /** Çizgi tipi değişince kalınlığı o tipin izin verdiği aralığa çeker. */
  const handleLineStyleChange = (nextStyle: DrawingEditOptions['lineStyle']) => {
    const nextWidth = nextStyle === 'dotted'
      ? Math.max(MIN_DOTTED_LINE_WIDTH, options.lineWidth)
      : options.lineWidth;
    onChange({ ...options, lineStyle: nextStyle, lineWidth: nextWidth });
  };

  return (
    <div className="flex items-center gap-3 bg-surface-raised border border-line-strong rounded-lg px-3 py-1.5 text-xs shadow-lg backdrop-blur-md">
      <span className="text-content-muted font-medium whitespace-nowrap">{title}</span>

      {tool === 'longPosition' || tool === 'shortPosition' ? (
        <div className="flex items-center gap-2">
          <span className="text-2xs font-medium px-2 py-0.5 rounded bg-profit-500/20 text-profit-400 border border-profit-500/30">
            Kar Hedefi: Yeşil
          </span>
          <span className="text-2xs font-medium px-2 py-0.5 rounded bg-loss-500/20 text-loss-400 border border-loss-500/30">
            Stop Loss: Kırmızı
          </span>
        </div>
      ) : isRuler ? (
        <div className="flex items-center gap-2">
          <span className="text-2xs font-medium px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
            Kar: Mavi
          </span>
          <span className="text-2xs font-medium px-2 py-0.5 rounded bg-loss-950/40 text-loss-400 border border-loss-700/40">
            Zarar: Koyu Kırmızı (Şeffaf)
          </span>
        </div>
      ) : (
        <>
          <label className="flex items-center gap-1.5 text-content cursor-pointer">
            <span>Renk</span>
            <input
              type="color"
              value={options.color}
              onChange={(e) => onChange({ ...options, color: e.target.value })}
              className="w-6 h-6 rounded cursor-pointer border border-line-strong bg-transparent"
            />
          </label>

          <label className="flex items-center gap-1.5 text-content cursor-pointer">
            <span>Kalınlık</span>
            <select
              value={options.lineWidth}
              onChange={(e) => onChange({ ...options, lineWidth: Number(e.target.value) })}
              className="bg-canvas border border-line-strong rounded px-1.5 py-1 text-content-strong cursor-pointer"
            >
              {widthOptions.map((w) => (
                <option key={w} value={w}>{w}px</option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5 text-content cursor-pointer">
            <span>Opaklık</span>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.1}
              value={options.opacity}
              onChange={(e) => onChange({ ...options, opacity: Number(e.target.value) })}
              className="w-16 accent-accent-500 cursor-pointer"
            />
            <span className="text-content-muted w-6 font-mono">{Math.round(options.opacity * 100)}%</span>
          </label>

          {supportsLineStyle && (
            <label className="flex items-center gap-1.5 text-content cursor-pointer">
              <span>Çizgi</span>
              <select
                value={options.lineStyle ?? 'solid'}
                onChange={(e) => handleLineStyleChange(e.target.value as DrawingEditOptions['lineStyle'])}
                className="bg-canvas border border-line-strong rounded px-1.5 py-1 text-content-strong cursor-pointer"
              >
                {LINE_STYLES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </label>
          )}

          {isRectangle && (
            <label className="flex items-center gap-1.5 text-content cursor-pointer">
              <span>Dolgu</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={options.fillOpacity ?? 0.16}
                onChange={(e) => onChange({ ...options, fillOpacity: Number(e.target.value) })}
                className="w-16 accent-accent-500 cursor-pointer"
              />
              <span className="text-content-muted w-6 font-mono">{Math.round((options.fillOpacity ?? 0.16) * 100)}%</span>
            </label>
          )}
        </>
      )}

      {onDelete && (
        <button
          onClick={onDelete}
          title="Delete drawing"
          className="p-1.5 rounded-md text-loss-400 hover:text-loss-300 hover:bg-loss-950/40 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
