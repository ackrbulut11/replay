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
import { errorMessage } from '../utils/errors';

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
    tone === 'good' ? 'text-profit-400' : tone === 'bad' ? 'text-loss-400' : 'text-content';
  return (
    <div className="bg-surface-raised px-2 py-1.5 flex flex-col gap-0.5">
      <span className="text-2xs text-content-faint">{label}</span>
      <span className={`text-2xs font-medium font-mono ${color}`}>{value}</span>
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
    } catch (err: unknown) {
      setError(errorMessage(err, 'Geçmiş kaydedilemedi.'));
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
        className="grid grid-cols-[auto_1fr_1fr_auto] gap-x-2 items-center px-2 py-1 text-2xs font-mono border-t border-line hover:bg-white/[0.03]"
      >
        <span
          className={`font-medium ${isLong ? 'text-profit-400' : 'text-loss-400'}`}
          title={isLong ? 'Long pozisyon' : 'Short pozisyon'}
        >
          {isLong ? 'L' : 'S'}
        </span>

        <span className="text-content-muted truncate" title={`Giriş: ${formatDate(trade.entry_time)}`}>
          <span className="text-content-faint">{formatDate(trade.entry_time)}</span>{' '}
          <span className="text-content">{formatPrice(trade.entry_price)}</span>
        </span>

        <span className="text-content-muted truncate" title={`Çıkış: ${formatDate(trade.exit_time)}`}>
          {isOpenPosition ? (
            <span className="text-warn-400/80">açık</span>
          ) : (
            <>
              <span className="text-content-faint">{formatDate(trade.exit_time)}</span>{' '}
              <span className="text-content">{formatPrice(trade.exit_price)}</span>
            </>
          )}
        </span>

        <span
          className={`text-right font-medium tabular-nums ${
            isOpenPosition ? 'text-content-faint' : (pnl ?? 0) >= 0 ? 'text-profit-400' : 'text-loss-400'
          }`}
        >
          {isOpenPosition ? '—' : formatPercent(pnl)}
          {trade.is_saved && <span className="ml-1 text-accent-400" title="Kalıcı kaydedildi">•</span>}
        </span>
      </div>
    );
  };

  return (
    // transform JSX'te verilmez; sürükleme sırasında doğrudan DOM'a yazılır
    // (bkz. useDraggablePanel).
    <div
      ref={panelRef}
      className="w-[420px] max-w-full bg-canvas border border-white/[0.1] rounded-lg shadow-2xl backdrop-blur-md text-content-strong select-none overflow-hidden"
    >
      {/* Başlık: tutamaçtan sürüklenir, gerisine tıklanınca açılır/kapanır. */}
      <div className="flex items-center gap-1.5 px-2 py-1">
        <span
          onMouseDown={handleDragStart}
          title="Sürükleyerek taşı"
          className="flex items-center cursor-grab active:cursor-grabbing -ml-0.5 pr-0.5"
        >
          <GripHorizontal className="w-3 h-3 text-content-faint" />
        </span>

        <button
          type="button"
          onClick={() => setIsOpen((v) => !v)}
          title={isOpen ? 'Geçmişi gizle' : 'Geçmişi göster'}
          className="flex-1 flex items-center gap-1.5 hover:opacity-80 transition-opacity cursor-pointer"
        >
          {isOpen ? (
            <ChevronDown className="w-3.5 h-3.5 text-content-faint" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-content-faint" />
          )}
          <History className="w-3 h-3 text-accent-400" />
          <span className="font-mono text-2xs tracking-[0.15em] text-accent-400 font-medium">
            Geçmiş
          </span>
          <span className="text-2xs font-mono text-content-faint">({trades.length})</span>
          {loading && <Loader2 className="w-3 h-3 animate-spin text-content-faint" />}

          {/* Toplam durum — panel kapalıyken de görünür. */}
          {totalPercent !== null && (
            <span
              className={`ml-auto text-2xs font-mono font-medium tabular-nums ${
                totalPercent >= 0 ? 'text-profit-400' : 'text-loss-400'
              }`}
              title="Pozisyon büyüklüğüne göre ağırlıklı toplam kâr/zarar"
            >
              {formatPercent(totalPercent)}
            </span>
          )}
          <span
            className={`${totalPercent !== null ? '' : 'ml-auto'} text-2xs font-mono text-content-faint`}
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
            <div className="grid grid-cols-3 gap-px bg-white/[0.06] border-t border-line">
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
            <div className="px-2 py-3 text-2xs text-content-faint text-center border-t border-line">
              Bu paritede henüz işlem yok.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-x-2 px-2 py-1 text-2xs text-content-faint border-t border-line">
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
                <span className="text-2xs text-content-faint">Toplam</span>
                <span className="text-2xs text-content-faint">
                  {closedCount} kapalı işlem, büyüklüğe göre ağırlıklı
                </span>
                <span
                  className={`ml-auto text-2xs font-mono font-medium tabular-nums ${
                    totalPercent === null
                      ? 'text-content-faint'
                      : totalPercent >= 0
                        ? 'text-profit-400'
                        : 'text-loss-400'
                  }`}
                >
                  {totalPercent === null ? '—' : formatPercent(totalPercent)}
                </span>
              </div>
            </>
          )}

          {error && (
            <div className="flex items-start gap-1 px-2 py-1 text-2xs text-loss-400 bg-loss-500/10 border-t border-loss-500/30">
              <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-px" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center gap-2 px-2 py-1.5 border-t border-line">
            <span className="text-2xs text-content-faint leading-tight">
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
              className="ml-auto flex items-center gap-1 px-2 py-1 text-2xs font-medium rounded bg-accent-500/15 text-accent-300 border border-accent-500/40 hover:bg-accent-300/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer flex-shrink-0"
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
