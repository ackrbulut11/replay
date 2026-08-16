/**
 * Replay işlem geçmişi — açılır/kapanır liste.
 *
 * Aktif oturumda alınan işlemleri ve kullanıcının daha önce kalıcı olarak
 * kaydettiklerini gösterir. Liste sembole göredir: `journalStore` zaten yalnızca
 * aktif sembolün işlemlerini yükler.
 *
 * "Kaydet" bu oturumun işlemlerini kalıcı hale getirir; aynı paritede açılan
 * sonraki replaylerde de listelenirler. Kaydedilmeyen oturumlar kapanınca
 * grafikten ve listeden düşer (temiz grafik davranışı).
 *
 * Kâr/zarar burada HESAPLANMAZ, sunucudan gelen `pnl_percent` gösterilir
 * (RULES.md "Yasaklar": finansal hesap arayüze yazılmaz).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  GripHorizontal,
  History,
  Loader2,
  Save,
  Check,
  AlertTriangle,
} from 'lucide-react';

import { getPerformance, saveSession } from '../services/journalApi';
import { journalStore, useJournalStore } from '../store/journalStore';
import { useReplayStore } from '../store/replayStore';
import { useDraggablePanel } from '../hooks/useDraggablePanel';
import { logError, logEvent } from '../services/eventLog';
import type { JournalTrade, PerformanceReport } from '../types/journal';

interface ReplayHistoryPanelProps {
  symbol: string;
}

/** Fiyatlar iki basamak — grafikteki işaret etiketleriyle aynı biçim. */
function formatPrice(value?: number | null): string {
  if (value === undefined || value === null) return '—';
  return value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPercent(value?: number | null): string {
  if (value === undefined || value === null) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}


/**
 * Oturum özetindeki tek hücre.
 *
 * `tone` yalnızca vurgu içindir; "kötü" olan bir metriğin (max düşüş) her
 * zaman kırmızı olması, iyi/kötü ayrımını okumayı kolaylaştırıyor.
 */
function SummaryCell({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'good' | 'bad' | 'neutral';
}) {
  const color =
    tone === 'good' ? 'text-emerald-400' : tone === 'bad' ? 'text-red-400' : 'text-zinc-200';
  return (
    <div className="bg-[#0d1321] px-2 py-1.5 flex flex-col gap-0.5">
      <span className="text-[8px] uppercase tracking-wider text-zinc-600">{label}</span>
      <span className={`text-[11px] font-bold font-mono ${color}`}>{value}</span>
    </div>
  );
}

export default function ReplayHistoryPanel({ symbol }: ReplayHistoryPanelProps) {
  const { trades, loading } = useJournalStore();
  const [{ sessionId }] = useReplayStore();

  const [isOpen, setIsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { panelRef, handleDragStart } = useDraggablePanel();

  // Toplam durum sunucudan gelir; ağırlıklı getiri burada HESAPLANMAZ
  // (RULES.md "Yasaklar"). İşlem listesi her değiştiğinde tazelenir.
  //
  // Rapor bütünüyle saklanır: oturum özeti (bakiye, düşüş, profit factor)
  // aynı çağrıdan besleniyor, ayrıca istek atmaya gerek yok.
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const totalPercent = report?.weighted_return_pct ?? null;
  const closedCount = useMemo(() => trades.filter((t) => t.status === 'CLOSED').length, [trades]);

  useEffect(() => {
    if (!sessionId || closedCount === 0) {
      setReport(null);
      return;
    }
    let cancelled = false;
    getPerformance({ symbol, sessionId, includeSaved: true })
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch(() => {
        // Özet ikincil bilgi; hata kullanıcıyı engellememeli.
        if (!cancelled) setReport(null);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol, sessionId, closedCount, trades]);

  // En eskiden yeniye: geçmiş okumak kronolojik sırayla daha doğal.
  const ordered = useMemo(
    () =>
      [...trades].sort((a, b) => {
        const at = a.entry_time ? new Date(a.entry_time).getTime() : 0;
        const bt = b.entry_time ? new Date(b.entry_time).getTime() : 0;
        return at - bt;
      }),
    [trades]
  );

  // Bu oturumda açılmış ve henüz kaydedilmemiş işlem var mı — "Kaydet"in
  // anlamlı olup olmadığını belirler.
  const unsavedCount = useMemo(
    () => trades.filter((t) => t.session_id === sessionId && !t.is_saved).length,
    [trades, sessionId]
  );

  const handleSave = useCallback(async () => {
    if (!sessionId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await saveSession(sessionId);
      await journalStore.reload(symbol, sessionId);
      logEvent('replay_history_saved', { context: { symbol, saved: result.saved } });
    } catch (err: any) {
      setError(err?.message || 'Geçmiş kaydedilemedi.');
      logError('replay_history_save_failed', err, { symbol });
    } finally {
      setBusy(false);
    }
  }, [sessionId, busy, symbol]);

  const renderRow = (trade: JournalTrade) => {
    const isLong = trade.side === 'long';
    const pnl = trade.pnl_percent;
    const isOpenPosition = trade.status !== 'CLOSED';

    return (
      <div
        key={trade.id}
        className="grid grid-cols-[auto_1fr_1fr_auto] gap-x-2 items-center px-2 py-1 text-[10px] font-mono border-t border-white/[0.05] hover:bg-white/[0.03]"
      >
        <span
          className={`font-semibold ${isLong ? 'text-emerald-400' : 'text-red-400'}`}
          title={isLong ? 'Long pozisyon' : 'Short pozisyon'}
        >
          {isLong ? 'L' : 'S'}
        </span>

        <span className="text-zinc-400 truncate" title={`Giriş: ${formatDate(trade.entry_time)}`}>
          <span className="text-zinc-600">{formatDate(trade.entry_time)}</span>{' '}
          <span className="text-zinc-200">{formatPrice(trade.entry_price)}</span>
        </span>

        <span className="text-zinc-400 truncate" title={`Çıkış: ${formatDate(trade.exit_time)}`}>
          {isOpenPosition ? (
            <span className="text-amber-400/80">açık</span>
          ) : (
            <>
              <span className="text-zinc-600">{formatDate(trade.exit_time)}</span>{' '}
              <span className="text-zinc-200">{formatPrice(trade.exit_price)}</span>
            </>
          )}
        </span>

        <span
          className={`text-right font-semibold tabular-nums ${
            isOpenPosition ? 'text-zinc-600' : (pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
          }`}
        >
          {isOpenPosition ? '—' : formatPercent(pnl)}
          {trade.is_saved && <span className="ml-1 text-indigo-400" title="Kalıcı kaydedildi">•</span>}
        </span>
      </div>
    );
  };

  return (
    // transform JSX'te verilmez; sürükleme sırasında doğrudan DOM'a yazılır
    // (bkz. useDraggablePanel).
    <div
      ref={panelRef}
      className="w-[420px] max-w-[90vw] bg-[#0a0b0e]/95 border border-white/[0.1] rounded-lg shadow-2xl backdrop-blur-md text-zinc-100 select-none overflow-hidden"
    >
      {/* Başlık: tutamaçtan sürüklenir, gerisine tıklanınca açılır/kapanır. */}
      <div className="flex items-center gap-1.5 px-2 py-1">
        <span
          onMouseDown={handleDragStart}
          title="Sürükleyerek taşı"
          className="flex items-center cursor-grab active:cursor-grabbing -ml-0.5 pr-0.5"
        >
          <GripHorizontal className="w-3 h-3 text-zinc-600" />
        </span>

        <button
          type="button"
          onClick={() => setIsOpen((v) => !v)}
          title={isOpen ? 'Geçmişi gizle' : 'Geçmişi göster'}
          className="flex-1 flex items-center gap-1.5 hover:opacity-80 transition-opacity cursor-pointer"
        >
          {isOpen ? (
            <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
          )}
          <History className="w-3 h-3 text-indigo-400" />
          <span className="font-mono text-[9px] tracking-[0.15em] text-indigo-400 font-semibold uppercase">
            Geçmiş
          </span>
          <span className="text-[10px] font-mono text-zinc-500">({trades.length})</span>
          {loading && <Loader2 className="w-3 h-3 animate-spin text-zinc-600" />}

          {/* Toplam durum — panel kapalıyken de görünür. */}
          {totalPercent !== null && (
            <span
              className={`ml-auto text-[10px] font-mono font-semibold tabular-nums ${
                totalPercent >= 0 ? 'text-emerald-400' : 'text-red-400'
              }`}
              title="Pozisyon büyüklüğüne göre ağırlıklı toplam kâr/zarar"
            >
              {formatPercent(totalPercent)}
            </span>
          )}
          <span
            className={`${totalPercent !== null ? '' : 'ml-auto'} text-[9px] font-mono text-zinc-600 uppercase`}
          >
            {symbol}
          </span>
        </button>
      </div>

      {isOpen && (
        <>
          {/*
            Oturum özeti: "bu denemede ne yaptım" sorusunun cevabı.
            Metrikler burada hesaplanmaz, /journal/performance'tan hazır gelir
            (RULES.md "Yasaklar") — üstteki toplam getiri de aynı rapordan.
          */}
          {report && report.total_trades > 0 && (
            <div className="grid grid-cols-3 gap-px bg-white/[0.06] border-t border-white/[0.06]">
              <SummaryCell
                label="Bakiye"
                value={report.ending_balance.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
                tone={report.ending_balance >= report.starting_balance ? 'good' : 'bad'}
              />
              <SummaryCell
                label="Başarı"
                value={report.win_rate === null ? '—' : `${report.win_rate.toFixed(0)}%`}
              />
              <SummaryCell
                label="Max Düşüş"
                value={report.max_drawdown_pct === null ? '—' : `${report.max_drawdown_pct.toFixed(1)}%`}
                tone="bad"
              />
              <SummaryCell
                label="İşlem"
                value={String(report.total_trades)}
              />
              <SummaryCell
                label="Profit F."
                value={report.profit_factor === null ? '—' : report.profit_factor.toFixed(2)}
              />
              <SummaryCell
                label="Beklenti"
                value={report.expectancy === null ? '—' : report.expectancy.toFixed(1)}
                tone={(report.expectancy ?? 0) >= 0 ? 'good' : 'bad'}
              />
            </div>
          )}

          {ordered.length === 0 ? (
            <div className="px-2 py-3 text-[10px] text-zinc-500 text-center border-t border-white/[0.06]">
              Bu paritede henüz işlem yok.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-x-2 px-2 py-1 text-[8px] uppercase tracking-wider text-zinc-600 border-t border-white/[0.06]">
                <span>Yön</span>
                <span>Giriş</span>
                <span>Çıkış</span>
                <span className="text-right">K/Z</span>
              </div>
              <div className="max-h-56 overflow-y-auto">{ordered.map(renderRow)}</div>

              {/* Toplam durum. Yüzdeler düz ortalanmaz: 10 birimlik %10 kâr ile
                  1 birimlik %10 zarar birbirini götürmez. Ağırlıklandırmayı
                  sunucu yapar (bkz. weighted_return_pct). */}
              <div className="flex items-center gap-2 px-2 py-1 border-t border-white/[0.1] bg-white/[0.02]">
                <span className="text-[9px] uppercase tracking-wider text-zinc-500">Toplam</span>
                <span className="text-[9px] text-zinc-600">
                  {closedCount} kapalı işlem, büyüklüğe göre ağırlıklı
                </span>
                <span
                  className={`ml-auto text-[11px] font-mono font-bold tabular-nums ${
                    totalPercent === null
                      ? 'text-zinc-600'
                      : totalPercent >= 0
                        ? 'text-emerald-400'
                        : 'text-red-400'
                  }`}
                >
                  {totalPercent === null ? '—' : formatPercent(totalPercent)}
                </span>
              </div>
            </>
          )}

          {error && (
            <div className="flex items-start gap-1 px-2 py-1 text-[9px] text-red-400 bg-red-500/10 border-t border-red-500/30">
              <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-px" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center gap-2 px-2 py-1.5 border-t border-white/[0.06]">
            <span className="text-[9px] text-zinc-600 leading-tight">
              Kaydedilen işlemler bu paritedeki sonraki replaylerde de görünür.
            </span>
            <button
              type="button"
              onClick={handleSave}
              disabled={busy || !sessionId || unsavedCount === 0}
              title={
                unsavedCount === 0
                  ? 'Kaydedilecek yeni işlem yok'
                  : `${unsavedCount} işlemi kalıcı olarak kaydet`
              }
              className="ml-auto flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer flex-shrink-0"
            >
              {busy ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : unsavedCount === 0 ? (
                <Check className="w-3 h-3" />
              ) : (
                <Save className="w-3 h-3" />
              )}
              {unsavedCount === 0 ? 'Kaydedildi' : `Kaydet (${unsavedCount})`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
