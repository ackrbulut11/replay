/**
 * Manuel oturum ↔ strateji karşılaştırma paneli.
 *
 * Platformun asıl iddiası bu: "elle şu sonucu aldım, aynı dönemde stratejim
 * şunu alırdı". İki motor da vardı ama hiçbir yerde yan yana konmuyordu.
 *
 * Hesaplama burada YAPILMAZ — backend `engines/comparison.py` iki tarafı da
 * aynı performans raporundan geçirip farkları hazır döndürür (RULES.md
 * "Yasaklar": finansal hesap arayüze yazılmaz).
 */

import { useEffect, useMemo, useState } from 'react';
import { GitCompareArrows, Loader2, AlertTriangle } from 'lucide-react';

import { compareSessionWithStrategy } from '../services/journalApi';
import { strategyStore, useStrategyStore } from '../store/strategyStore';
import type { JournalTrade, SessionComparison } from '../types/journal';
import type { Strategy } from '../types/strategy';

interface SessionComparisonPanelProps {
  /** Oturum listesi bunlardan türetilir; günlükte zaten yüklü. */
  trades: JournalTrade[];
}

/** Tanımsız metrikleri "—" olarak gösterir (0 yazmak "kötü" gibi okunurdu). */
function metric(value: number | null | undefined, suffix = '', digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value.toFixed(digits)}${suffix}`;
}

/** Farkı işaretiyle birlikte yazar; pozitif = strateji önde. */
function delta(value: number | null | undefined, suffix = ''): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}${suffix}`;
}

const VERDICT_TEXT: Record<SessionComparison['verdict'], string> = {
  strateji: 'Bu dönemde strateji daha iyi sonuç verirdi',
  manuel: 'Bu dönemde sizin elle yaptığınız işlemler daha iyi',
  berabere: 'İki taraf da aynı net sonucu verdi',
  belirsiz: 'Karşılaştırma için yeterli veri yok',
};

