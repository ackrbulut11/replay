/**
 * Admin Paneli.
 *
 * Platform istatistikleri ve kayıtlı kullanıcı listesi. Sekme yalnızca
 * is_admin olan hesaplara gösterilir; yetki her hâlükârda sunucuda
 * ADMIN_EMAILS ile doğrulanır.
 */

import React, { useState } from 'react';
import {
  Users, SlidersHorizontal, Bell, Star, RefreshCw, ShieldAlert,
  ChevronDown, TrendingUp, TrendingDown, Power, PowerOff, AlertTriangle,
  PenTool, BarChart2, Copy, Check, Mail, ScrollText,
} from 'lucide-react';
import {
  getAdminStats, getAdminUsers, getAdminUserDetail, cloneStrategyToMe, getAdminWaitlist, getAdminEvents,
  type AdminStats, type AdminUserItem, type AdminUserDetail, type AdminWaitlistEntry, type AdminEventEntry,
} from '../services/adminApi';
import { useAuth } from '../context/AuthContext';

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

const DRAWING_TOOL_LABELS: Record<string, string> = {
  trendLine: 'Trend Çizgisi',
  horizontalRay: 'Yatay Işın',
  rectangle: 'Dikdörtgen',
  parallelChannel: 'Paralel Kanal',
  longPosition: 'Long Pozisyon',
  shortPosition: 'Short Pozisyon',
};

