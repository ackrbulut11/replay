/**
 * Trade Journal sayfası (Faz 4).
 *
 * Manuel backtest sırasında açılan işlemlerin listesi, işlem başına
 * not / sebep / ekran görüntüsü düzenleme ve performans raporu.
 *
 * Metrikler burada HESAPLANMAZ: Win Rate, Profit Factor, Sharpe, Drawdown
 * vb. backend'de `reports/performance_report.py` içinde üretilir ve
 * `/api/journal/performance` ucundan hazır gelir (RULES.md "Yasaklar").
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Trash2,
  AlertTriangle,
  Save,
  ChevronDown,
  Download,
} from 'lucide-react';

import { deleteTrade, getPerformance, getTrades, updateTrade } from '../services/journalApi';
import { logError } from '../services/eventLog';
import type { JournalTrade, PerformanceReport, TradeStatus } from '../types/journal';
import { csvNumber, csvTimestamp, downloadCsv } from '../utils/csv';
import SessionComparisonPanel from '../journal/SessionComparison';
import { errorMessage } from '../utils/errors';

const STARTING_BALANCE = 10000;

function formatNumber(value?: number | null, digits = 2): string {
  if (value === undefined || value === null) return '—';
  return value.toLocaleString('tr-TR', { maximumFractionDigits: digits });
}

function formatPercent(value?: number | null): string {
  if (value === undefined || value === null) return '—';
  return `${value.toFixed(2)}%`;
}

function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}

const EXIT_REASON_LABELS: Record<string, string> = {
  stop_loss: 'Stop',
  take_profit: 'Hedef',
  manual: 'Manuel',
};

/** Tek bir performans metriği kartı. */
const MetricCard: React.FC<{ label: string; value: string; tone?: 'good' | 'bad' | 'neutral' }> = ({
  label,
  value,
  tone = 'neutral',
}) => (
  <div className="bg-surface-raised border border-line rounded-xl px-3 py-2.5">
    <div className="text-2xs text-content-faint font-medium leading-tight">
      {label}
    </div>
    <div
      className={`text-lg font-medium font-mono leading-tight mt-0.5 ${
        tone === 'good' ? 'text-profit-400' : tone === 'bad' ? 'text-loss-400' : 'text-content-strong'
      }`}
    >
      {value}
    </div>
  </div>
);

/**
 * İşlem günlüğünü CSV olarak indirir.
 *
 * Ekrandaki filtre neyse o dışa aktarılır — kullanıcı "Kapalı" filtresini
 * seçmişken tüm işlemleri indirmek şaşırtıcı olurdu.
 */
function exportTradesCsv(trades: JournalTrade[]): void {
  const rows = trades.map((trade) => [
    trade.symbol,
    trade.side === 'long' ? 'Long' : 'Short',
    trade.status === 'OPEN' ? 'Açık' : 'Kapalı',
    csvNumber(trade.entry_price, 4),
    csvNumber(trade.exit_price, 4),
    csvNumber(trade.quantity, 4),
    csvNumber(trade.stop_loss, 4),
    csvNumber(trade.take_profit, 4),
    csvNumber(trade.pnl),
    csvNumber(trade.pnl_percent),
    trade.exit_reason ?? '',
    trade.entry_time ?? '',
    trade.exit_time ?? '',
    trade.reason ?? '',
    trade.notes ?? '',
  ]);

  downloadCsv(
    `islem-gunlugu_${csvTimestamp()}`,
    [
      'Sembol', 'Yön', 'Durum', 'Giriş', 'Çıkış', 'Miktar',
      'Stop', 'Hedef', 'K/Z', 'K/Z (%)', 'Çıkış Sebebi',
      'Giriş Zamanı', 'Çıkış Zamanı', 'Sebep', 'Not',
    ],
    rows,
  );
}

