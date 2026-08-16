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
    'flex items-center justify-center w-6 h-6 rounded-md hover:bg-white/[0.08] hover:text-content-strong disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer';

  return (
    /* Dar ekranda sarmalanır: dokuz kontrol tek satırda ~330px istiyor ve
       telefonda şeridin sağ ucu (mum sayacı, çıkış) ekranın dışında
       kalıyordu. Sarmalanan satırlar ortalanır. */
    <div className="flex max-w-full flex-wrap items-center justify-center gap-0.5 bg-canvas border border-white/[0.1] rounded-lg px-1.5 py-1 shadow-2xl backdrop-blur-md text-content-strong animate-fadeIn select-none">
      {/* Durum noktası — "REPLAY ENGINE" başlığının yerini tutar. */}
      <span
        className="relative flex h-1.5 w-1.5 mx-1"
        title={isPlaying ? 'Replay oynatılıyor' : 'Replay duraklatıldı'}
      >
        <span
          className={`animate-ping absolute inline-flex h-full w-full rounded-full ${
            isPlaying ? 'bg-accent-400' : 'bg-warn-400'
          } opacity-75`}
        />
        <span
          className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
            isPlaying ? 'bg-accent-400' : 'bg-warn-400'
          }`}
        />
      </span>

      {/* Mum Kes */}
      <button
        onClick={onStartSelection}
        title="Mum Kes — grafikte son görünecek mumu seçmek için bir muma tıklayın (C)"
        className={`${iconButton} ${
          isSelectingCutoff ? 'bg-warn-500/20 text-warn-300 animate-pulse' : 'text-warn-400'
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
            ? 'bg-accent-500/20 border-accent-500/50 text-accent-300'
            : 'bg-white/[0.03] border-line text-content-muted hover:text-content'
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
            ? 'bg-accent-500/20 text-accent-400'
            : 'bg-ink-50 text-ink-950 hover:bg-accent-300 hover:text-ink-950'
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
        className={`${iconButton} text-accent-400`}
      >
        <SkipForward className="w-3.5 h-3.5" />
      </button>

      {/* Kesim noktasına sıfırla */}
      <button
        onClick={onResetToCutoff}
        title="Kesim noktasına sıfırla (R)"
        className={`${iconButton} text-content-muted`}
      >
        <RotateCcw className="w-3.5 h-3.5" />
      </button>

      <div className="w-px h-4 bg-white/[0.08] mx-0.5" />

      {/* Oynatma hızı — dört ayrı düğme yerine tek açılır liste. */}
      <div className="flex items-center gap-0.5" title="Oynatma hızı (kısayollar: 1-4)">
        <FastForward className="w-3 h-3 text-content-faint" />
        <select
          value={speedMs}
          onChange={(e) => setReplayState({ speedMs: Number(e.target.value) })}
          className="bg-transparent border-none outline-none text-2xs font-mono font-medium text-accent-400 cursor-pointer focus:ring-0 pr-0.5"
        >
          {SPEED_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-canvas text-content-strong">
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="w-px h-4 bg-white/[0.08] mx-0.5" />

      {/* Mum ilerleme bilgisi */}
      <span
        className="flex items-center gap-1 px-1 text-2xs font-mono text-content-muted tabular-nums"
        title={`${currentBar}. mum / toplam ${totalBars}`}
      >
        <Layers className="w-3 h-3 text-accent-400" />
        {currentBar}/{totalBars}
      </span>

      {/* Replay modundan çıkış */}
      <button
        onClick={onExitReplay}
        title="Replay Modundan Çık (X)"
        className={`${iconButton} text-loss-400 hover:bg-loss-500/20 hover:text-loss-300`}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