/** Genel istatistik kartlarında kullanılan yatay sıralı liste (en çok kullanılan en üstte). */
const RankedList: React.FC<{
  icon: any;
  title: string;
  items: { label: string; count: number }[];
  labelFormatter?: (label: string) => string;
  barColorClass?: string;
  emptyText: string;
}> = ({ icon: Icon, title, items, labelFormatter, barColorClass = 'bg-indigo-500/60', emptyText }) => {
  const max = items.length > 0 ? Math.max(...items.map((i) => i.count)) : 0;
  return (
    <div className="bg-[#0d1321]/80 border border-slate-800/80 rounded-xl p-4">
      <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5 mb-3">
        <Icon className="w-3.5 h-3.5 text-indigo-400" />
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="text-xs text-slate-600">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-slate-300 w-28 shrink-0 truncate">
                {labelFormatter ? labelFormatter(item.label) : item.label}
              </span>
              <div className="flex-1 h-2 rounded-full bg-slate-800/80 overflow-hidden">
                <div
                  className={`h-full rounded-full ${barColorClass}`}
                  style={{ width: max > 0 ? `${Math.max((item.count / max) * 100, 4)}%` : '0%' }}
                />
              </div>
              <span className="text-[11px] font-mono text-slate-400 w-8 text-right shrink-0">{item.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default function AdminPage() {
  const { user: currentUser } = useAuth();
  const [stats, setStats] = React.useState<AdminStats | null>(null);
  const [users, setUsers] = React.useState<AdminUserItem[]>([]);
  const [waitlist, setWaitlist] = React.useState<AdminWaitlistEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [details, setDetails] = React.useState<Record<string, AdminUserDetail>>({});
  const [detailLoadingId, setDetailLoadingId] = React.useState<string | null>(null);
  const [detailErrors, setDetailErrors] = React.useState<Record<string, string>>({});

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, u, w] = await Promise.all([getAdminStats(), getAdminUsers(), getAdminWaitlist()]);
      setStats(s);
      setUsers(u);
      setWaitlist(w);
    } catch (err: any) {
      setError(err?.message || 'Admin verileri yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const toggleRow = React.useCallback(async (userId: string) => {
    setExpandedId((prev) => (prev === userId ? null : userId));
    if (details[userId] || detailLoadingId === userId) return;
    setDetailLoadingId(userId);
    setDetailErrors((prev) => ({ ...prev, [userId]: '' }));
    try {
      const detail = await getAdminUserDetail(userId);
      setDetails((prev) => ({ ...prev, [userId]: detail }));
    } catch (err: any) {
      setDetailErrors((prev) => ({ ...prev, [userId]: err?.message || 'Detaylar yüklenemedi.' }));
    } finally {
      setDetailLoadingId(null);
    }
  }, [details, detailLoadingId]);

  return (
    <div className="h-full w-full overflow-auto custom-scrollbar bg-[#070b13] p-4 space-y-4">
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

      {stats && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <RankedList
            icon={PenTool}
            title="Çizim Aracı Kullanımı"
            items={stats.drawing_usage_by_tool.map((i) => ({ label: i.label, count: i.count }))}
            labelFormatter={(l) => DRAWING_TOOL_LABELS[l] || l}
            barColorClass="bg-emerald-500/60"
            emptyText="Henüz çizim yapılmamış."
          />
          <RankedList
            icon={BarChart2}
            title="Paritede Çizim Sayısı"
            items={stats.drawing_usage_by_symbol.map((i) => ({ label: i.label, count: i.count }))}
            barColorClass="bg-indigo-500/60"
            emptyText="Henüz çizim yapılmamış."
          />
          <RankedList
            icon={Star}
            title="En Çok Favorilenen Pariteler"
            items={stats.top_favorite_symbols.map((i) => ({ label: i.label, count: i.count }))}
            barColorClass="bg-amber-500/60"
            emptyText="Henüz favori eklenmemiş."
          />
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
                  <th className="text-left font-semibold px-4 py-2.5 w-6"></th>
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
                {users.map((u) => {
                  const isExpanded = expandedId === u.id;
                  return (
                    <React.Fragment key={u.id}>
                      <tr
                        onClick={() => toggleRow(u.id)}
                        className={`border-b border-slate-800/40 last:border-0 hover:bg-slate-800/20 cursor-pointer transition-colors ${isExpanded ? 'bg-slate-800/30' : ''}`}
                      >
                        <td className="px-4 py-2.5">
                          <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </td>
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
                      {isExpanded && (
                        <tr className="bg-[#070b13]/60 border-b border-slate-800/40">
                          <td colSpan={8} className="p-0">
                            <UserDetailPanel
                              detail={details[u.id]}
                              loading={detailLoadingId === u.id}
                              error={detailErrors[u.id]}
                              isOwnAccount={u.id === currentUser?.id}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && !error && users.length === 0 && (
        <div className="text-center py-12 text-slate-500 text-sm">Henüz kayıtlı kullanıcı yok.</div>
      )}

      {waitlist.length > 0 && (
        <div className="bg-[#0d1321]/80 border border-slate-800/80 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800/80 flex items-center justify-between gap-3">
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-emerald-400" />
              Erken Erişim Listesi ({waitlist.length})
            </h3>
            <CopyEmailsButton emails={waitlist.map((w) => w.email)} />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-800/60">
                  <th className="text-left font-semibold px-4 py-2.5">E-posta</th>
                  <th className="text-left font-semibold px-4 py-2.5">Kaynak</th>
                  <th className="text-left font-semibold px-4 py-2.5">Katılım</th>
                </tr>
              </thead>
              <tbody>
                {waitlist.map((w) => (
                  <tr key={w.email} className="border-b border-slate-800/40 last:border-0 hover:bg-slate-800/20">
                    <td className="px-4 py-2.5 text-slate-200 font-mono">{w.email}</td>
                    <td className="px-4 py-2.5 text-slate-400">
                      {w.source === 'hero' ? 'Üst form' : w.source === 'footer' ? 'Alt form' : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-slate-400 font-mono whitespace-nowrap">{formatDateTime(w.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <EventsPanel />
    </div>
  );
}

/** Karşılaşılan hataları ve etiketlenmiş aksiyonları gösteren bağımsız panel. */
function EventsPanel() {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<AdminEventEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [levelFilter, setLevelFilter] = useState<string>('');
  const [loadedOnce, setLoadedOnce] = useState(false);

  const load = React.useCallback(async (level: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminEvents({ level: level || undefined });
      setEvents(data);
      setLoadedOnce(true);
    } catch (err: any) {
      setError(err?.message || 'Olaylar yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !loadedOnce) {
      load(levelFilter);
    }
  };

  const handleLevelChange = (level: string) => {
    setLevelFilter(level);
    load(level);
  };

  return (
    <div className="bg-[#0d1321]/80 border border-slate-800/80 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 cursor-pointer"
      >
        <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
          <ScrollText className="w-3.5 h-3.5 text-rose-400" />
          Olaylar ve Hatalar
        </h3>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-slate-800/80">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-800/60">
            <div className="flex items-center gap-2">
              {['', 'error', 'warning', 'info'].map((lvl) => (
                <button
                  key={lvl || 'all'}
                  type="button"
                  onClick={() => handleLevelChange(lvl)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                    levelFilter === lvl
                      ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300'
                      : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:bg-slate-800/70'
                  }`}
                >
                  {lvl === '' ? 'Tümü' : lvl === 'error' ? 'Hata' : lvl === 'warning' ? 'Uyarı' : 'Bilgi'}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => load(levelFilter)}
              disabled={loading}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-[11px] font-semibold text-slate-300 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              Yenile
            </button>
          </div>

          {error && (
            <div className="px-4 py-3 text-xs text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              {error}
            </div>
          )}

          {loading && events.length === 0 && (
            <div className="flex items-center gap-2 px-4 py-6 text-xs text-slate-500">
              <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              Yükleniyor...
            </div>
          )}

          {!loading && !error && events.length === 0 && (
            <div className="px-4 py-6 text-xs text-slate-600 text-center">Kayıt bulunamadı.</div>
          )}

          {events.length > 0 && (
            <div className="overflow-x-auto max-h-[420px] overflow-y-auto custom-scrollbar">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-[#0d1321]">
                  <tr className="text-slate-500 border-b border-slate-800/60">
                    <th className="text-left font-semibold px-4 py-2">Zaman</th>
                    <th className="text-left font-semibold px-4 py-2">Kullanıcı</th>
                    <th className="text-left font-semibold px-4 py-2">Tür</th>
                    <th className="text-left font-semibold px-4 py-2">Seviye</th>
                    <th className="text-left font-semibold px-4 py-2">Mesaj</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id} className="border-b border-slate-800/40 last:border-0 hover:bg-slate-800/20">
                      <td className="px-4 py-2 text-slate-400 font-mono whitespace-nowrap">{formatDateTime(e.created_at)}</td>
                      <td className="px-4 py-2 text-slate-400 font-mono truncate max-w-[160px]">{e.user_email || '—'}</td>
                      <td className="px-4 py-2 text-slate-300 font-mono">{e.event_type}</td>
                      <td className="px-4 py-2">
                        <span
                          className={
                            e.level === 'error'
                              ? 'text-red-400'
                              : e.level === 'warning'
                              ? 'text-amber-400'
                              : 'text-slate-500'
                          }
                        >
                          {e.level}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-slate-400 truncate max-w-[360px]" title={e.message || undefined}>
                        {e.message || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const statusStyles: Record<string, string> = {
  ACTIVE: 'text-emerald-400',
  TRIGGERED: 'text-amber-400',
  DISABLED: 'text-slate-500',
};

const statusLabels: Record<string, string> = {
  ACTIVE: 'Aktif',
  TRIGGERED: 'Tetiklendi',
  DISABLED: 'Devre Dışı',
};

/**
 * Erken erişim listesindeki tüm e-postaları panoya kopyalar — toplu mail
 * aracına (Mailchimp, Google Groups vb.) yapıştırmak için. Otomatik gönderim
 * henüz yok; bu buton yalnızca listeyi dışarı taşımayı kolaylaştırıyor.
 */
function CopyEmailsButton({ emails }: { emails: string[] }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(emails.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 text-[11px] font-semibold flex-shrink-0 whitespace-nowrap cursor-pointer transition-colors"
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Kopyalandı' : 'Tüm E-postaları Kopyala'}
    </button>
  );
}

/** Bir stratejiyi tek tuşla, giriş yapmış admin'in kendi hesabına kopyalar (test etmek için). */
function CloneStrategyButton({ strategyId }: { strategyId: string }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  const handleClone = async () => {
    if (status === 'loading') return;
    setStatus('loading');
    try {
      await cloneStrategyToMe(strategyId);
      setStatus('done');
      setTimeout(() => setStatus('idle'), 2500);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 2500);
    }
  };

  if (status === 'done') {
    return (
      <span className="flex items-center gap-1 text-[10px] text-emerald-400 flex-shrink-0 whitespace-nowrap">
        <Check className="w-3 h-3" /> Hesabına eklendi
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClone}
      disabled={status === 'loading'}
      title="Bu stratejiyi kendi hesabıma kopyala (test etmek için)"
      className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 disabled:opacity-50 flex-shrink-0 whitespace-nowrap cursor-pointer"
    >
      <Copy className="w-3 h-3" />
      {status === 'loading' ? 'Kopyalanıyor...' : status === 'error' ? 'Hata, tekrar dene' : 'Hesabıma Kopyala'}
    </button>
  );
}

function UserDetailPanel({
  detail,
  loading,
  error,
  isOwnAccount,
}: {
  detail?: AdminUserDetail;
  loading: boolean;
  error?: string;
  isOwnAccount?: boolean;
}) {
  if (loading && !detail) {
    return (
      <div className="flex items-center gap-2 px-6 py-5 text-xs text-slate-500">
        <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        Detaylar yükleniyor...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 px-6 py-5 text-xs text-red-400">
        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
        {error}
      </div>
    );
  }

  if (!detail) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 px-6 py-4">
      {/* Stratejiler */}
      <div>
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
          <SlidersHorizontal className="w-3 h-3" />
          Stratejiler ({detail.strategies.length})
        </h4>
        {detail.strategies.length === 0 ? (
          <p className="text-xs text-slate-600">Henüz strateji oluşturmamış.</p>
        ) : (
          <div className="space-y-2">
            {detail.strategies.map((s) => (
              <div key={s.id} className="bg-[#0d1321]/80 border border-slate-800/60 rounded-lg px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-200 truncate">{s.name}</div>
                  {!isOwnAccount && <CloneStrategyButton strategyId={s.id} />}
                </div>
                {s.description && (
                  <div className="text-[11px] text-slate-500 truncate mt-0.5">{s.description}</div>
                )}
                <div className="flex flex-wrap gap-1.5 mt-1.5 text-[10px] font-mono">
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
                    Giriş: {s.entry_rules_count}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/30 text-red-300">
                    Çıkış: {s.exit_rules_count}
                  </span>
                  {s.allow_short && (
                    <span className="px-1.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/30 text-purple-300">
                      Short
                    </span>
                  )}
                  {s.take_profit_pct != null && (
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
                      TP %{s.take_profit_pct}
                    </span>
                  )}
                  {s.stop_loss_pct != null && (
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
                      SL %{s.stop_loss_pct}
                    </span>
                  )}
                </div>
                {/* Giriş ve çıkış kurallarının detay metinleri */}
                {(s.entry_rules_text?.length > 0 || s.exit_rules_text?.length > 0) && (
                  <div className="mt-2 space-y-1">
                    {s.entry_rules_text?.map((txt, i) => (
                      <div
                        key={`entry-${i}`}
                        className="flex items-center gap-1.5 pl-2 border-l-2 border-emerald-500/40"
                      >
                        <span className="text-[10px] font-mono text-slate-400 truncate">{txt}</span>
                      </div>
                    ))}
                    {s.exit_rules_text?.map((txt, i) => (
                      <div
                        key={`exit-${i}`}
                        className="flex items-center gap-1.5 pl-2 border-l-2 border-red-500/40"
                      >
                        <span className="text-[10px] font-mono text-slate-400 truncate">{txt}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Alarmlar */}
      <div>
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
          <Bell className="w-3 h-3" />
          Alarmlar ({detail.alerts.length})
        </h4>
        {detail.alerts.length === 0 ? (
          <p className="text-xs text-slate-600">Henüz alarm oluşturmamış.</p>
        ) : (
          <div className="space-y-2">
            {detail.alerts.map((a) => (
              <div key={a.id} className="bg-[#0d1321]/80 border border-slate-800/60 rounded-lg px-3 py-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                  {a.condition === 'rises_above' ? (
                    <TrendingUp className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                  ) : (
                    <TrendingDown className="w-3 h-3 text-red-400 flex-shrink-0" />
                  )}
                  <span className="truncate">{a.description}</span>
                </div>
                <div className="flex items-center gap-2 mt-1 text-[10px] font-mono">
                  <span className={statusStyles[a.status] || 'text-slate-500'}>
                    {a.status === 'ACTIVE' ? <Power className="w-3 h-3 inline mr-0.5" /> : <PowerOff className="w-3 h-3 inline mr-0.5" />}
                    {statusLabels[a.status] || a.status}
                  </span>
                  <span className="text-slate-600">•</span>
                  <span className="text-slate-500">{a.timeframe}</span>
                </div>
                {a.note && <div className="text-[11px] text-slate-500 italic mt-1 truncate">{a.note}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Favoriler */}
      <div>
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
          <Star className="w-3 h-3" />
          İzleme Listesi ({detail.watchlist_items.length})
        </h4>
        {detail.watchlist_items.length === 0 ? (
          <p className="text-xs text-slate-600">İzleme listesi boş.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {detail.watchlist_items.map((w) => (
              <span
                key={w.id}
                title={w.name || undefined}
                className="px-2 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 font-mono text-[11px] whitespace-nowrap"
              >
                {w.symbol}
                <span className="text-slate-500 ml-1">{w.provider}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
