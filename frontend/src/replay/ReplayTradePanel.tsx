/**
 * Replay sırasında manuel işlem paneli (Faz 4).
 *
 * Replay oynatılırken long/short pozisyon açar, stop-loss / take-profit
 * belirler ve pozisyonu kapatır. Panel başlığından sürüklenerek taşınabilir.
 *
 * Kâr/zarar ve seviye hesabı burada YAPILMAZ: finansal hesap mantığı arayüze
 * yazılmaz (RULES.md "Yasaklar"). Yüzdeyle girilen stop/hedef sunucuya yüzde
 * olarak gönderilir; mutlak fiyata çevirme işi `replay_engine` içindedir.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { TrendingUp, TrendingDown, X, Loader2, AlertTriangle, GripHorizontal } from 'lucide-react';

import { closeTrade, openTrade } from '../services/journalApi';
import { journalStore, useJournalStore } from '../store/journalStore';
import { replayStore, useReplayStore } from '../store/replayStore';
import { logError, logEvent } from '../services/eventLog';
import type { TradeSide } from '../types/journal';

interface ReplayTradePanelProps {
  symbol: string;
  provider: string;
  timeframe: string;
  /** Replay'in bulunduğu mumun kapanış fiyatı — giriş/çıkış bu fiyattan yapılır. */
  currentPrice?: number;
  currentBarIndex: number | null;
  /** Mumun zamanı (saniye cinsinden epoch, lightweight-charts biçimi). */
  currentBarTime?: number;
}

type LevelMode = 'price' | 'percent';

function formatPrice(value?: number | null): string {
  if (value === undefined || value === null) return '—';
  return value.toLocaleString('tr-TR', { maximumFractionDigits: 8 });
}

/**
 * Negatif ve hatalı girişleri eler.
 *
 * Fiyat da yüzde de negatif olamaz; kullanıcı "-1" yazdığında sessizce
 * geçersiz sayılır (input `min` özniteliği klavyeyle yazmayı engellemiyor).
 */
