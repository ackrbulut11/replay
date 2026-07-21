import { useReplayStore } from '../store/replayStore';
import {
  Play,
  Pause,
  SkipForward,
  Scissors,
  RotateCcw,
  X,
  FastForward,
  Layers,
} from 'lucide-react';

interface ReplayControlsProps {
  totalBars: number;
  onStepForward: () => void;
  onTogglePlay: () => void;
  onStartSelection: () => void;
  onExitReplay: () => void;
  onResetToCutoff: () => void;
}

export default function ReplayControls({
  totalBars,
  onStepForward,
  onTogglePlay,
  onStartSelection,
  onExitReplay,
  onResetToCutoff,
}: ReplayControlsProps) {
  const [replayState, setReplayState] = useReplayStore();
  const { isSelectingCutoff, currentIndex, isPlaying, speedMs } = replayState;

  const currentBar = currentIndex !== null ? currentIndex + 1 : totalBars;
  const isAtEnd = currentIndex !== null && currentIndex >= totalBars - 1;

  const handleSpeedChange = (newSpeedMs: number) => {
    setReplayState({ speedMs: newSpeedMs });
  };

  const SPEED_OPTIONS = [
    { label: '0.2s', value: 200, key: '1' },
    { label: '0.5s', value: 500, key: '2' },
    { label: '1s', value: 1000, key: '3' },
    { label: '2s', value: 2000, key: '4' },
  ];

  return (
    <div className="flex items-center gap-2 bg-[#0d1321]/95 border border-indigo-500/30 rounded-xl px-3 py-1.5 shadow-2xl backdrop-blur-md text-slate-200 animate-fadeIn">
      {/* Replay Indicator Tag */}
      <div className="flex items-center gap-1.5 border-r border-slate-800 pr-2.5">
        <span className="relative flex h-2 w-2">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isPlaying ? 'bg-emerald-400' : 'bg-amber-400'} opacity-75`}></span>
          <span className={`relative inline-flex rounded-full h-2 w-2 ${isPlaying ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
        </span>
        <span className="text-xs font-bold text-indigo-300 font-sans tracking-wide uppercase select-none">
          REPLAY ENGINE
        </span>
      </div>

      {/* Select Cutoff Candle Button */}
      <button
        onClick={onStartSelection}
        title="Grafikte son görünecek mumu seçmek için muma tıklayın (Kısayol: C)"
        className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all select-none ${
          isSelectingCutoff
            ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm animate-pulse'
            : 'bg-[#070b13]/80 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-slate-100'
        }`}
      >
        <Scissors className="w-3.5 h-3.5 text-amber-400" />
        <span>{isSelectingCutoff ? 'Muma Tıklayın...' : 'Mum Kes'}</span>
        <kbd className="text-[9px] bg-slate-800/90 px-1 py-0.2 rounded font-mono text-amber-300/80 border border-slate-700">C</kbd>
      </button>

      <div className="w-px h-4 bg-slate-800" />

      {/* Oynat / Durdur (Play / Pause) */}
      <button
        onClick={onTogglePlay}
        disabled={isAtEnd}
        title={isPlaying ? 'Durdur (Kısayol: P)' : 'Oynat / Başlat (Kısayol: P)'}
        className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg border transition-all select-none ${
          isPlaying
            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30'
            : 'bg-indigo-600 text-white border-indigo-500 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed'
        }`}
      >
        {isPlaying ? (
          <>
            <Pause className="w-3.5 h-3.5 fill-current" />
            <span>Durdur</span>
            <kbd className="text-[9px] bg-emerald-950/60 px-1 py-0.2 rounded font-mono text-emerald-300 opacity-90 border border-emerald-800/50">P</kbd>
          </>
        ) : (
          <>
            <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
            <span>Oynat</span>
            <kbd className="text-[9px] bg-indigo-950/80 px-1 py-0.2 rounded font-mono text-indigo-200 opacity-90 border border-indigo-400/40">P</kbd>
          </>
        )}
      </button>

      {/* Tek Tek Oynat (Step Forward) */}
      <button
        onClick={onStepForward}
        disabled={isPlaying || isAtEnd}
        title="Tek tek 1 mum ilerlet (Kısayol: Space)"
        className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-[#070b13]/80 border border-slate-800 text-slate-200 hover:bg-slate-800 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all select-none"
      >
        <SkipForward className="w-3.5 h-3.5 text-indigo-400" />
        <span>Tek İlerle</span>
        <kbd className="text-[9px] bg-slate-800/90 px-1 py-0.2 rounded font-mono text-indigo-300 border border-slate-700">Space</kbd>
      </button>

      {/* Reset to Cutoff / Initial */}
      <button
        onClick={onResetToCutoff}
        title="Kesim noktasına sıfırla (Kısayol: R)"
        className="flex items-center gap-1 p-1.5 rounded-lg bg-[#070b13]/80 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all"
      >
        <RotateCcw className="w-3.5 h-3.5" />
        <kbd className="text-[9px] bg-slate-800/90 px-1 py-0.2 rounded font-mono text-slate-400 border border-slate-700">R</kbd>
      </button>

      <div className="w-px h-4 bg-slate-800" />

      {/* Hız Seçici */}
      <div className="flex items-center gap-1 bg-[#070b13]/60 border border-slate-800 rounded-lg p-0.5">
        <FastForward className="w-3 h-3 text-slate-400 ml-1" />
        {SPEED_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => handleSpeedChange(opt.value)}
            title={`Oynatma Hızı: ${opt.label} (Kısayol: ${opt.key})`}
            className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
              speedMs === opt.value
                ? 'bg-indigo-500/30 text-indigo-300 border border-indigo-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Mum İlerleme Bilgisi */}
      <div className="flex items-center gap-1 text-[11px] font-mono text-slate-400 bg-[#070b13]/60 border border-slate-800/80 rounded-lg px-2 py-1 select-none">
        <Layers className="w-3 h-3 text-indigo-400" />
        <span>
          {currentBar} / {totalBars}
        </span>
      </div>

      <div className="w-px h-4 bg-slate-800" />

      {/* Replay Modundan Çıkış */}
      <button
        onClick={onExitReplay}
        title="Replay Modundan Çık (Kısayol: X)"
        className="flex items-center gap-1 p-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-all"
      >
        <X className="w-3.5 h-3.5" />
        <kbd className="text-[9px] bg-red-950/60 px-1 py-0.2 rounded font-mono text-red-300 border border-red-800/50">X</kbd>
      </button>
    </div>
  );
}