export default function SessionComparisonPanel({ trades }: SessionComparisonPanelProps) {
  const strategyState = useStrategyStore();
  const [sessionId, setSessionId] = useState('');
  const [strategyId, setStrategyId] = useState('');
  const [result, setResult] = useState<SessionComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Oturumlar işlemlerden türetilir: ayrı bir uç açmaya gerek yok, günlük
  // zaten hepsini yüklü tutuyor.
  const sessions = useMemo(() => {
    const seen = new Map<string, { id: string; symbol: string; count: number }>();
    for (const trade of trades) {
      if (!trade.session_id || trade.status !== 'CLOSED') continue;
      const existing = seen.get(trade.session_id);
      if (existing) existing.count += 1;
      else seen.set(trade.session_id, { id: trade.session_id, symbol: trade.symbol, count: 1 });
    }
    return [...seen.values()];
  }, [trades]);

  useEffect(() => {
    if (strategyState.strategies.length === 0) strategyStore.fetchStrategies();
  }, [strategyState.strategies.length]);

  // Seçim listeleri değişince geçersiz kalan seçimi düşür.
  useEffect(() => {
    if (sessionId && !sessions.some((s) => s.id === sessionId)) setSessionId('');
  }, [sessions, sessionId]);

  const handleCompare = async () => {
    if (!sessionId || !strategyId) return;
    setLoading(true);
    setError(null);
    try {
      setResult(await compareSessionWithStrategy(sessionId, strategyId));
    } catch (err: any) {
      setResult(null);
      setError(err?.message || 'Karşılaştırma yapılamadı.');
    } finally {
      setLoading(false);
    }
  };

  const rows = result
    ? [
        {
          label: 'Net Kâr',
          manual: metric(result.manual.net_profit),
          strategy: metric(result.strategy.performance.net_profit),
          diff: delta(result.delta.net_profit),
          positiveIsBetter: true,
          diffValue: result.delta.net_profit,
        },
        {
          label: 'Başarı Oranı',
          manual: metric(result.manual.win_rate, '%'),
          strategy: metric(result.strategy.performance.win_rate, '%'),
          diff: delta(result.delta.win_rate, '%'),
          positiveIsBetter: true,
          diffValue: result.delta.win_rate,
        },
        {
          label: 'Profit Factor',
          manual: metric(result.manual.profit_factor),
          strategy: metric(result.strategy.performance.profit_factor),
          diff: delta(result.delta.profit_factor),
          positiveIsBetter: true,
          diffValue: result.delta.profit_factor,
        },
        {
          label: 'Max Düşüş',
          manual: metric(result.manual.max_drawdown_pct, '%'),
          strategy: metric(result.strategy.performance.max_drawdown_pct, '%'),
          diff: delta(result.delta.max_drawdown_pct, '%'),
          // Drawdown'da AZ olan iyidir; renk mantığı ters çevrilir.
          positiveIsBetter: false,
          diffValue: result.delta.max_drawdown_pct,
        },
        {
          label: 'İşlem Sayısı',
          manual: String(result.manual.total_trades),
          strategy: String(result.strategy.performance.total_trades),
          diff: delta(result.delta.total_trades),
          positiveIsBetter: true,
          diffValue: null, // Çok/az işlem tek başına iyi ya da kötü değil.
        },
      ]
    : [];

  return (
    <section className="bg-[#0d1321]/80 border border-slate-800/60 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-800/60 flex-wrap">
        <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
          <GitCompareArrows className="w-4 h-4 text-indigo-400" />
          Manuel vs Strateji
        </h3>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            className="bg-slate-950 border border-slate-700/80 rounded-lg px-2 py-1 text-[11px] text-slate-200 outline-none cursor-pointer"
          >
            <option value="">Replay oturumu seçin…</option>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.symbol} — {session.count} işlem
              </option>
            ))}
          </select>

          <select
            value={strategyId}
            onChange={(e) => setStrategyId(e.target.value)}
            className="bg-slate-950 border border-slate-700/80 rounded-lg px-2 py-1 text-[11px] text-slate-200 outline-none cursor-pointer"
          >
            <option value="">Strateji seçin…</option>
            {strategyState.strategies.map((strategy: Strategy) => (
              <option key={strategy.id} value={strategy.id}>
                {strategy.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleCompare}
            disabled={!sessionId || !strategyId || loading}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer bg-indigo-500/20 border-indigo-500/50 text-indigo-200 hover:bg-indigo-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Karşılaştır
          </button>
        </div>
      </div>

      {sessions.length === 0 && (
        <p className="px-4 py-6 text-center text-xs text-slate-600">
          Karşılaştırma için kapanmış işlemi olan bir replay oturumu gerekiyor.
        </p>
      )}

      {error && (
        <div className="flex items-start gap-2 px-4 py-3 text-xs text-amber-300 bg-amber-950/30 border-b border-amber-800/40">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="p-4 space-y-3">
          <div
            className={`px-3 py-2 rounded-lg border text-xs font-semibold ${
              result.verdict === 'strateji'
                ? 'bg-indigo-950/40 border-indigo-800/50 text-indigo-300'
                : result.verdict === 'manuel'
                  ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300'
                  : 'bg-slate-900/60 border-slate-800/60 text-slate-300'
            }`}
          >
            {VERDICT_TEXT[result.verdict]}
            <span className="block mt-0.5 font-normal text-slate-400 font-mono text-[11px]">
              {result.symbol} · {result.timeframe} ·{' '}
              {result.window.start.slice(0, 10)} → {result.window.end.slice(0, 10)}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-800/60">
                  <th className="text-left font-semibold px-3 py-2">Metrik</th>
                  <th className="text-right font-semibold px-3 py-2">Siz (manuel)</th>
                  <th className="text-right font-semibold px-3 py-2">Strateji</th>
                  <th className="text-right font-semibold px-3 py-2">Fark</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label} className="border-b border-slate-900/60 last:border-0">
                    <td className="px-3 py-2 text-slate-300">{row.label}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-200">{row.manual}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-200">{row.strategy}</td>
                    <td
                      className={`px-3 py-2 text-right font-mono font-semibold ${
                        row.diffValue === null || row.diffValue === undefined
                          ? 'text-slate-500'
                          : (row.diffValue >= 0) === row.positiveIsBetter
                            ? 'text-emerald-400'
                            : 'text-red-400'
                      }`}
                    >
                      {row.diff}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.strategy.buy_and_hold?.return_pct != null && (
            <p className="text-[11px] text-slate-500">
              Aynı dönemde al-tut getirisi:{' '}
              <span className="font-mono text-slate-400">
                {result.strategy.buy_and_hold.return_pct >= 0 ? '+' : ''}
                {result.strategy.buy_and_hold.return_pct.toFixed(2)}%
              </span>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