function parsePositive(raw: string): number | null {
  if (!raw.trim()) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export default function ReplayTradePanel({
  symbol,
  provider,
  timeframe,
  currentPrice,
  currentBarIndex,
  currentBarTime,
}: ReplayTradePanelProps) {
  const { trades } = useJournalStore();
  // İşlemler açık replay oturumuna bağlanır; panel de yalnızca o oturumun
  // pozisyonlarını görür (bkz. journalStore.reload).
  const [{ sessionId }] = useReplayStore();
  const position = trades.find((t) => t.status === 'OPEN') ?? null;
  const lastClosed = trades.find((t) => t.status === 'CLOSED') ?? null;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [levelMode, setLevelMode] = useState<LevelMode>('price');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [quantity, setQuantity] = useState('1');

  // ─── Sürükleme ──────────────────────────────────────────────────────────
  // Konum React state'inde TUTULMAZ: mousemove saniyede yüzlerce kez tetiklenir
  // ve her birinde state güncellemek paneli baştan render ederek gözle görülür
  // kasmaya yol açıyordu. Bunun yerine transform doğrudan DOM'a, ekran yenileme
  // hızına (rAF) sabitlenerek yazılır — render döngüsü hiç çalışmaz.
  const panelRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const frameRef = useRef<number | null>(null);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: offsetRef.current.x,
      originY: offsetRef.current.y,
    };
  }, []);

  useEffect(() => {
    const paint = () => {
      frameRef.current = null;
      const el = panelRef.current;
      if (el) {
        const { x, y } = offsetRef.current;
        // translate3d: konumlandırmayı GPU katmanına taşır, yeniden yerleşim (layout) tetiklemez.
        el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      }
    };

    const handleMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      offsetRef.current = {
        x: drag.originX + (e.clientX - drag.startX),
        y: drag.originY + (e.clientY - drag.startY),
      };
      // Aynı karede birden fazla mousemove gelirse tek çizim yeter.
      if (frameRef.current === null) {
        frameRef.current = requestAnimationFrame(paint);
      }
    };

    const handleUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      // Bekleyen bir kare varsa hemen çiz: rAF kısıtlandığında (ör. arka plan
      // sekmesi) panel son konumuna hiç taşınmadan kalabilirdi.
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        paint();
      }
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  // ─── Veri ───────────────────────────────────────────────────────────────
  useEffect(() => {
    journalStore.reload(symbol, sessionId);
    setError(null);
  }, [symbol, sessionId]);

  const barTimeIso = currentBarTime ? new Date(currentBarTime * 1000).toISOString() : null;

  const handleOpen = useCallback(
    async (side: TradeSide) => {
      if (!currentPrice || busy) return;

      const stop = parsePositive(stopLoss);
      const target = parsePositive(takeProfit);
      const qty = parsePositive(quantity);
      const byPercent = levelMode === 'percent';

      // Girilmiş ama geçersiz (negatif/sıfır) bir seviyeyi sessizce yok saymak,
      // pozisyonu stop'suz açmak demektir — hata verip işlemi durdur.
      if (stopLoss.trim() && stop === null) {
        setError('Stop pozitif bir değer olmalı.');
        return;
      }
      if (takeProfit.trim() && target === null) {
        setError('Hedef pozitif bir değer olmalı.');
        return;
      }
      if (qty === null) {
        setError('Miktar pozitif bir değer olmalı.');
        return;
      }

      setBusy(true);
      setError(null);
      try {
        // Oturum ön yüklemede açılmış olmalı; olmadıysa (ör. sunucu o an
        // uykudaydı) burada garanti edilir. `journal_trades.session_id`
        // gerçek bir `replay_sessions` satırına yabancı anahtar olduğundan
        // uydurma bir kimlikle pozisyon açılamaz.
        const activeSessionId = await replayStore.ensureSession(symbol, timeframe);

        await openTrade({
          symbol,
          provider,
          timeframe,
          side,
          entry_price: currentPrice,
          quantity: qty,
          // Yüzde modunda çevrimi sunucu yapar (RULES.md "Yasaklar").
          stop_loss: byPercent ? null : stop,
          take_profit: byPercent ? null : target,
          stop_loss_pct: byPercent ? stop : null,
          take_profit_pct: byPercent ? target : null,
          entry_bar_index: currentBarIndex,
          entry_time: barTimeIso,
          session_id: activeSessionId,
        });
        setStopLoss('');
        setTakeProfit('');
        await journalStore.reload(symbol, activeSessionId);
        logEvent('replay_trade_opened', { context: { symbol, side } });
      } catch (err: any) {
        setError(err?.message || 'Pozisyon açılamadı.');
        logError('replay_trade_open_failed', err, { symbol, side });
      } finally {
        setBusy(false);
      }
    },
    [busy, currentPrice, stopLoss, takeProfit, quantity, levelMode, symbol, provider, timeframe, currentBarIndex, barTimeIso]
  );

  const handleClose = useCallback(async () => {
    if (!position || !currentPrice || busy) return;

    setBusy(true);
    setError(null);
    try {
      const closed = await closeTrade(position.id, {
        exit_price: currentPrice,
        exit_bar_index: currentBarIndex,
        exit_time: barTimeIso,
        exit_reason: 'manual',
      });
      await journalStore.reload(symbol, sessionId);
      logEvent('replay_trade_closed', { context: { symbol, pnl: closed.pnl } });
    } catch (err: any) {
      setError(err?.message || 'Pozisyon kapatılamadı.');
      logError('replay_trade_close_failed', err, { symbol });
    } finally {
      setBusy(false);
    }
  }, [position, currentPrice, busy, currentBarIndex, barTimeIso, symbol, sessionId]);

  const disabled = busy || !currentPrice;
  const levelSuffix = levelMode === 'percent' ? '%' : '';
  // Alanlar dar tutulur: şerit tek satırda kaldığı sürece mumları örtmez.
  const inputClass =
    'w-14 bg-slate-950 border border-slate-700/80 text-zinc-200 text-[10px] rounded px-1 py-0.5 focus:border-indigo-500 outline-none font-mono';
  const fieldLabel = 'text-[8px] uppercase tracking-wider text-zinc-500';

  return (
    // transform JSX'te verilmez; sürükleme sırasında doğrudan DOM'a yazılır ve
    // React'in yeniden render'ı bu değeri sıfırlamasın diye burada tutulmaz.
    //
    // Dikey panel yerine YATAY şerit: eskiden grafiğin sağında duruyor ve fiyat
    // cetvelini kapatıyordu; taşındığında da cetvelin bir bölümü kullanılamaz
    // hâlde kalıyordu. Şerit artık sol altta, cetvelden uzakta durur.
    <div
      ref={panelRef}
      className="flex items-center gap-1.5 bg-[#0a0b0e]/95 border border-white/[0.1] rounded-lg px-1.5 py-1 shadow-2xl backdrop-blur-md text-zinc-100 select-none"
    >
      {/* Sürükleme tutamacı + anlık fiyat */}
      <div
        onMouseDown={handleDragStart}
        title="Sürükleyerek taşı"
        className="flex items-center gap-1 pr-1.5 border-r border-white/[0.08] cursor-grab active:cursor-grabbing"
      >
        <GripHorizontal className="w-3 h-3 text-zinc-600" />
        <span className="text-[10px] font-mono text-zinc-400 tabular-nums">
          {formatPrice(currentPrice)}
        </span>
      </div>

      {position ? (
        <>
          <span className="flex items-center gap-1 text-[10px] font-semibold">
            {position.side === 'long' ? (
              <TrendingUp className="w-3 h-3 text-emerald-400" />
            ) : (
              <TrendingDown className="w-3 h-3 text-red-400" />
            )}
            <span className={position.side === 'long' ? 'text-emerald-400' : 'text-red-400'}>
              {position.side === 'long' ? 'LONG' : 'SHORT'}
            </span>
            <span className="text-zinc-500 font-mono text-[9px]">x{position.quantity ?? 1}</span>
          </span>

          <span className="flex items-center gap-1.5 text-[9px] font-mono text-zinc-500 tabular-nums">
            <span title="Giriş fiyatı">
              G <span className="text-zinc-300">{formatPrice(position.entry_price)}</span>
            </span>
            <span title="Stop seviyesi">
              S <span className="text-red-400/90">{formatPrice(position.stop_loss)}</span>
            </span>
            <span title="Hedef seviyesi">
              H <span className="text-emerald-400/90">{formatPrice(position.take_profit)}</span>
            </span>
          </span>

          <button
            type="button"
            onClick={handleClose}
            disabled={disabled}
            title="Pozisyonu kapat"
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded bg-zinc-100 text-zinc-900 hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
            Kapat
          </button>
        </>
      ) : (
        <>
          {/* Seviye birimi: mutlak fiyat mı, yüzde mi */}
          <div className="flex items-center gap-0.5 bg-white/[0.03] border border-white/[0.06] rounded p-0.5">
            {(['price', 'percent'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setLevelMode(mode)}
                title={mode === 'price' ? 'Seviyeleri fiyat olarak gir' : 'Seviyeleri yüzde olarak gir'}
                className={`px-1.5 py-0.5 text-[9px] font-semibold rounded transition-colors cursor-pointer ${
                  levelMode === mode
                    ? 'bg-indigo-500/20 text-indigo-300'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {mode === 'price' ? 'Fiyat' : 'Yüzde'}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-1">
            <span className={fieldLabel}>Stop{levelSuffix}</span>
            <input
              type="number"
              min="0"
              step="any"
              value={stopLoss}
              onChange={(e) => setStopLoss(e.target.value)}
              placeholder="—"
              className={inputClass}
            />
          </label>

          <label className="flex items-center gap-1">
            <span className={fieldLabel}>Hedef{levelSuffix}</span>
            <input
              type="number"
              min="0"
              step="any"
              value={takeProfit}
              onChange={(e) => setTakeProfit(e.target.value)}
              placeholder="—"
              className={inputClass}
            />
          </label>

          <label className="flex items-center gap-1">
            <span className={fieldLabel}>Miktar</span>
            <input
              type="number"
              min="0"
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className={inputClass}
            />
          </label>

          <button
            type="button"
            onClick={() => handleOpen('long')}
            disabled={disabled}
            title="Long pozisyon aç"
            className="flex items-center gap-0.5 px-2 py-1 text-[10px] font-semibold rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            <TrendingUp className="w-3 h-3" />
            Long
          </button>
          <button
            type="button"
            onClick={() => handleOpen('short')}
            disabled={disabled}
            title="Short pozisyon aç"
            className="flex items-center gap-0.5 px-2 py-1 text-[10px] font-semibold rounded bg-red-500/15 text-red-400 border border-red-500/40 hover:bg-red-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            <TrendingDown className="w-3 h-3" />
            Short
          </button>
        </>
      )}

      {!position && lastClosed && (
        // Kâr/zarar sunucudan gelir; burada hesaplanmaz (RULES.md "Yasaklar").
        <span
          className="flex items-center gap-1 pl-1.5 border-l border-white/[0.08] text-[9px] font-mono tabular-nums"
          title="Son kapanan işlemin kâr/zararı"
        >
          <span className="text-zinc-500">Son</span>
          <span className={(lastClosed.pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}>
            {formatPrice(lastClosed.pnl)}
            {lastClosed.pnl_percent !== null && lastClosed.pnl_percent !== undefined
              ? ` (${lastClosed.pnl_percent.toFixed(2)}%)`
              : ''}
          </span>
        </span>
      )}

      {error && (
        <span className="flex items-center gap-1 pl-1.5 border-l border-white/[0.08] text-[9px] text-red-400 max-w-[220px]">
          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
          <span className="truncate" title={error}>
            {error}
          </span>
        </span>
      )}
    </div>
  );
}
