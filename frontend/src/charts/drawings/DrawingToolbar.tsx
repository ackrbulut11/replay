import React from 'react';
import {
  MousePointer2,
  TrendingUp,
  Minus,
  Square,
  Ruler,
  Magnet,
  Eraser,
  ArrowUpRight,
  ArrowDownRight,
  Pencil,
  Highlighter,
} from 'lucide-react';
import { TEMP_DRAWING_MS } from './types';
import type { DrawingTool } from './types';

function ParallelChannelIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="3" y1="8" x2="19" y2="4" />
      <line x1="5" y1="20" x2="21" y2="16" />
      <line x1="4" y1="14" x2="20" y2="10" strokeDasharray="2.2 2.2" strokeWidth="1.25" />
    </svg>
  );
}

/** Üst üste binen yatay çizgiler — Fibonacci araçlarının ortak simgesi. */
function FibIcon({ extension = false }: { extension?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    >
      <line x1="3" y1="5" x2="21" y2="5" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="3" y1="14" x2="21" y2="14" />
      <line x1="3" y1="19" x2="21" y2="19" strokeDasharray={extension ? '2.5 2.5' : undefined} />
      {/* Uzantıda ölçülen hareketi temsil eden köşegen; düzeltmede yok. */}
      {extension && <line x1="5" y1="19" x2="19" y2="5" strokeWidth="1.1" strokeDasharray="2 2" />}
    </svg>
  );
}

interface DrawingToolbarProps {
  activeTool: DrawingTool;
  snapEnabled: boolean;
  hasDrawings: boolean;
  onChangeTool: (tool: DrawingTool) => void;
  onToggleSnap: () => void;
  onClearAll: () => void;
}

const tools: { tool: DrawingTool; icon: React.ReactNode; label: string }[] = [
  { tool: 'pointer', icon: <MousePointer2 className="w-4 h-4" />, label: 'İşaretçi (Pointer)' },
  { tool: 'ruler', icon: <Ruler className="w-4 h-4" />, label: 'Cetvel (Tarih ve Fiyat Aralığı)' },
  { tool: 'longPosition', icon: <ArrowUpRight className="w-4 h-4 text-profit-400" />, label: 'Long Pozisyon (Alış)' },
  { tool: 'shortPosition', icon: <ArrowDownRight className="w-4 h-4 text-loss-400" />, label: 'Short Pozisyon (Satış)' },
  { tool: 'trendLine', icon: <TrendingUp className="w-4 h-4" />, label: 'Trend Çizgisi' },
  { tool: 'horizontalRay', icon: <Minus className="w-4 h-4" />, label: 'Yatay Işın' },
  { tool: 'rectangle', icon: <Square className="w-4 h-4" />, label: 'Dikdörtgen' },
  { tool: 'parallelChannel', icon: <ParallelChannelIcon />, label: 'Paralel Kanal' },
  { tool: 'brush', icon: <Pencil className="w-4 h-4" />, label: 'Kalem (Serbest Çizim — kalıcı)' },
  {
    tool: 'brushTemp',
    icon: <Highlighter className="w-4 h-4" />,
    label: `Geçici Kalem (${Math.round(TEMP_DRAWING_MS / 1000)} sn sonra kendiliğinden silinir)`,
  },
  { tool: 'fibRetracement', icon: <FibIcon />, label: 'Fibonacci Düzeltme (Retracement)' },
  { tool: 'fibExtension', icon: <FibIcon extension />, label: 'Fibonacci Uzantı (Extension)' },
];

export default function DrawingToolbar({
  activeTool,
  snapEnabled,
  hasDrawings,
  onChangeTool,
  onToggleSnap,
  onClearAll,
}: DrawingToolbarProps) {
  // Dar ekranda şerit sığmayabilir (320px'lik cihazlarda silgi düğmesiyle
  // birlikte taşıyor): kesilmek yerine yatay kaydırılır. Dokunmatikte düğmeler
  // bir tık büyür — yan yana durdukları için görünmez 44px'lik hedef katmanı
  // komşunun dokunuşunu çalardı, çözüm gerçek boyut.
  return (
    <div className="flex max-w-full items-center gap-1 overflow-x-auto custom-scrollbar">
      <div className="flex shrink-0 items-center gap-0.5 bg-canvas border border-line rounded-lg p-0.5 shadow-2xl">
        {tools.map(({ tool, icon, label }) => (
          <button
            key={tool}
            onClick={() => onChangeTool(tool)}
            title={label}
            className={`p-1.5 touch:p-2 rounded-md transition-colors ${
              activeTool === tool
                ? 'bg-accent-500/15 text-accent-400 border border-accent-500/30'
                : 'text-content-muted hover:text-content-strong hover:bg-white/[0.04] border border-transparent'
            }`}
          >
            {icon}
          </button>
        ))}

        <div className="w-px h-5 bg-white/[0.06] mx-0.5" />

        <button
          onClick={onToggleSnap}
          title={snapEnabled ? 'Snap to bar: ON' : 'Snap to bar: OFF'}
          className={`p-1.5 rounded-md transition-colors border ${
            snapEnabled
              ? 'bg-accent-500/15 text-accent-400 border-accent-500/30'
              : 'text-content-faint hover:text-content hover:bg-white/[0.04] border-transparent'
          }`}
        >
          <Magnet className="w-4 h-4" />
        </button>

        {hasDrawings && (
          <>
            <div className="w-px h-5 bg-white/[0.06] mx-0.5" />
            <button
              onClick={onClearAll}
              title="Clear all drawings"
              className="p-1.5 rounded-md text-loss-400 hover:text-loss-300 hover:bg-loss-500/10 transition-colors border border-transparent"
            >
              <Eraser className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
