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
    journalStore.reload(symbol);
    setError(null);
  }, [symbol]);

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
        });
        setStopLoss('');
        setTakeProfit('');
        await journalStore.reload(symbol);
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
      await journalStore.reload(symbol);
      logEvent('replay_trade_closed', { context: { symbol, pnl: closed.pnl } });
    } catch (err: any) {
      setError(err?.message || 'Pozisyon kapatılamadı.');
      logError('replay_trade_close_failed', err, { symbol });
    } finally {
      setBusy(false);
    }
  }, [position, currentPrice, busy, currentBarIndex, barTimeIso, symbol]);

  const disabled = busy || !currentPrice;
  const levelSuffix = levelMode === 'percent' ? '%' : '';
  const inputClass =
    'w-full bg-slate-950 border border-slate-700/80 text-zinc-200 text-[10px] rounded px-1.5 py-0.5 focus:border-indigo-500 outline-none font-mono';

  return (
    // transform JSX'te verilmez; sürükleme sırasında doğrudan DOM'a yazılır ve
    // React'in yeniden render'ı bu değeri sıfırlamasın diye burada tutulmaz.
    <div
      ref={panelRef}
      className="w-44 bg-[#0a0b0e]/95 border border-white/[0.1] rounded-lg shadow-2xl backdrop-blur-md text-zinc-100 select-none"
    >
      {/* Sürükleme tutamacı */}
      <div
        onMouseDown={handleDragStart}
        title="Sürükleyerek taşı"
        className="flex items-center justify-between gap-1 px-2 py-1 border-b border-white/[0.06] cursor-grab active:cursor-grabbing"
      >
        <span className="flex items-center gap-1 font-mono text-[9px] tracking-[0.15em] text-indigo-400 font-semibold uppercase">
          <GripHorizontal className="w-3 h-3 text-zinc-600" />
          İşlem
        </span>
        <span className="text-[10px] font-mono text-zinc-400">{formatPrice(currentPrice)}</span>
      </div>

      <div className="p-2 space-y-1.5">
        {error && (
          <div className="flex items-start gap-1 text-[9px] text-red-400 bg-red-500/10 border border-red-500/30 rounded px-1.5 py-1">
            <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-px" />
            <span>{error}</span>
          </div>
        )}

        {position ? (
          <>
            <div className="rounded border border-indigo-500/30 bg-indigo-500/10 px-1.5 py-1 space-y-0.5">
              <div className="flex items-center gap-1 text-[10px] font-semibold">
                {position.side === 'long' ? (
                  <TrendingUp className="w-3 h-3 text-emerald-400" />
                ) : (
                  <TrendingDown className="w-3 h-3 text-red-400" />
                )}
                <span className={position.side === 'long' ? 'text-emerald-400' : 'text-red-400'}>
                  {position.side === 'long' ? 'LONG' : 'SHORT'}
                </span>
                <span className="text-zinc-500 font-mono text-[9px]">x{position.quantity ?? 1}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-1 text-[9px] font-mono text-zinc-500">
                <span>Giriş</span>
                <span className="text-right text-zinc-300">{formatPrice(position.entry_price)}</span>
                <span>Stop</span>
                <span className="text-right">{formatPrice(position.stop_loss)}</span>
                <span>Hedef</span>
                <span className="text-right">{formatPrice(position.take_profit)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleClose}
              disabled={disabled}
              className="w-full flex items-center justify-center gap-1 px-2 py-1 text-[10px] font-semibold rounded bg-zinc-100 text-zinc-900 hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
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
                  className={`flex-1 px-1 py-0.5 text-[9px] font-semibold rounded transition-colors cursor-pointer ${
                    levelMode === mode
                      ? 'bg-indigo-500/20 text-indigo-300'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {mode === 'price' ? 'Fiyat' : 'Yüzde'}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-1">
              <label className="space-y-0.5">
                <span className="text-[8px] uppercase tracking-wider text-zinc-500">
                  Stop{levelSuffix}
                </span>
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
              <label className="space-y-0.5">
                <span className="text-[8px] uppercase tracking-wider text-zinc-500">
                  Hedef{levelSuffix}
                </span>
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
            </div>

            <label className="block space-y-0.5">
              <span className="text-[8px] uppercase tracking-wider text-zinc-500">Miktar</span>
              <input
                type="number"
                min="0"
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className={inputClass}
              />
            </label>

            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => handleOpen('long')}
                disabled={disabled}
                className="flex items-center justify-center gap-0.5 px-1 py-1 text-[10px] font-semibold rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                <TrendingUp className="w-3 h-3" />
                Long
              </button>
              <button
                type="button"
                onClick={() => handleOpen('short')}
                disabled={disabled}
                className="flex items-center justify-center gap-0.5 px-1 py-1 text-[10px] font-semibold rounded bg-red-500/15 text-red-400 border border-red-500/40 hover:bg-red-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                <TrendingDown className="w-3 h-3" />
                Short
              </button>
            </div>
          </>
        )}

        {!position && lastClosed && (
          // Kâr/zarar sunucudan gelir; burada hesaplanmaz (RULES.md "Yasaklar").
          <div className="rounded border border-white/[0.08] bg-white/[0.02] px-1.5 py-0.5 text-[9px] font-mono flex items-center justify-between">
            <span className="text-zinc-500">Son</span>
            <span className={(lastClosed.pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}>
              {formatPrice(lastClosed.pnl)}
              {lastClosed.pnl_percent !== null && lastClosed.pnl_percent !== undefined
                ? ` (${lastClosed.pnl_percent.toFixed(2)}%)`
                : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
