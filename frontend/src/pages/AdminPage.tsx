/**
 * Admin Paneli.
 *
 * Platform istatistikleri ve kayıtlı kullanıcı listesi. Sekme yalnızca
 * is_admin olan hesaplara gösterilir; yetki her hâlükârda sunucuda
 * ADMIN_EMAILS ile doğrulanır.
 */

import React, { useState } from 'react';
import {
  SlidersHorizontal, Bell, Star, RefreshCw, ShieldAlert,
  ChevronDown, TrendingUp, TrendingDown, Power, PowerOff, AlertTriangle,
  PenTool, BarChart2, Copy, Check, Mail, ScrollText,
} from 'lucide-react';
import {
  getAdminStats, getAdminUsers, getAdminUserDetail, cloneStrategyToMe, getAdminWaitlist, getAdminEvents,
  type AdminStats, type AdminUserItem, type AdminUserDetail, type AdminWaitlistEntry, type AdminEventEntry,
} from '../services/adminApi';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../utils/errors';

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

/**
 * Platform sayaçları.
 *
 * Önceden dört ayrı kart vardı ve her birinin başında yuvarlak köşeli bir
 * ikon karesi duruyordu — dört sayı için dört çerçeve, dört ikon. İkonlar
 * hiçbir şey ayırt etmiyordu (etiket zaten yazıyor), kartlar da sayıları
 * birbirinden uzaklaştırıyordu. Tek ızgara, ayraçlı.
 */
