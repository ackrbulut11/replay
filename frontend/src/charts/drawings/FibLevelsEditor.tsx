import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { DEFAULT_FIB_LEVEL_COLOR } from './types';
import type { FibLevel } from './types';

interface FibLevelsEditorProps {
  levels: FibLevel[];
  onChange: (levels: FibLevel[]) => void;
  onReset: () => void;
}

/** Oranı yüzde olarak gösterir (0.618 → "61,8%"). */
function formatRatio(value: number): string {
  const pct = (value * 100).toFixed(1).replace(/\.0$/, '');
  return `${pct.replace('.', ',')}%`;
}

/**
 * Fibonacci seviyelerinin düzenleyicisi: her satır bir oran, kendi rengi ve
 * açık/kapalı durumu. Seçili bir çizim varsa yalnızca o çizimi, yoksa aracın
 * varsayılanını değiştirir (bkz. CandleChart.updateSelectedOptions).
 */
export default function FibLevelsEditor({ levels, onChange, onReset }: FibLevelsEditorProps) {
  const updateAt = (index: number, patch: Partial<FibLevel>) => {
    onChange(levels.map((lvl, i) => (i === index ? { ...lvl, ...patch } : lvl)));
  };

  const removeAt = (index: number) => {
    onChange(levels.filter((_, i) => i !== index));
  };

  const addLevel = () => {
    const last = levels.length > 0 ? levels[levels.length - 1].value : 0;
    onChange([...levels, { value: Number((last + 0.5).toFixed(3)), color: DEFAULT_FIB_LEVEL_COLOR, enabled: true }]);
  };

  return (
    <div className="w-64 rounded-lg border border-line-strong bg-surface-raised p-2 text-xs shadow-lg backdrop-blur-md">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="font-medium text-content-muted">Seviyeler</span>
        <button
          onClick={onReset}
          title="Varsayılan seviyelere dön"
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-2xs text-content-faint transition-colors hover:bg-white/[0.04] hover:text-content-strong"
        >
          <RotateCcw className="h-3 w-3" />
          Sıfırla
        </button>
      </div>

      {/* Seviye sayısı sınırsız olabildiği için liste kendi içinde kayar. */}
      <div className="custom-scrollbar max-h-56 space-y-1 overflow-y-auto pr-0.5">
        {levels.map((level, index) => (
          <div key={index} className="flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-white/[0.03]">
            <input
              type="checkbox"
              checked={level.enabled}
              onChange={(e) => updateAt(index, { enabled: e.target.checked })}
              title={level.enabled ? 'Gizle' : 'Göster'}
              className="h-3 w-3 shrink-0 accent-accent-500 cursor-pointer"
            />
            <input
              type="number"
              step={0.001}
              value={level.value}
              onChange={(e) => updateAt(index, { value: Number(e.target.value) })}
              className="w-16 rounded border border-line-strong bg-canvas px-1 py-0.5 font-mono text-content-strong outline-none focus:border-accent-500"
            />
            <span className="w-12 shrink-0 font-mono text-2xs text-content-faint">
              {formatRatio(level.value)}
            </span>
            <input
              type="color"
              value={level.color}
              onChange={(e) => updateAt(index, { color: e.target.value })}
              title="Çizgi rengi"
              className="h-5 w-6 shrink-0 cursor-pointer rounded border border-line-strong bg-transparent"
            />
            <button
              onClick={() => removeAt(index)}
              title="Seviyeyi kaldır"
              className="shrink-0 rounded p-0.5 text-content-faint transition-colors hover:bg-loss-950/40 hover:text-loss-400"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={addLevel}
        className="mt-1.5 flex w-full items-center justify-center gap-1 rounded border border-line-strong py-1 text-2xs text-content-muted transition-colors hover:bg-white/[0.04] hover:text-content-strong"
      >
        <Plus className="h-3 w-3" />
        Seviye ekle
      </button>
    </div>
  );
}
