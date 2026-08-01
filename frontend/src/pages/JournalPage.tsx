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
} from 'lucide-react';

import { deleteTrade, getPerformance, getTrades, updateTrade } from '../services/journalApi';
import { logError } from '../services/eventLog';
import type { JournalTrade, PerformanceReport, TradeStatus } from '../types/journal';

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
  <div className="bg-[#0d1321]/80 border border-slate-800/80 rounded-xl px-3 py-2.5">
    <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wider leading-tight">
      {label}
    </div>
    <div
      className={`text-lg font-bold font-mono leading-tight mt-0.5 ${
        tone === 'good' ? 'text-emerald-400' : tone === 'bad' ? 'text-red-400' : 'text-slate-100'
      }`}
    >
      {value}
    </div>
  </div>
);

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
    } catch (err: any) {
      setError(err?.message || 'İşlem günlüğü yüklenemedi.');
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
    } catch (err: any) {
      setError(err?.message || 'İşlem silinemedi.');
      logError('journal_delete_failed', err, { tradeId });
    }
  };

  const handleSaveNotes = (updated: JournalTrade) => {
    setTrades((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  };

  return (
    <div className="h-full w-full overflow-auto custom-scrollbar bg-[#070b13] p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-indigo-400" />
            İşlem Günlüğü
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manuel backtest işlemleri ve performans raporu
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-xs font-semibold text-slate-200 transition-all disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Yenile
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm font-semibold text-red-300">{error}</p>
        </div>
      )}

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

      <div className="bg-[#0d1321]/80 border border-slate-800/80 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800/80 flex items-center justify-between gap-3">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
            İşlemler ({trades.length})
          </h3>
          <div className="flex items-center gap-2">
            {(['', 'OPEN', 'CLOSED'] as const).map((value) => (
              <button
                key={value || 'all'}
                type="button"
                onClick={() => setStatusFilter(value)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                  statusFilter === value
                    ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300'
                    : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:bg-slate-800/70'
                }`}
              >
                {value === '' ? 'Tümü' : value === 'OPEN' ? 'Açık' : 'Kapalı'}
              </button>
            ))}
          </div>
        </div>

        {loading && trades.length === 0 && (
          <div className="flex items-center gap-2 px-4 py-8 text-xs text-slate-500 justify-center">
            <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            Yükleniyor...
          </div>
        )}

        {!loading && trades.length === 0 && (
          <div className="px-4 py-10 text-center text-xs text-slate-600">
            Henüz işlem yok. Replay modunda bir pozisyon açtığınızda burada görünür.
          </div>
        )}

        {trades.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-800/60">
                  <th className="text-left font-semibold px-4 py-2.5 w-6"></th>
                  <th className="text-left font-semibold px-4 py-2.5">Sembol</th>
                  <th className="text-left font-semibold px-4 py-2.5">Yön</th>
                  <th className="text-right font-semibold px-4 py-2.5">Giriş</th>
                  <th className="text-right font-semibold px-4 py-2.5">Çıkış</th>
                  <th className="text-right font-semibold px-4 py-2.5">K/Z</th>
                  <th className="text-left font-semibold px-4 py-2.5">Sebep</th>
                  <th className="text-left font-semibold px-4 py-2.5">Tarih</th>
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
                        className={`border-b border-slate-800/40 last:border-0 hover:bg-slate-800/20 cursor-pointer transition-colors ${
                          isExpanded ? 'bg-slate-800/30' : ''
                        }`}
                      >
                        <td className="px-4 py-2.5">
                          <ChevronDown
                            className={`w-3.5 h-3.5 text-slate-500 transition-transform ${
                              isExpanded ? 'rotate-180' : ''
                            }`}
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="text-slate-200 font-medium">{trade.symbol}</div>
                          <div className="text-slate-500 font-mono text-[10px]">
                            {trade.provider} · {trade.timeframe}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`flex items-center gap-1 font-semibold ${
                              trade.side === 'long' ? 'text-emerald-400' : 'text-red-400'
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
                        <td className="px-4 py-2.5 text-right font-mono text-slate-300">
                          {formatNumber(trade.entry_price, 8)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-slate-300">
                          {trade.status === 'OPEN' ? (
                            <span className="text-amber-400 font-sans text-[10px] font-semibold">
                              AÇIK
                            </span>
                          ) : (
                            formatNumber(trade.exit_price, 8)
                          )}
                        </td>
                        <td
                          className={`px-4 py-2.5 text-right font-mono font-semibold ${
                            trade.status === 'OPEN'
                              ? 'text-slate-600'
                              : isProfit
                              ? 'text-emerald-400'
                              : 'text-red-400'
                          }`}
                        >
                          {trade.status === 'OPEN' ? '—' : formatNumber(trade.pnl)}
                          {trade.status === 'CLOSED' &&
                            trade.pnl_percent !== null &&
                            trade.pnl_percent !== undefined && (
                              <div className="text-[10px] font-normal opacity-80">
                                {formatPercent(trade.pnl_percent)}
                              </div>
                            )}
                        </td>
                        <td className="px-4 py-2.5 text-slate-400 max-w-[180px] truncate">
                          {trade.exit_reason && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 mr-1.5">
                              {EXIT_REASON_LABELS[trade.exit_reason] || trade.exit_reason}
                            </span>
                          )}
                          {trade.reason || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-slate-400 font-mono whitespace-nowrap text-[11px]">
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
                            className="p-1 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-[#070b13]/60 border-b border-slate-800/40">
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
    } catch (err: any) {
      setError(err?.message || 'Kaydedilemedi.');
      logError('journal_update_failed', err, { tradeId: trade.id });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-6 py-4 space-y-3">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Giriş Sebebi
          </span>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Bu işleme neden girdin?"
            className="w-full bg-slate-950 border border-slate-700/80 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:border-indigo-500 outline-none"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Ekran Görüntüsü (URL)
          </span>
          <input
            type="text"
            value={screenshot}
            onChange={(e) => setScreenshot(e.target.value)}
            placeholder="https://..."
            className="w-full bg-slate-950 border border-slate-700/80 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:border-indigo-500 outline-none font-mono"
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Notlar</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Ne öğrendin? Neyi farklı yapardın?"
          className="w-full bg-slate-950 border border-slate-700/80 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:border-indigo-500 outline-none resize-y custom-scrollbar"
        />
      </label>

      {screenshot.trim() && (
        <img
          src={screenshot}
          alt="İşlem ekran görüntüsü"
          className="max-h-64 rounded-lg border border-slate-800"
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
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold disabled:opacity-50 transition-all cursor-pointer"
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? 'Kaydediliyor...' : 'Kaydet'}
        </button>
        {saved && <span className="text-[11px] text-emerald-400">Kaydedildi</span>}
        {error && <span className="text-[11px] text-red-400">{error}</span>}
      </div>
    </div>
  );
}