const StatStrip: React.FC<{ items: { label: string; value: number }[] }> = ({ items }) => (
  <dl className="grid grid-cols-2 overflow-hidden rounded-lg border border-line lg:grid-cols-4">
    {items.map(({ label, value }) => (
      <div
        key={label}
        className="border-b border-r border-line-subtle px-4 py-3 last:border-r-0 lg:border-b-0"
      >
        <dt className="text-2xs leading-tight text-content-faint">{label}</dt>
        <dd className="mt-1 font-mono text-xl leading-tight text-content-strong">{value}</dd>
      </div>
    ))}
  </dl>
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
  icon: LucideIcon;
  title: string;
  items: { label: string; count: number }[];
  labelFormatter?: (label: string) => string;
  barColorClass?: string;
  emptyText: string;
}> = ({ icon: Icon, title, items, labelFormatter, barColorClass = 'bg-accent-500/60', emptyText }) => {
  const max = items.length > 0 ? Math.max(...items.map((i) => i.count)) : 0;
  return (
    <div className="bg-surface-raised border border-line rounded-lg p-4">
      <h3 className="text-xs font-medium text-content flex items-center gap-1.5 mb-3">
        <Icon className="w-3.5 h-3.5 text-accent-400" />
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="text-xs text-content-faint">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              <span className="text-2xs font-mono text-content w-28 shrink-0 truncate">
                {labelFormatter ? labelFormatter(item.label) : item.label}
              </span>
              <div className="flex-1 h-2 rounded-full bg-surface-hover overflow-hidden">
                <div
                  className={`h-full rounded-full ${barColorClass}`}
                  style={{ width: max > 0 ? `${Math.max((item.count / max) * 100, 4)}%` : '0%' }}
                />
              </div>
              <span className="text-2xs font-mono text-content-muted w-8 text-right shrink-0">{item.count}</span>
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
    } catch (err: unknown) {
      setError(errorMessage(err, 'Admin verileri yüklenemedi.'));
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
    } catch (err: unknown) {
      setDetailErrors((prev) => ({ ...prev, [userId]: errorMessage(err, 'Detaylar yüklenemedi.') }));
    } finally {
      setDetailLoadingId(null);
    }
  }, [details, detailLoadingId]);

  return (
    <div className="h-full w-full overflow-auto custom-scrollbar bg-canvas p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg text-content-strong">Admin paneli</h2>
          <p className="mt-1 text-xs text-content-faint">
            Platform istatistikleri ve kayıtlı kullanıcılar
          </p>
        </div>
        {/* `hover:bg-surface-hover` zemin zaten surface-hover olduğu için
            hiçbir şey yapmıyordu — butonun görünür bir hover durumu yoktu. */}
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 rounded-md border border-line-strong px-3 py-1.5 text-xs font-medium text-content transition-colors ease-out hover:border-ink-500 hover:bg-surface-hover disabled:cursor-not-allowed disabled:text-content-disabled"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} strokeWidth={1.75} />
          {loading ? 'Yükleniyor…' : 'Yenile'}
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-loss-600/50 bg-loss-950 p-4"
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-loss-400" strokeWidth={1.75} />
          <div>
            <p className="text-sm text-loss-300">{error}</p>
            <p className="mt-1 text-xs leading-relaxed text-content-muted">
              403 alıyorsanız hesabınızın e-postası sunucudaki ADMIN_EMAILS
              listesinde değildir.
            </p>
          </div>
        </div>
      )}

      {/* Spinner yerine iskelet: içeriğin nereye geleceğini gösterir, yüklenince
          sayfa zıplamaz. */}
      {loading && !stats && (
        <div className="space-y-4">
          <div className="grid animate-pulse grid-cols-2 overflow-hidden rounded-lg border border-line lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="border-r border-line-subtle px-4 py-3 last:border-r-0">
                <div className="h-2.5 w-20 rounded-sm bg-ink-750" />
                <div className="mt-2.5 h-5 w-12 rounded-sm bg-ink-800" />
              </div>
            ))}
          </div>
          <div className="animate-pulse space-y-px rounded-lg border border-line p-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="py-2.5">
                <div className="h-3 w-1/3 rounded-sm bg-ink-750" />
              </div>
            ))}
          </div>
        </div>
      )}

      {stats && (
        <StatStrip
          items={[
            { label: 'Toplam kullanıcı', value: stats.total_users },
            { label: 'Toplam strateji', value: stats.total_strategies },
            { label: 'Toplam alarm', value: stats.total_alerts },
            { label: 'İzlenen parite', value: stats.total_watchlist_symbols },
          ]}
        />
      )}

      {stats && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <RankedList
            icon={PenTool}
            title="Çizim Aracı Kullanımı"
            items={stats.drawing_usage_by_tool.map((i) => ({ label: i.label, count: i.count }))}
            labelFormatter={(l) => DRAWING_TOOL_LABELS[l] || l}
            barColorClass="bg-accent-500/60"
            emptyText="Henüz çizim yapılmamış."
          />
          <RankedList
            icon={BarChart2}
            title="Paritede Çizim Sayısı"
            items={stats.drawing_usage_by_symbol.map((i) => ({ label: i.label, count: i.count }))}
            barColorClass="bg-accent-500/60"
            emptyText="Henüz çizim yapılmamış."
          />
          <RankedList
            icon={Star}
            title="En Çok Favorilenen Pariteler"
            items={stats.top_favorite_symbols.map((i) => ({ label: i.label, count: i.count }))}
            barColorClass="bg-warn-500/60"
            emptyText="Henüz favori eklenmemiş."
          />
        </div>
      )}

      {users.length > 0 && (
        <div className="bg-surface-raised border border-line rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-line">
            <h3 className="text-xs font-medium text-content">
              Kayıtlı Kullanıcılar ({users.length})
            </h3>
          </div>

          {/* `min-w`siz bir `w-full` tablo kaba sığmak için sıkışır, kaymaz:
              sekiz sütun telefonda okunamaz hâle geliyordu. */}
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full min-w-[720px] text-xs">
              <thead>
                <tr className="text-content-faint border-b border-line">
                  <th className="text-left font-medium px-4 py-2.5 w-6"></th>
                  <th className="text-left font-medium px-4 py-2.5">Kullanıcı</th>
                  <th className="text-left font-medium px-4 py-2.5">Katılım</th>
                  <th className="text-left font-medium px-4 py-2.5">Son Giriş</th>
                  <th className="text-right font-medium px-4 py-2.5">Strateji</th>
                  <th className="text-right font-medium px-4 py-2.5">Alarm</th>
                  <th className="text-left font-medium px-4 py-2.5">Alarm Pariteleri</th>
                  <th className="text-right font-medium px-4 py-2.5">Favori</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isExpanded = expandedId === u.id;
                  return (
                    <React.Fragment key={u.id}>
                      <tr
                        onClick={() => toggleRow(u.id)}
                        className={`border-b border-line last:border-0 hover:bg-surface-hover cursor-pointer transition-colors ${isExpanded ? 'bg-surface-hover' : ''}`}
                      >
                        <td className="px-4 py-2.5">
                          <ChevronDown className={`w-3.5 h-3.5 text-content-faint transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5 min-w-0">
                            {u.avatar_url ? (
                              <img src={u.avatar_url} alt="" className="w-7 h-7 rounded-full flex-shrink-0" />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-surface-hover border border-line-strong flex items-center justify-center text-content-muted text-2xs font-medium flex-shrink-0">
                                {(u.name || u.email).charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="text-content font-medium truncate">{u.name || '—'}</div>
                              <div className="text-content-faint font-mono text-2xs truncate">{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-content-muted font-mono whitespace-nowrap">{formatDate(u.created_at)}</td>
                        <td className="px-4 py-2.5 text-content-muted font-mono whitespace-nowrap">
                          {u.last_login_at ? formatDateTime(u.last_login_at) : (
                            <span className="text-content-faint font-sans">hiç giriş yapmadı</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right text-content font-mono">{u.strategies_count}</td>
                        <td className="px-4 py-2.5 text-right text-content font-mono">{u.alerts_count}</td>
                        <td className="px-4 py-2.5">
                          {u.alert_symbols.length === 0 ? (
                            <span className="text-content-faint">—</span>
                          ) : (
                            /* Rozetler sarıydı; bir sembol adı uyarı değil.
                               Nötr duruyorlar, ayırt edici olan metnin kendisi. */
                            <div className="flex max-w-[240px] flex-wrap gap-1">
                              {u.alert_symbols.map((sym) => (
                                <span
                                  key={sym}
                                  className="whitespace-nowrap rounded-sm border border-line-strong bg-surface-hover px-1.5 py-0.5 font-mono text-2xs text-content-muted"
                                >
                                  {sym}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right text-content font-mono">{u.watchlist_count}</td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-canvas border-b border-line">
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
        <div className="text-center py-12 text-content-faint text-sm">Henüz kayıtlı kullanıcı yok.</div>
      )}

      {waitlist.length > 0 && (
        <div className="bg-surface-raised border border-line rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-line flex items-center justify-between gap-3">
            <h3 className="text-xs font-medium text-content flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-accent-400" />
              Erken Erişim Listesi ({waitlist.length})
            </h3>
            <CopyEmailsButton emails={waitlist.map((w) => w.email)} />
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full min-w-[440px] text-xs">
              <thead>
                <tr className="text-content-faint border-b border-line">
                  <th className="text-left font-medium px-4 py-2.5">E-posta</th>
                  <th className="text-left font-medium px-4 py-2.5">Kaynak</th>
                  <th className="text-left font-medium px-4 py-2.5">Katılım</th>
                </tr>
              </thead>
              <tbody>
                {waitlist.map((w) => (
                  <tr key={w.email} className="border-b border-line last:border-0 hover:bg-surface-hover">
                    <td className="px-4 py-2.5 text-content font-mono">{w.email}</td>
                    <td className="px-4 py-2.5 text-content-muted">
                      {w.source === 'hero' ? 'Üst form' : w.source === 'footer' ? 'Alt form' : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-content-muted font-mono whitespace-nowrap">{formatDateTime(w.created_at)}</td>
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
    } catch (err: unknown) {
      setError(errorMessage(err, 'Olaylar yüklenemedi.'));
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
    <div className="bg-surface-raised border border-line rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 cursor-pointer"
      >
        <h3 className="text-xs font-medium text-content flex items-center gap-1.5">
          <ScrollText className="w-3.5 h-3.5 text-loss-400" />
          Olaylar ve Hatalar
        </h3>
        <ChevronDown className={`w-3.5 h-3.5 text-content-faint transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-line">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-line">
            <div className="flex items-center gap-2">
              {['', 'error', 'warning', 'info'].map((lvl) => (
                <button
                  key={lvl || 'all'}
                  type="button"
                  onClick={() => handleLevelChange(lvl)}
                  className={`px-2.5 py-1 rounded-lg text-2xs font-medium border transition-colors cursor-pointer ${
                    levelFilter === lvl
                      ? 'bg-accent-500/20 border-accent-500/50 text-accent-300'
                      : 'bg-surface-hover border-line-strong text-content-muted hover:bg-surface-hover'
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
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-hover hover:bg-surface-hover border border-line-strong text-2xs font-medium text-content disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              Yenile
            </button>
          </div>

          {error && (
            <div className="px-4 py-3 text-xs text-loss-400 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              {error}
            </div>
          )}

          {loading && events.length === 0 && (
            <div className="flex items-center gap-2 px-4 py-6 text-xs text-content-faint">
              <div className="w-4 h-4 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
              Yükleniyor...
            </div>
          )}

          {!loading && !error && events.length === 0 && (
            <div className="px-4 py-6 text-xs text-content-faint text-center">Kayıt bulunamadı.</div>
          )}

          {events.length > 0 && (
            <div className="overflow-auto max-h-[420px] custom-scrollbar">
              <table className="w-full min-w-[640px] text-xs">
                <thead className="sticky top-0 bg-surface-raised">
                  <tr className="text-content-faint border-b border-line">
                    <th className="text-left font-medium px-4 py-2">Zaman</th>
                    <th className="text-left font-medium px-4 py-2">Kullanıcı</th>
                    <th className="text-left font-medium px-4 py-2">Tür</th>
                    <th className="text-left font-medium px-4 py-2">Seviye</th>
                    <th className="text-left font-medium px-4 py-2">Mesaj</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id} className="border-b border-line last:border-0 hover:bg-surface-hover">
                      <td className="px-4 py-2 text-content-muted font-mono whitespace-nowrap">{formatDateTime(e.created_at)}</td>
                      <td className="px-4 py-2 text-content-muted font-mono truncate max-w-[160px]">{e.user_email || '—'}</td>
                      <td className="px-4 py-2 text-content font-mono">{e.event_type}</td>
                      <td className="px-4 py-2">
                        <span
                          className={
                            e.level === 'error'
                              ? 'text-loss-400'
                              : e.level === 'warning'
                              ? 'text-warn-400'
                              : 'text-content-faint'
                          }
                        >
                          {e.level}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-content-muted truncate max-w-[360px]" title={e.message || undefined}>
                        {errorMessage(e, '—')}
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
  ACTIVE: 'text-accent-400',
  TRIGGERED: 'text-warn-400',
  DISABLED: 'text-content-faint',
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
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-accent-500/30 bg-accent-500/10 text-accent-300 hover:bg-accent-300/20 text-2xs font-medium flex-shrink-0 whitespace-nowrap cursor-pointer transition-colors"
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
      <span className="flex items-center gap-1 text-2xs text-accent-400 flex-shrink-0 whitespace-nowrap">
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
      className="flex items-center gap-1 text-2xs px-1.5 py-0.5 rounded border border-accent-500/30 bg-accent-500/10 text-accent-300 hover:bg-accent-300/20 disabled:opacity-50 flex-shrink-0 whitespace-nowrap cursor-pointer"
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
      <div className="flex items-center gap-2 px-6 py-5 text-xs text-content-faint">
        <div className="w-4 h-4 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
        Detaylar yükleniyor...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 px-6 py-5 text-xs text-loss-400">
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
        <h4 className="text-2xs font-medium text-content-faint mb-2 flex items-center gap-1.5">
          <SlidersHorizontal className="w-3 h-3" />
          Stratejiler ({detail.strategies.length})
        </h4>
        {detail.strategies.length === 0 ? (
          <p className="text-xs text-content-faint">Henüz strateji oluşturmamış.</p>
        ) : (
          <div className="space-y-2">
            {detail.strategies.map((s) => (
              <div key={s.id} className="bg-surface-raised border border-line rounded-lg px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs font-medium text-content truncate">{s.name}</div>
                  {!isOwnAccount && <CloneStrategyButton strategyId={s.id} />}
                </div>
                {s.description && (
                  <div className="text-2xs text-content-faint truncate mt-0.5">{s.description}</div>
                )}
                <div className="flex flex-wrap gap-1.5 mt-1.5 text-2xs font-mono">
                  <span className="px-1.5 py-0.5 rounded bg-accent-500/10 border border-accent-500/30 text-accent-300">
                    Giriş: {s.entry_rules_count}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-loss-500/10 border border-loss-500/30 text-loss-300">
                    Çıkış: {s.exit_rules_count}
                  </span>
                  {s.allow_short && (
                    <span className="px-1.5 py-0.5 rounded bg-accent-500/10 border border-accent-500/30 text-accent-300">
                      Short
                    </span>
                  )}
                  {s.take_profit_pct != null && (
                    <span className="px-1.5 py-0.5 rounded bg-surface-hover border border-line-strong text-content">
                      TP %{s.take_profit_pct}
                    </span>
                  )}
                  {s.stop_loss_pct != null && (
                    <span className="px-1.5 py-0.5 rounded bg-surface-hover border border-line-strong text-content">
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
                        className="flex items-center gap-1.5 pl-2 border-l-2 border-accent-500/40"
                      >
                        <span className="text-2xs font-mono text-content-muted truncate">{txt}</span>
                      </div>
                    ))}
                    {s.exit_rules_text?.map((txt, i) => (
                      <div
                        key={`exit-${i}`}
                        className="flex items-center gap-1.5 pl-2 border-l-2 border-loss-500/40"
                      >
                        <span className="text-2xs font-mono text-content-muted truncate">{txt}</span>
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
        <h4 className="text-2xs font-medium text-content-faint mb-2 flex items-center gap-1.5">
          <Bell className="w-3 h-3" />
          Alarmlar ({detail.alerts.length})
        </h4>
        {detail.alerts.length === 0 ? (
          <p className="text-xs text-content-faint">Henüz alarm oluşturmamış.</p>
        ) : (
          <div className="space-y-2">
            {detail.alerts.map((a) => (
              <div key={a.id} className="bg-surface-raised border border-line rounded-lg px-3 py-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-content">
                  {a.condition === 'rises_above' ? (
                    <TrendingUp className="w-3 h-3 text-profit-400 flex-shrink-0" />
                  ) : (
                    <TrendingDown className="w-3 h-3 text-loss-400 flex-shrink-0" />
                  )}
                  <span className="truncate">{a.description}</span>
                </div>
                <div className="flex items-center gap-2 mt-1 text-2xs font-mono">
                  <span className={statusStyles[a.status] || 'text-content-faint'}>
                    {a.status === 'ACTIVE' ? <Power className="w-3 h-3 inline mr-0.5" /> : <PowerOff className="w-3 h-3 inline mr-0.5" />}
                    {statusLabels[a.status] || a.status}
                  </span>
                  <span className="text-content-faint">•</span>
                  <span className="text-content-faint">{a.timeframe}</span>
                </div>
                {a.note && <div className="text-2xs text-content-faint mt-1 truncate">{a.note}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Favoriler */}
      <div>
        <h4 className="text-2xs font-medium text-content-faint mb-2 flex items-center gap-1.5">
          <Star className="w-3 h-3" />
          İzleme Listesi ({detail.watchlist_items.length})
        </h4>
        {detail.watchlist_items.length === 0 ? (
          <p className="text-xs text-content-faint">İzleme listesi boş.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {detail.watchlist_items.map((w) => (
              <span
                key={w.id}
                title={w.name || undefined}
                className="px-2 py-1 rounded-lg bg-accent-500/10 border border-accent-500/30 text-accent-300 font-mono text-2xs whitespace-nowrap"
              >
                {w.symbol}
                <span className="text-content-faint ml-1">{w.provider}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