export default function JournalPage() {
  const [trades, setTrades] = useState<JournalTrade[]>([]);
  const [performance, setPerformance] = useState<PerformanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<TradeStatus | ''>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tradeList, report] = await Promise.all([
        getTrades({ status: statusFilter || undefined, limit: 500 }),
        getPerformance({ startingBalance: STARTING_BALANCE }),
      ]);
      setTrades(tradeList);
      setPerformance(report);
    } catch (err: unknown) {
      setError(errorMessage(err, 'İşlem günlüğü yüklenemedi.'));
      logError('journal_load_failed', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (tradeId: string) => {
    try {
      await deleteTrade(tradeId);
      setTrades((prev) => prev.filter((t) => t.id !== tradeId));
      // Silinen işlem rapora dahildi; metrikleri tazele.
      setPerformance(await getPerformance({ startingBalance: STARTING_BALANCE }));
    } catch (err: unknown) {
      setError(errorMessage(err, 'İşlem silinemedi.'));
      logError('journal_delete_failed', err, { tradeId });
    }
  };

  const handleSaveNotes = (updated: JournalTrade) => {
    setTrades((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  };

  return (
    <div className="h-full w-full overflow-auto custom-scrollbar bg-canvas p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-content-strong flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-accent-400" />
            İşlem Günlüğü
          </h2>
          <p className="text-xs text-content-faint mt-0.5">
            Manuel backtest işlemleri ve performans raporu
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-hover hover:bg-surface-hover border border-line-strong text-xs font-medium text-content transition-all disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Yenile
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-3 bg-loss-500/10 border border-loss-500/30 rounded-xl p-4">
          <AlertTriangle className="w-5 h-5 text-loss-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm font-medium text-loss-300">{error}</p>
        </div>
      )}

      {/*
        Manuel sonucu aynı pencerede strateji sonucuyla karşılaştırır.
        Platformun asıl iddiası bu; iki motor da vardı ama yan yana
        konmuyordu (bkz. backend engines/comparison.py).
      */}
      <SessionComparisonPanel trades={trades} />

      {performance && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard
              label="Net Kâr"
              value={formatNumber(performance.net_profit)}
              tone={performance.net_profit >= 0 ? 'good' : 'bad'}
            />
            <MetricCard label="Kazanma Oranı" value={formatPercent(performance.win_rate)} />
            <MetricCard label="Kaybetme Oranı" value={formatPercent(performance.loss_rate)} />
            <MetricCard
              label="Profit Factor"
              value={
                performance.total_trades === 0
                  ? '—'
                  : performance.profit_factor === null
                  ? '∞'
                  : formatNumber(performance.profit_factor)
              }
            />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard
              label="Sharpe"
              value={performance.sharpe_ratio === null ? '—' : formatNumber(performance.sharpe_ratio)}
            />
            <MetricCard
              label="Max Drawdown"
              value={formatPercent(performance.max_drawdown_pct)}
              tone={performance.max_drawdown > 0 ? 'bad' : 'neutral'}
            />
            <MetricCard label="Toplam İşlem" value={String(performance.total_trades)} />
            <MetricCard label="Son Bakiye" value={formatNumber(performance.ending_balance)} />
          </div>
        </>
      )}

      <div className="bg-surface-raised border border-line rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-line flex items-center justify-between gap-3">
          <h3 className="text-xs font-medium text-content">
            İşlemler ({trades.length})
          </h3>
          <div className="flex items-center gap-2">
            {(['', 'OPEN', 'CLOSED'] as const).map((value) => (
              <button
                key={value || 'all'}
                type="button"
                onClick={() => setStatusFilter(value)}
                className={`px-2.5 py-1 rounded-lg text-2xs font-medium border transition-colors cursor-pointer ${
                  statusFilter === value
                    ? 'bg-accent-500/20 border-accent-500/50 text-accent-300'
                    : 'bg-surface-hover border-line-strong text-content-muted hover:bg-surface-hover'
                }`}
              >
                {value === '' ? 'Tümü' : value === 'OPEN' ? 'Açık' : 'Kapalı'}
              </button>
            ))}

            <button
              type="button"
              onClick={() => exportTradesCsv(trades)}
              disabled={trades.length === 0}
              title="Ekrandaki işlemleri CSV olarak indir (Excel uyumlu)"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-2xs font-medium border transition-colors cursor-pointer bg-surface-hover border-line-strong text-content hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-3.5 h-3.5" />
              CSV
            </button>
          </div>
        </div>

        {loading && trades.length === 0 && (
          <div className="flex items-center gap-2 px-4 py-8 text-xs text-content-faint justify-center">
            <div className="w-4 h-4 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
            Yükleniyor...
          </div>
        )}

        {!loading && trades.length === 0 && (
          <div className="px-4 py-10 text-center text-xs text-content-faint">
            Henüz işlem yok. Replay modunda bir pozisyon açtığınızda burada görünür.
          </div>
        )}

        {trades.length > 0 && (
          /* `min-w`siz bir `w-full` tablo kaba sığmak için sıkışır, kaymaz:
             dokuz sütun telefonda okunamaz hâle geliyordu. */
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full min-w-[760px] text-xs">
              <thead>
                <tr className="text-content-faint border-b border-line">
                  <th className="text-left font-medium px-4 py-2.5 w-6"></th>
                  <th className="text-left font-medium px-4 py-2.5">Sembol</th>
                  <th className="text-left font-medium px-4 py-2.5">Yön</th>
                  <th className="text-right font-medium px-4 py-2.5">Giriş</th>
                  <th className="text-right font-medium px-4 py-2.5">Çıkış</th>
                  <th className="text-right font-medium px-4 py-2.5">K/Z</th>
                  <th className="text-left font-medium px-4 py-2.5">Sebep</th>
                  <th className="text-left font-medium px-4 py-2.5">Tarih</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {trades.map((trade) => {
                  const isExpanded = expandedId === trade.id;
                  const isProfit = (trade.pnl ?? 0) >= 0;
                  return (
                    <React.Fragment key={trade.id}>
                      <tr
                        onClick={() => setExpandedId(isExpanded ? null : trade.id)}
                        className={`border-b border-line last:border-0 hover:bg-surface-hover cursor-pointer transition-colors ${
                          isExpanded ? 'bg-surface-hover' : ''
                        }`}
                      >
                        <td className="px-4 py-2.5">
                          <ChevronDown
                            className={`w-3.5 h-3.5 text-content-faint transition-transform ${
                              isExpanded ? 'rotate-180' : ''
                            }`}
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="text-content font-medium">{trade.symbol}</div>
                          <div className="text-content-faint font-mono text-2xs">
                            {trade.provider} · {trade.timeframe}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`flex items-center gap-1 font-medium ${
                              trade.side === 'long' ? 'text-profit-400' : 'text-loss-400'
                            }`}
                          >
                            {trade.side === 'long' ? (
                              <TrendingUp className="w-3 h-3" />
                            ) : (
                              <TrendingDown className="w-3 h-3" />
                            )}
                            {trade.side === 'long' ? 'Long' : 'Short'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-content">
                          {formatNumber(trade.entry_price, 8)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-content">
                          {trade.status === 'OPEN' ? (
                            <span className="text-warn-400 font-sans text-2xs font-medium">
                              AÇIK
                            </span>
                          ) : (
                            formatNumber(trade.exit_price, 8)
                          )}
                        </td>
                        <td
                          className={`px-4 py-2.5 text-right font-mono font-medium ${
                            trade.status === 'OPEN'
                              ? 'text-content-faint'
                              : isProfit
                              ? 'text-profit-400'
                              : 'text-loss-400'
                          }`}
                        >
                          {trade.status === 'OPEN' ? '—' : formatNumber(trade.pnl)}
                          {trade.status === 'CLOSED' &&
                            trade.pnl_percent !== null &&
                            trade.pnl_percent !== undefined && (
                              <div className="text-2xs font-normal opacity-80">
                                {formatPercent(trade.pnl_percent)}
                              </div>
                            )}
                        </td>
                        <td className="px-4 py-2.5 text-content-muted max-w-[180px] truncate">
                          {trade.exit_reason && (
                            <span className="text-2xs px-1.5 py-0.5 rounded bg-surface-hover border border-line-strong text-content mr-1.5">
                              {EXIT_REASON_LABELS[trade.exit_reason] || trade.exit_reason}
                            </span>
                          )}
                          {trade.reason || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-content-muted font-mono whitespace-nowrap text-2xs">
                          {formatDateTime(trade.closed_at || trade.created_at)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(trade.id);
                            }}
                            title="İşlemi sil"
                            className="p-1 text-loss-400/60 hover:text-loss-400 hover:bg-loss-500/10 rounded transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-canvas border-b border-line">
                          <td colSpan={9} className="p-0">
                            <TradeNotesEditor trade={trade} onSaved={handleSaveNotes} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/** Bir işlemin not / sebep / ekran görüntüsü alanlarını düzenler. */
function TradeNotesEditor({
  trade,
  onSaved,
}: {
  trade: JournalTrade;
  onSaved: (updated: JournalTrade) => void;
}) {
  const [reason, setReason] = useState(trade.reason || '');
  const [notes, setNotes] = useState(trade.notes || '');
  const [screenshot, setScreenshot] = useState(trade.screenshot || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateTrade(trade.id, {
        reason: reason.trim() || null,
        notes: notes.trim() || null,
        screenshot: screenshot.trim() || null,
      });
      onSaved(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Kaydedilemedi.'));
      logError('journal_update_failed', err, { tradeId: trade.id });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-6 py-4 space-y-3">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-2xs font-medium text-content-faint">
            Giriş Sebebi
          </span>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Bu işleme neden girdin?"
            className="w-full bg-canvas border border-line-strong text-content text-xs rounded-lg px-2.5 py-1.5 focus:border-accent-500 outline-none"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-2xs font-medium text-content-faint">
            Ekran Görüntüsü (URL)
          </span>
          <input
            type="text"
            value={screenshot}
            onChange={(e) => setScreenshot(e.target.value)}
            placeholder="https://..."
            className="w-full bg-canvas border border-line-strong text-content text-xs rounded-lg px-2.5 py-1.5 focus:border-accent-500 outline-none font-mono"
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-2xs font-medium text-content-faint">Notlar</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Ne öğrendin? Neyi farklı yapardın?"
          className="w-full bg-canvas border border-line-strong text-content text-xs rounded-lg px-2.5 py-1.5 focus:border-accent-500 outline-none resize-y custom-scrollbar"
        />
      </label>

      {screenshot.trim() && (
        <img
          src={screenshot}
          alt="İşlem ekran görüntüsü"
          className="max-h-64 rounded-lg border border-line"
          // Bozuk URL'de kırık ikon yerine görseli gizle.
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-600 hover:bg-accent-300 text-ink-950 text-xs font-medium disabled:opacity-50 transition-all cursor-pointer"
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? 'Kaydediliyor...' : 'Kaydet'}
        </button>
        {saved && <span className="text-2xs text-accent-400">Kaydedildi</span>}
        {error && <span className="text-2xs text-loss-400">{error}</span>}
      </div>
    </div>
  );
}
