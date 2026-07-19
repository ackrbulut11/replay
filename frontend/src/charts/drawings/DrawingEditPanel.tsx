import { Trash2 } from 'lucide-react';
import type { DrawingEditOptions } from './types';

interface DrawingEditPanelProps {
  options: DrawingEditOptions;
  onChange: (opts: DrawingEditOptions) => void;
  onDelete: () => void;
}

export default function DrawingEditPanel({ options, onChange, onDelete }: DrawingEditPanelProps) {
  return (
    <div className="flex items-center gap-3 bg-[#0d1321]/95 border border-slate-700 rounded-lg px-3 py-1.5 text-xs">
      <span className="text-slate-400 font-medium whitespace-nowrap">Edit:</span>

      <label className="flex items-center gap-1.5 text-slate-300">
        <span>Color</span>
        <input
          type="color"
          value={options.color}
          onChange={(e) => onChange({ ...options, color: e.target.value })}
          className="w-6 h-6 rounded cursor-pointer border border-slate-600 bg-transparent"
        />
      </label>

      <label className="flex items-center gap-1.5 text-slate-300">
        <span>Width</span>
        <select
          value={options.lineWidth}
          onChange={(e) => onChange({ ...options, lineWidth: Number(e.target.value) })}
          className="bg-[#070b13] border border-slate-700 rounded px-1.5 py-1 text-slate-100"
        >
          {[1, 2, 3, 4, 5].map((w) => (
            <option key={w} value={w}>{w}px</option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-1.5 text-slate-300">
        <span>Opacity</span>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.1}
          value={options.opacity}
          onChange={(e) => onChange({ ...options, opacity: Number(e.target.value) })}
          className="w-16 accent-indigo-500"
        />
        <span className="text-slate-400 w-6">{Math.round(options.opacity * 100)}%</span>
      </label>

      <button
        onClick={onDelete}
        title="Delete drawing"
        className="p-1.5 rounded-md text-red-400 hover:text-red-300 hover:bg-red-950/40 transition-colors"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}
