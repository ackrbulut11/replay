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
} from 'lucide-react';
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
  { tool: 'longPosition', icon: <ArrowUpRight className="w-4 h-4 text-emerald-400" />, label: 'Long Pozisyon (Alış)' },
  { tool: 'shortPosition', icon: <ArrowDownRight className="w-4 h-4 text-rose-400" />, label: 'Short Pozisyon (Satış)' },
  { tool: 'trendLine', icon: <TrendingUp className="w-4 h-4" />, label: 'Trend Çizgisi' },
  { tool: 'horizontalRay', icon: <Minus className="w-4 h-4" />, label: 'Yatay Işın' },
  { tool: 'rectangle', icon: <Square className="w-4 h-4" />, label: 'Dikdörtgen' },
  { tool: 'parallelChannel', icon: <ParallelChannelIcon />, label: 'Paralel Kanal' },
];

export default function DrawingToolbar({
  activeTool,
  snapEnabled,
  hasDrawings,
  onChangeTool,
  onToggleSnap,
  onClearAll,
}: DrawingToolbarProps) {
  return (
    <div className="flex items-center gap-1">
      <div className="flex items-center gap-0.5 bg-[#0d1321]/90 border border-slate-800 rounded-lg p-0.5">
        {tools.map(({ tool, icon, label }) => (
          <button
            key={tool}
            onClick={() => onChangeTool(tool)}
            title={label}
            className={`p-1.5 rounded-md transition-colors ${
              activeTool === tool
                ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
            }`}
          >
            {icon}
          </button>
        ))}

        <div className="w-px h-5 bg-slate-700 mx-0.5" />

        <button
          onClick={onToggleSnap}
          title={snapEnabled ? 'Snap to bar: ON' : 'Snap to bar: OFF'}
          className={`p-1.5 rounded-md transition-colors border ${
            snapEnabled
              ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30'
              : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 border-transparent'
          }`}
        >
          <Magnet className="w-4 h-4" />
        </button>

        {hasDrawings && (
          <>
            <div className="w-px h-5 bg-slate-700 mx-0.5" />
            <button
              onClick={onClearAll}
              title="Clear all drawings"
              className="p-1.5 rounded-md text-red-400 hover:text-red-300 hover:bg-red-950/40 transition-colors border border-transparent"
            >
              <Eraser className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
