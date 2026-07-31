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
    <div className="flex items-center gap-2 bg-[#0a0b0e] border border-white/[0.1] rounded-xl px-3 py-1.5 shadow-2xl backdrop-blur-md text-zinc-100 animate-fadeIn select-none">
      {/* Replay Indicator Tag */}
      <div className="flex items-center gap-1.5 border-r border-white/[0.06] pr-2.5">
        <span className="relative flex h-2 w-2">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isPlaying ? 'bg-emerald-400' : 'bg-amber-400'} opacity-75`}></span>
          <span className={`relative inline-flex rounded-full h-2 w-2 ${isPlaying ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
        </span>
        <span className="font-mono text-[10px] tracking-[0.18em] text-emerald-400 font-semibold uppercase">
          REPLAY ENGINE
        </span>
      </div>

      {/* Select Cutoff Candle Button */}
      <button
        onClick={onStartSelection}
        title="Grafikte son görünecek mumu seçmek için muma tıklayın (Kısayol: C)"
        className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border transition-all select-none ${
          isSelectingCutoff
            ? 'bg-amber-500/15 text-amber-300 border-amber-500/40 shadow-xs animate-pulse'
            : 'bg-white/[0.03] border-white/[0.08] text-zinc-300 hover:bg-white/[0.06] hover:text-zinc-100'
        }`}
      >
        <Scissors className="w-3.5 h-3.5 text-amber-400" />
        <span>{isSelectingCutoff ? 'Muma Tıklayın...' : 'Mum Kes'}</span>
        <kbd className="text-[9px] bg-white/[0.06] px-1 py-0.2 rounded font-mono text-amber-300/90 border border-white/[0.08]">C</kbd>
      </button>

      <div className="w-px h-4 bg-white/[0.06]" />

      {/* Oynat / Durdur (Play / Pause) */}
      <button
        onClick={onTogglePlay}
        disabled={isAtEnd}
        title={isPlaying ? 'Durdur (Kısayol: P)' : 'Oynat / Başlat (Kısayol: P)'}
        className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg border transition-all select-none ${
          isPlaying
            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30'
            : 'bg-zinc-100 text-zinc-900 border-zinc-100 hover:bg-emerald-400 hover:border-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed'
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
            <kbd className="text-[9px] bg-zinc-800 px-1 py-0.2 rounded font-mono text-zinc-300 opacity-90 border border-zinc-700">P</kbd>
          </>
        )}
      </button>

      {/* Tek Tek Oynat (Step Forward) */}
      <button
        onClick={onStepForward}
        disabled={isPlaying || isAtEnd}
        title="Tek tek 1 mum ilerlet (Kısayol: Space)"
        className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-white/[0.03] border border-white/[0.08] text-zinc-200 hover:bg-white/[0.06] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all select-none"
      >
        <SkipForward className="w-3.5 h-3.5 text-emerald-400" />
        <span>Tek İlerle</span>
        <kbd className="text-[9px] bg-white/[0.06] px-1 py-0.2 rounded font-mono text-zinc-400 border border-white/[0.08]">Space</kbd>
      </button>

      {/* Reset to Cutoff / Initial */}
      <button
        onClick={onResetToCutoff}
        title="Kesim noktasına sıfırla (Kısayol: R)"
        className="flex items-center gap-1 p-1.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] transition-all"
      >
        <RotateCcw className="w-3.5 h-3.5" />
        <kbd className="text-[9px] bg-white/[0.06] px-1 py-0.2 rounded font-mono text-zinc-400 border border-white/[0.08]">R</kbd>
      </button>

      <div className="w-px h-4 bg-white/[0.06]" />

      {/* Hız Seçici */}
      <div className="flex items-center gap-1 bg-white/[0.02] border border-white/[0.06] rounded-lg p-0.5">
        <FastForward className="w-3 h-3 text-zinc-500 ml-1" />
        {SPEED_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => handleSpeedChange(opt.value)}
            title={`Oynatma Hızı: ${opt.label} (Kısayol: ${opt.key})`}
            className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
              speedMs === opt.value
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Mum İlerleme Bilgisi */}
      <div className="flex items-center gap-1 text-[11px] font-mono text-zinc-400 bg-white/[0.02] border border-white/[0.06] rounded-lg px-2 py-1 select-none">
        <Layers className="w-3 h-3 text-emerald-400" />
        <span>
          {currentBar} / {totalBars}
        </span>
      </div>

      <div className="w-px h-4 bg-white/[0.06]" />

      {/* Replay Modundan Çıkış */}
      <button
        onClick={onExitReplay}
        title="Replay Modundan Çık (Kısayol: X)"
        className="flex items-center gap-1 p-1.5 rounded-lg bg-red-500/[0.06] border border-red-500/20 text-red-400 hover:bg-red-500/15 hover:text-red-300 transition-all"
      >
        <X className="w-3.5 h-3.5" />
        <kbd className="text-[9px] bg-red-950/60 px-1 py-0.2 rounded font-mono text-red-300 border border-red-800/50">X</kbd>
      </button>
    </div>
  );
}