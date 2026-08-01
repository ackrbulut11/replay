/**
 * Replay sırasında manuel işlem paneli (Faz 4).
 *
 * Replay oynatılırken long/short pozisyon açar, stop-loss / take-profit
 * belirler ve pozisyonu kapatır.
 *
 * Kâr/zarar burada HESAPLANMAZ: finansal hesap mantığı arayüze yazılmaz
 * (RULES.md "Yasaklar"). Pozisyon matematiği backend'de
 * `engines/replay_engine.py` içindedir; panel yalnızca sunucunun döndürdüğü
 * yetkili değerleri gösterir.
 */

import { useCallback, useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, X, Loader2, AlertTriangle } from 'lucide-react';

import { closeTrade, getTrades, openTrade } from '../services/journalApi';
import { logError, logEvent } from '../services/eventLog';
import type { JournalTrade, TradeSide } from '../types/journal';

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

function formatPrice(value?: number | null): string {
  if (value === undefined || value === null) return '—';
  return value.toLocaleString('tr-TR', { maximumFractionDigits: 8 });
}

export default function ReplayTradePanel({
  symbol,
  provider,
  timeframe,
  currentPrice,
  currentBarIndex,
  currentBarTime,
}: ReplayTradePanelProps) {
  const [position, setPosition] = useState<JournalTrade | null>(null);
  const [lastClosed, setLastClosed] = useState<JournalTrade | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('');

  // Açık pozisyon sunucudan okunur; sayfa yenilense de pozisyon kaybolmaz.
  const loadOpenPosition = useCallback(async () => {
    try {
      const trades = await getTrades({ symbol, status: 'OPEN', limit: 1 });
      setPosition(trades.length > 0 ? trades[0] : null);
    } catch (err) {
      logError('journal_open_position_load_failed', err, { symbol });
    }
  }, [symbol]);

  useEffect(() => {
    loadOpenPosition();
    setLastClosed(null);
    setError(null);
  }, [loadOpenPosition]);

  const barTimeIso = currentBarTime ? new Date(currentBarTime * 1000).toISOString() : null;

  const handleOpen = async (side: TradeSide) => {
    if (!currentPrice || busy) return;

    setBusy(true);
    setError(null);
    try {
      const trade = await openTrade({
        symbol,
        provider,
        timeframe,
        side,
        entry_price: currentPrice,
        quantity: Number(quantity) || 1,
        stop_loss: stopLoss ? Number(stopLoss) : null,
        take_profit: takeProfit ? Number(takeProfit) : null,
        entry_bar_index: currentBarIndex,
        entry_time: barTimeIso,
        reason: reason.trim() || null,
      });
      setPosition(trade);
      setLastClosed(null);
      setStopLoss('');
      setTakeProfit('');
      setReason('');
      logEvent('replay_trade_opened', { context: { symbol, side } });
    } catch (err: any) {
      setError(err?.message || 'Pozisyon açılamadı.');
      logError('replay_trade_open_failed', err, { symbol, side });
    } finally {
      setBusy(false);
    }
  };

  const handleClose = async () => {
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
      setPosition(null);
      setLastClosed(closed);
      logEvent('replay_trade_closed', { context: { symbol, pnl: closed.pnl } });
    } catch (err: any) {
      setError(err?.message || 'Pozisyon kapatılamadı.');
      logError('replay_trade_close_failed', err, { symbol });
    } finally {
      setBusy(false);
    }
  };

  const disabled = busy || !currentPrice;

  return (
    <div className="w-64 bg-[#0a0b0e]/95 border border-white/[0.1] rounded-xl p-3 shadow-2xl backdrop-blur-md text-zinc-100 select-none space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-[0.18em] text-indigo-400 font-semibold uppercase">
          Manuel İşlem
        </span>
        <span className="text-[11px] font-mono text-zinc-400">{formatPrice(currentPrice)}</span>
      </div>

      {error && (
        <div className="flex items-start gap-1.5 text-[11px] text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-2 py-1.5">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
          <span>{error}</span>
        </div>
      )}

      {position ? (
        <div className="space-y-2">
          <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-2 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              {position.side === 'long' ? (
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5 text-red-400" />
              )}
              <span className={position.side === 'long' ? 'text-emerald-400' : 'text-red-400'}>
                {position.side === 'long' ? 'LONG' : 'SHORT'}
              </span>
              <span className="text-zinc-500 font-mono text-[10px]">x{position.quantity ?? 1}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] font-mono text-zinc-400">
              <span>Giriş</span>
              <span className="text-right text-zinc-200">{formatPrice(position.entry_price)}</span>
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
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-zinc-100 text-zinc-900 hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
            Pozisyonu Kapat
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            <label className="space-y-0.5">
              <span className="text-[9px] uppercase tracking-wider text-zinc-500">Stop</span>
              <input
                type="number"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                placeholder="—"
                className="w-full bg-slate-950 border border-slate-700/80 text-zinc-200 text-[11px] rounded px-1.5 py-1 focus:border-indigo-500 outline-none font-mono"
              />
            </label>
            <label className="space-y-0.5">
              <span className="text-[9px] uppercase tracking-wider text-zinc-500">Hedef</span>
              <input
                type="number"
                value={takeProfit}
                onChange={(e) => setTakeProfit(e.target.value)}
                placeholder="—"
                className="w-full bg-slate-950 border border-slate-700/80 text-zinc-200 text-[11px] rounded px-1.5 py-1 focus:border-indigo-500 outline-none font-mono"
              />
            </label>
          </div>

          <label className="block space-y-0.5">
            <span className="text-[9px] uppercase tracking-wider text-zinc-500">Miktar</span>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700/80 text-zinc-200 text-[11px] rounded px-1.5 py-1 focus:border-indigo-500 outline-none font-mono"
            />
          </label>

          <label className="block space-y-0.5">
            <span className="text-[9px] uppercase tracking-wider text-zinc-500">Sebep</span>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Neden giriyorsun?"
              className="w-full bg-slate-950 border border-slate-700/80 text-zinc-200 text-[11px] rounded px-1.5 py-1 focus:border-indigo-500 outline-none"
            />
          </label>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => handleOpen('long')}
              disabled={disabled}
              className="flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-semibold rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              <TrendingUp className="w-3.5 h-3.5" />
              Long
            </button>
            <button
              type="button"
              onClick={() => handleOpen('short')}
              disabled={disabled}
              className="flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-semibold rounded-lg bg-red-500/15 text-red-400 border border-red-500/40 hover:bg-red-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              <TrendingDown className="w-3.5 h-3.5" />
              Short
            </button>
          </div>
        </div>
      )}

      {lastClosed && (
        // Kâr/zarar sunucudan gelir; burada hesaplanmaz (RULES.md "Yasaklar").
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-1.5 text-[10px] font-mono flex items-center justify-between">
          <span className="text-zinc-500">Son işlem</span>
          <span className={(lastClosed.pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}>
            {formatPrice(lastClosed.pnl)}
            {lastClosed.pnl_percent !== null && lastClosed.pnl_percent !== undefined
              ? ` (${lastClosed.pnl_percent.toFixed(2)}%)`
              : ''}
          </span>
        </div>
      )}
    </div>
  );
}
