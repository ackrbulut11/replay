import { SlidersHorizontal } from 'lucide-react';

export interface IndicatorsState {
  ema20: boolean;
  ema50: boolean;
  ema100: boolean;
  ema200: boolean;
  rsi: boolean;
  macd: boolean;
}

export const DEFAULT_INDICATORS_STATE: IndicatorsState = {
  ema20: false,
  ema50: false,
  ema100: false,
  ema200: false,
  rsi: false,
  macd: false,
};

interface IndicatorToolbarProps {
  state: IndicatorsState;
  onToggle: (key: keyof IndicatorsState) => void;
}

export default function IndicatorToolbar({ state, onToggle }: IndicatorToolbarProps) {
  const indicatorsList: { key: keyof IndicatorsState; label: string; badgeColor: string }[] = [
    { key: 'ema20', label: 'EMA 20', badgeColor: 'border-amber-500/60 text-amber-400 bg-amber-500/10' },
    { key: 'ema50', label: 'EMA 50', badgeColor: 'border-cyan-500/60 text-cyan-400 bg-cyan-500/10' },
    { key: 'ema100', label: 'EMA 100', badgeColor: 'border-purple-500/60 text-purple-400 bg-purple-500/10' },
    { key: 'ema200', label: 'EMA 200', badgeColor: 'border-pink-500/60 text-pink-400 bg-pink-500/10' },
    { key: 'rsi', label: 'RSI (14)', badgeColor: 'border-slate-300/60 text-slate-200 bg-slate-500/10' },
    { key: 'macd', label: 'MACD (12,26,9)', badgeColor: 'border-emerald-500/60 text-emerald-400 bg-emerald-500/10' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 bg-[#0d1321]/90 border border-slate-800/80 rounded-xl p-2 backdrop-blur-md shadow-lg">
      <div className="flex items-center gap-1.5 px-2 text-slate-400 border-r border-slate-800 pr-3">
        <SlidersHorizontal className="w-4 h-4 text-indigo-400" />
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">Göstergeler:</span>
      </div>

      <div className="flex flex-wrap gap-1.5 items-center">
        {indicatorsList.map(({ key, label, badgeColor }) => {
          const isActive = state[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => onToggle(key)}
              className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-all duration-150 flex items-center gap-1.5 select-none ${
                isActive
                  ? `${badgeColor} shadow-sm font-semibold`
                  : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-current animate-pulse' : 'bg-slate-600'}`} />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
