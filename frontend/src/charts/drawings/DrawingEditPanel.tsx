import { Trash2 } from 'lucide-react';
import type { DrawingEditOptions } from './types';

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

  return (
    <div className="flex items-center gap-3 bg-[#0d1321]/95 border border-slate-700 rounded-lg px-3 py-1.5 text-xs shadow-lg backdrop-blur-md">
      <span className="text-slate-400 font-medium whitespace-nowrap">{title}</span>

      {tool === 'longPosition' || tool === 'shortPosition' ? (
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            Kar Hedefi: Yeşil
          </span>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">
            Stop Loss: Kırmızı
          </span>
        </div>
      ) : isRuler ? (
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
            Kar: Mavi
          </span>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-red-950/40 text-red-400 border border-red-700/40">
            Zarar: Koyu Kırmızı (Şeffaf)
          </span>
        </div>
      ) : (
        <>
          <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
            <span>Renk</span>
            <input
              type="color"
              value={options.color}
              onChange={(e) => onChange({ ...options, color: e.target.value })}
              className="w-6 h-6 rounded cursor-pointer border border-slate-600 bg-transparent"
            />
          </label>

          <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
            <span>Kalınlık</span>
            <select
              value={options.lineWidth}
              onChange={(e) => onChange({ ...options, lineWidth: Number(e.target.value) })}
              className="bg-[#070b13] border border-slate-700 rounded px-1.5 py-1 text-slate-100 cursor-pointer"
            >
              {[1, 2, 3, 4, 5].map((w) => (
                <option key={w} value={w}>{w}px</option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
            <span>Opaklık</span>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.1}
              value={options.opacity}
              onChange={(e) => onChange({ ...options, opacity: Number(e.target.value) })}
              className="w-16 accent-indigo-500 cursor-pointer"
            />
            <span className="text-slate-400 w-6 font-mono">{Math.round(options.opacity * 100)}%</span>
          </label>

          {isRectangle && (
            <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
              <span>Dolgu</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={options.fillOpacity ?? 0.16}
                onChange={(e) => onChange({ ...options, fillOpacity: Number(e.target.value) })}
                className="w-16 accent-emerald-500 cursor-pointer"
              />
              <span className="text-slate-400 w-6 font-mono">{Math.round((options.fillOpacity ?? 0.16) * 100)}%</span>
            </label>
          )}
        </>
      )}

      {onDelete && (
        <button
          onClick={onDelete}
          title="Delete drawing"
          className="p-1.5 rounded-md text-red-400 hover:text-red-300 hover:bg-red-950/40 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
