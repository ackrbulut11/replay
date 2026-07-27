/**
 * Admin Paneli.
 *
 * Platform istatistikleri ve kayıtlı kullanıcı listesi. Sekme yalnızca
 * is_admin olan hesaplara gösterilir; yetki her hâlükârda sunucuda
 * ADMIN_EMAILS ile doğrulanır.
 */

import React from 'react';
import { Users, SlidersHorizontal, Bell, Star, RefreshCw, ShieldAlert } from 'lucide-react';
import { getAdminStats, getAdminUsers, type AdminStats, type AdminUserItem } from '../services/adminApi';

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Son giriş için tarih + saat; "hiç giriş yapmamış" durumunu ayırt eder. */
function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const StatCard: React.FC<{ label: string; value: number; icon: any }> = ({ label, value, icon: Icon }) => (
  <div className="bg-[#0d1321]/80 border border-slate-800/80 rounded-xl p-4 flex items-center gap-3">
    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 flex-shrink-0">
      <Icon className="w-5 h-5" />
    </div>
    <div className="min-w-0">
      {/* Dar ekranda kırpmak yerine alt satıra kaydır; "TOPLA..." okunmuyordu. */}
      <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wider leading-tight">{label}</div>
      <div className="text-xl font-bold text-slate-100 font-mono leading-tight">{value}</div>
    </div>
  </div>
);

export default function AdminPage() {
  const [stats, setStats] = React.useState<AdminStats | null>(null);
  const [users, setUsers] = React.useState<AdminUserItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, u] = await Promise.all([getAdminStats(), getAdminUsers()]);
      setStats(s);
      setUsers(u);
    } catch (err: any) {
      setError(err?.message || 'Admin verileri yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="h-full w-full overflow-auto bg-[#070b13] p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider">Admin Paneli</h2>
          <p className="text-xs text-slate-500 mt-0.5">Platform istatistikleri ve kayıtlı kullanıcılar</p>
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
          <ShieldAlert className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-300">{error}</p>
            <p className="text-xs text-slate-400 mt-1">
              403 alıyorsanız hesabınızın e-postası sunucudaki ADMIN_EMAILS listesinde değildir.
            </p>
          </div>
        </div>
      )}

      {loading && !stats && (
        <div className="flex items-center justify-center py-16 text-slate-500 text-sm gap-3">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          Yükleniyor...
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Toplam Kullanıcı" value={stats.total_users} icon={Users} />
          <StatCard label="Toplam Strateji" value={stats.total_strategies} icon={SlidersHorizontal} />
          <StatCard label="Toplam Alarm" value={stats.total_alerts} icon={Bell} />
          <StatCard label="İzlenen Parite" value={stats.total_watchlist_symbols} icon={Star} />
        </div>
      )}

      {users.length > 0 && (
        <div className="bg-[#0d1321]/80 border border-slate-800/80 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800/80">
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              Kayıtlı Kullanıcılar ({users.length})
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-800/60">
                  <th className="text-left font-semibold px-4 py-2.5">Kullanıcı</th>
                  <th className="text-left font-semibold px-4 py-2.5">Katılım</th>
                  <th className="text-left font-semibold px-4 py-2.5">Son Giriş</th>
                  <th className="text-right font-semibold px-4 py-2.5">Strateji</th>
                  <th className="text-right font-semibold px-4 py-2.5">Alarm</th>
                  <th className="text-left font-semibold px-4 py-2.5">Alarm Pariteleri</th>
                  <th className="text-right font-semibold px-4 py-2.5">Favori</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-slate-800/40 last:border-0 hover:bg-slate-800/20">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt="" className="w-7 h-7 rounded-full flex-shrink-0" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 text-[10px] font-bold flex-shrink-0">
                            {(u.name || u.email).charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-slate-200 font-medium truncate">{u.name || '—'}</div>
                          <div className="text-slate-500 font-mono text-[11px] truncate">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-slate-400 font-mono whitespace-nowrap">{formatDate(u.created_at)}</td>
                    <td className="px-4 py-2.5 text-slate-400 font-mono whitespace-nowrap">
                      {u.last_login_at ? formatDateTime(u.last_login_at) : (
                        <span className="text-slate-600 italic font-sans">hiç giriş yapmadı</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-200 font-mono">{u.strategies_count}</td>
                    <td className="px-4 py-2.5 text-right text-slate-200 font-mono">{u.alerts_count}</td>
                    <td className="px-4 py-2.5">
                      {u.alert_symbols.length === 0 ? (
                        <span className="text-slate-600">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1 max-w-[240px]">
                          {u.alert_symbols.map((sym) => (
                            <span
                              key={sym}
                              className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono text-[10px] whitespace-nowrap"
                            >
                              {sym}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-200 font-mono">{u.watchlist_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && !error && users.length === 0 && (
        <div className="text-center py-12 text-slate-500 text-sm">Henüz kayıtlı kullanıcı yok.</div>
      )}
    </div>
  );
}
