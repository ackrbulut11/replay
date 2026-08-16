/**
 * Replay araç çubuğu — grafiğin üstünde yüzen kompakt kontrol şeridi.
 *
 * Bilinçli olarak simge tabanlıdır: etiketli sürüm (her düğmede metin + kısayol
 * rozeti) grafiğin üst şeridinin büyük bölümünü kaplıyor ve mumları örtüyordu.
 * Özellikler birebir korunur — kesme, oynat/durdur, tek adım, sıfırlama, hız,
 * ilerleme sayacı ve çıkış — ama kısayol/açıklama metinleri `title` ipucuna
 * taşındı. Kısayol tuşları CandleChart'taki dinleyicide yaşar; buradaki
 * ipuçları yalnızca onları duyurur.
 */

import { replayStore, useReplayStore } from '../store/replayStore';
import {
  Play,
  Pause,
  Eye,
  EyeOff,
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

const SPEED_OPTIONS = [
  { label: '0.2s', value: 200 },
  { label: '0.5s', value: 500 },
  { label: '1s', value: 1000 },
  { label: '2s', value: 2000 },
];

export default function ReplayControls({
  totalBars,
  onStepForward,
  onTogglePlay,
  onStartSelection,
  onExitReplay,
  onResetToCutoff,
}: ReplayControlsProps) {
  const [replayState, setReplayState] = useReplayStore();
  const { isSelectingCutoff, currentIndex, isPlaying, speedMs, isBlindMode } = replayState;

  const currentBar = currentIndex !== null ? currentIndex + 1 : totalBars;
  const isAtEnd = currentIndex !== null && currentIndex >= totalBars - 1;

  // Simge düğmelerinin ortak sınıfı.
  const iconButton =
    'flex items-center justify-center w-6 h-6 rounded-md hover:bg-white/[0.08] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer';

  return (
    <div className="flex items-center gap-0.5 bg-[#0a0b0e]/95 border border-white/[0.1] rounded-lg px-1.5 py-1 shadow-2xl backdrop-blur-md text-zinc-100 animate-fadeIn select-none">
      {/* Durum noktası — "REPLAY ENGINE" başlığının yerini tutar. */}
      <span
        className="relative flex h-1.5 w-1.5 mx-1"
        title={isPlaying ? 'Replay oynatılıyor' : 'Replay duraklatıldı'}
      >
        <span
          className={`animate-ping absolute inline-flex h-full w-full rounded-full ${
            isPlaying ? 'bg-emerald-400' : 'bg-amber-400'
          } opacity-75`}
        />
        <span
          className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
            isPlaying ? 'bg-emerald-400' : 'bg-amber-400'
          }`}
        />
      </span>

      {/* Mum Kes */}
      <button
        onClick={onStartSelection}
        title="Mum Kes — grafikte son görünecek mumu seçmek için bir muma tıklayın (C)"
        className={`${iconButton} ${
          isSelectingCutoff ? 'bg-amber-500/20 text-amber-300 animate-pulse' : 'text-amber-400'
        }`}
      >
        <Scissors className="w-3.5 h-3.5" />
      </button>

      {/* Oynat / Durdur */}
      {/*
        Kör mod: sembol adını ve tarihi gizler. Manuel backtest'in bilinen en
        büyük hilesi sonucu bilerek geçmişe bakmaktır; bu düğme onu kapatır.
      */}
      <button
        onClick={() => replayStore.toggleBlindMode()}
        title={isBlindMode ? 'Kör mod açık — sembol ve tarih gizli (B)' : 'Kör mod: sembolü ve tarihi gizle (B)'}
        className={`p-1.5 rounded-md border transition-all cursor-pointer ${
          isBlindMode
            ? 'bg-violet-500/20 border-violet-500/50 text-violet-300'
            : 'bg-white/[0.03] border-white/[0.08] text-zinc-400 hover:text-zinc-200'
        }`}
      >
        {isBlindMode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </button>

      <button
        onClick={onTogglePlay}
        disabled={isAtEnd}
        title={isPlaying ? 'Durdur (P)' : 'Oynat / Başlat (P)'}
        className={`${iconButton} ${
          isPlaying
            ? 'bg-emerald-500/20 text-emerald-400'
            : 'bg-zinc-100 text-zinc-900 hover:bg-emerald-400 hover:text-zinc-900'
        }`}
      >
        {isPlaying ? (
          <Pause className="w-3.5 h-3.5 fill-current" />
        ) : (
          <Play className="w-3.5 h-3.5 fill-current ml-px" />
        )}
      </button>

      {/* Tek İlerle */}
      <button
        onClick={onStepForward}
        disabled={isPlaying || isAtEnd}
        title="Tek tek 1 mum ilerlet (Space)"
        className={`${iconButton} text-emerald-400`}
      >
        <SkipForward className="w-3.5 h-3.5" />
      </button>

      {/* Kesim noktasına sıfırla */}
      <button
        onClick={onResetToCutoff}
        title="Kesim noktasına sıfırla (R)"
        className={`${iconButton} text-zinc-400`}
      >
        <RotateCcw className="w-3.5 h-3.5" />
      </button>

      <div className="w-px h-4 bg-white/[0.08] mx-0.5" />

      {/* Oynatma hızı — dört ayrı düğme yerine tek açılır liste. */}
      <div className="flex items-center gap-0.5" title="Oynatma hızı (kısayollar: 1-4)">
        <FastForward className="w-3 h-3 text-zinc-500" />
        <select
          value={speedMs}
          onChange={(e) => setReplayState({ speedMs: Number(e.target.value) })}
          className="bg-transparent border-none outline-none text-[10px] font-mono font-medium text-emerald-400 cursor-pointer focus:ring-0 pr-0.5"
        >
          {SPEED_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-[#0a0b0e] text-zinc-100">
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="w-px h-4 bg-white/[0.08] mx-0.5" />

      {/* Mum ilerleme bilgisi */}
      <span
        className="flex items-center gap-1 px-1 text-[10px] font-mono text-zinc-400 tabular-nums"
        title={`${currentBar}. mum / toplam ${totalBars}`}
      >
        <Layers className="w-3 h-3 text-emerald-400" />
        {currentBar}/{totalBars}
      </span>

      {/* Replay modundan çıkış */}
      <button
        onClick={onExitReplay}
        title="Replay Modundan Çık (X)"
        className={`${iconButton} text-red-400 hover:bg-red-500/20 hover:text-red-300`}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
