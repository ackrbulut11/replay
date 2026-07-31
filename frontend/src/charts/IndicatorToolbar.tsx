import { SlidersHorizontal, Settings2 } from 'lucide-react';
import type { IndicatorSettingsMap } from '../store/chartSettingsStore';

export interface IndicatorsState {
  ema20: boolean;
  ema50: boolean;
  ema100: boolean;
  ema200: boolean;
  rsi: boolean;
  macd: boolean;
  bb: boolean;
}

export const DEFAULT_INDICATORS_STATE: IndicatorsState = {
  ema20: false,
  ema50: false,
  ema100: false,
  ema200: false,
  rsi: false,
  macd: false,
  bb: false,
};

interface IndicatorToolbarProps {
  state: IndicatorsState;
  onToggle: (key: keyof IndicatorsState) => void;
  onOpenSettings?: (key: keyof IndicatorSettingsMap) => void;
}

export default function IndicatorToolbar({ state, onToggle, onOpenSettings }: IndicatorToolbarProps) {
  const indicatorsList: { key: keyof IndicatorsState; label: string; badgeColor: string }[] = [
    { key: 'ema20', label: 'EMA 20', badgeColor: 'border-amber-500/60 text-amber-400 bg-amber-500/10' },
    { key: 'ema50', label: 'EMA 50', badgeColor: 'border-cyan-500/60 text-cyan-400 bg-cyan-500/10' },
    { key: 'ema100', label: 'EMA 100', badgeColor: 'border-purple-500/60 text-purple-400 bg-purple-500/10' },
    { key: 'ema200', label: 'EMA 200', badgeColor: 'border-pink-500/60 text-pink-400 bg-pink-500/10' },
    { key: 'rsi', label: 'RSI', badgeColor: 'border-slate-300/60 text-slate-200 bg-slate-500/10' },
    { key: 'macd', label: 'MACD', badgeColor: 'border-emerald-500/60 text-emerald-400 bg-emerald-500/10' },
    { key: 'bb', label: 'Bollinger', badgeColor: 'border-yellow-500/60 text-yellow-400 bg-yellow-500/10' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 bg-[#0a0b0e] border border-white/[0.08] rounded-xl p-2 backdrop-blur-md shadow-2xl">
      <div className="flex items-center gap-1.5 px-2 text-zinc-400 border-r border-white/[0.06] pr-3">
        <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
        <span className="font-mono text-[10px] tracking-[0.18em] text-zinc-400 uppercase font-semibold">Göstergeler</span>
      </div>

      <div className="flex flex-wrap gap-1.5 items-center">
        {indicatorsList.map(({ key, label, badgeColor }) => {
          const isActive = state[key];
          return (
            <div
              key={key}
              className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-all duration-150 flex items-center gap-1.5 select-none ${
                isActive
                  ? `${badgeColor} shadow-xs font-semibold`
                  : 'bg-white/[0.02] border-white/[0.06] text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04]'
              }`}
            >
              <button
                type="button"
                onClick={() => onToggle(key)}
                className="flex items-center gap-1.5 cursor-pointer"
              >
                <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-current animate-pulse' : 'bg-zinc-600'}`} />
                <span>{label}</span>
              </button>

              {isActive && onOpenSettings && (
                <button
                  type="button"
                  title={`${label} Ayarları`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenSettings(key as keyof IndicatorSettingsMap);
                  }}
                  className="p-0.5 rounded hover:bg-white/[0.1] text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer ml-0.5"
                >
                  <Settings2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

