import { X, Check, Palette } from 'lucide-react';
import { compareStore, useCompareStore } from '../store/compareStore';
import { useDialogFocus } from '../hooks/useDialogFocus';

interface CompareSettingsModalProps {
  isOpen: boolean;
  compareId: string | null;
  onClose: () => void;
}

const PRESET_COLORS = [
  '#f472b6', // Pink
  '#22d3ee', // Cyan
  '#a855f7', // Purple
  '#facc15', // Yellow
  '#fb923c', // Orange
  '#4ade80', // Green
  '#f59e0b', // Amber
  '#3b82f6', // Blue
  '#ef4444', // Red
  '#ffffff', // White
];

export default function CompareSettingsModal({
  isOpen,
  compareId,
  onClose,
}: CompareSettingsModalProps) {
  const compareState = useCompareStore();
  const item = compareState.items.find((i) => i.id === compareId);
  const dialogRef = useDialogFocus(Boolean(isOpen && compareId && item), onClose);

  if (!isOpen || !compareId) return null;
  if (!item) return null;

  const updateStyle = (style: Partial<{ color: string; lineWidth: number }>) => {
    compareStore.updateStyle(compareId, style);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fadeIn"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="compare-settings-title"
        tabIndex={-1}
        className="w-full max-w-sm bg-canvas border border-white/[0.1] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-scaleUp text-content-strong"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line bg-canvas">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-accent-400" />
            <h3 id="compare-settings-title" className="text-sm font-medium text-content-strong truncate">
              {item.symbol} Kıyaslama Ayarları
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Kıyaslama ayarlarını kapat"
            className="p-1 rounded-lg text-content-muted hover:text-content-strong hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          <div className="flex flex-col gap-1.5 py-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-content">Çizgi Rengi</span>
              <div className="flex items-center gap-2">
                <span
                  className="w-4 h-4 rounded-full border border-line-strong shadow-xs"
                  style={{ backgroundColor: item.color }}
                />
                <input
                  type="color"
                  aria-label="Çizgi rengi"
                  value={item.color}
                  onChange={(e) => updateStyle({ color: e.target.value })}
                  className="w-6 h-6 rounded cursor-pointer bg-transparent border-0 p-0"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-0.5">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => updateStyle({ color: c })}
                  style={{ backgroundColor: c }}
                  className={`w-5 h-5 rounded-md transition-transform hover:scale-110 flex items-center justify-center ${
                    item.color === c ? 'ring-2 ring-accent-400 scale-105' : 'opacity-80 hover:opacity-100'
                  }`}
                >
                  {item.color === c && <Check className="w-3 h-3 text-black drop-shadow-xs" />}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between py-1 text-xs text-content">
            <span>Çizgi Kalınlığı</span>
            <div className="flex items-center gap-1 bg-canvas p-1 rounded-lg border border-line">
              {[1, 2, 3, 4].map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => updateStyle({ lineWidth: w })}
                  className={`px-2 py-0.5 text-xs font-medium rounded transition-all ${
                    item.lineWidth === w
                      ? 'bg-accent-400 text-ink-950 shadow-sm'
                      : 'text-content-muted hover:text-content hover:bg-surface-hover'
                  }`}
                >
                  {w}px
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Controls */}
        <div className="flex items-center justify-end px-5 py-3 border-t border-line bg-canvas">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-ink-950 bg-ink-50 hover:bg-accent-300 rounded-lg transition-colors shadow-xs"
          >
            Tamam
          </button>
        </div>
      </div>
    </div>
  );
}
