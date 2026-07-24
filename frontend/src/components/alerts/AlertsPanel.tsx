import { useEffect, useCallback, useRef } from 'react';
import {
  Bell, Plus, Trash2, Power, X,
  TrendingUp, TrendingDown, Clock, GripVertical
} from 'lucide-react';
import { alertStore, useAlertStore, AlertItem } from '../../store/alertStore';
import { watchlistStore, useWatchlistStore } from '../../store/watchlistStore';

interface AlertsPanelProps {
  currentSymbol: string;
  currentProvider?: string;
  currentPrice?: number;
  onOpenCreateModal: () => void;
}

export default function AlertsPanel({
  currentSymbol,
  onOpenCreateModal,
}: AlertsPanelProps) {
  const [watchlistState] = useWatchlistStore();
  const [alertState] = useAlertStore();

  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(watchlistState.panelWidth);

  useEffect(() => {
    alertStore.fetchAlerts();
  }, []);

  // ---- Panel Resize Handlers ----
  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    dragStartXRef.current = e.clientX;
    dragStartWidthRef.current = watchlistState.panelWidth;

    const onMouseMove = (me: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const delta = dragStartXRef.current - me.clientX;
      watchlistStore.setPanelWidth(dragStartWidthRef.current + delta);
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [watchlistState.panelWidth]);

  if (!watchlistState.isOpen || watchlistState.activeRightTool !== 'alerts') {
    return null;
  }

  const activeAlerts = alertState.alerts.filter(a => a.status === 'ACTIVE');
  const triggeredAlerts = alertState.alerts.filter(a => a.status === 'TRIGGERED');
  const disabledAlerts = alertState.alerts.filter(a => a.status === 'DISABLED');

  const formatTarget = (alert: AlertItem) => {
    if (alert.target_type === 'price') {
      return `${alert.symbol} Fiyatı`;
    }
    const p = alert.indicator_period ? `(${alert.indicator_period})` : '';
    return `${alert.target_type}${p}`;
  };

  const formatThreshold = (val: number, targetType: string) => {
    if (targetType === 'price') {
      return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return val.toString();
  };

  return (
    <div
      style={{ width: watchlistState.panelWidth }}
      className="h-full bg-[#0d1321]/95 border-l border-slate-800 flex flex-col z-20 select-none shrink-0 shadow-2xl backdrop-blur-md animate-fadeIn relative overflow-hidden"
    >
      {/* Resize handle (left edge) */}
      <div
        onMouseDown={onResizeMouseDown}
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-30 group hover:bg-amber-500/30 transition-colors"
        title="Genişliği Ayarla"
      >
        <div className="absolute left-0.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
          <GripVertical className="w-3 h-3 text-amber-400" />
        </div>
      </div>
      {/* Panel Header */}
      <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-[#070b13]/80">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <Bell className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
              <span>Alarmlar</span>
              <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 font-mono px-1.5 rounded-full font-semibold">
                {alertState.alerts.length}
              </span>
            </h3>
            <p className="text-[10px] text-slate-500">Fiyat ve İndikatör Uyarıları</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onOpenCreateModal}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-white bg-amber-600 hover:bg-amber-500 rounded-lg shadow-md transition"
            title="Yeni Alarm Ekle"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Ekle</span>
          </button>

          <button
            onClick={() => watchlistStore.togglePanel()}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 rounded-lg transition"
            title="Paneli Kapat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Alerts Content */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-3 custom-scrollbar">
        {alertState.loading && alertState.alerts.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-500">Alarmlar yükleniyor...</div>
        ) : alertState.alerts.length === 0 ? (
          <div className="text-center py-12 px-4 border border-dashed border-slate-800/80 rounded-2xl bg-[#070b13]/40">
            <Bell className="w-8 h-8 mx-auto text-slate-600 mb-2" />
            <p className="text-xs font-semibold text-slate-300">Henüz alarm yok</p>
            <p className="text-[11px] text-slate-500 mt-1 mb-3">
              Fiyat veya indikatör seviyeleri için uyarı tanımlayabilirsiniz.
            </p>
            <button
              onClick={onOpenCreateModal}
              className="px-3 py-1.5 text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-xl hover:bg-amber-500/20 transition"
            >
              + Alarm Ekle
            </button>
          </div>
        ) : (
          <>
            {/* Active Alerts */}
            {activeAlerts.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 flex items-center justify-between">
                  <span>Aktif Alarmlar ({activeAlerts.length})</span>
                </div>
                {activeAlerts.map(alert => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    currentSymbol={currentSymbol}
                    formatTarget={formatTarget}
                    formatThreshold={formatThreshold}
                  />
                ))}
              </div>
            )}

            {/* Triggered Alerts */}
            {triggeredAlerts.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-slate-800/60">
                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400 px-1 flex items-center justify-between">
                  <span>Tetiklenen Alarmlar ({triggeredAlerts.length})</span>
                </div>
                {triggeredAlerts.map(alert => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    currentSymbol={currentSymbol}
                    formatTarget={formatTarget}
                    formatThreshold={formatThreshold}
                  />
                ))}
              </div>
            )}

            {/* Disabled Alerts */}
            {disabledAlerts.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-slate-800/60 opacity-60">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-1">
                  <span>Devre Dışı ({disabledAlerts.length})</span>
                </div>
                {disabledAlerts.map(alert => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    currentSymbol={currentSymbol}
                    formatTarget={formatTarget}
                    formatThreshold={formatThreshold}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface AlertCardProps {
  alert: AlertItem;
  currentSymbol: string;
  formatTarget: (a: AlertItem) => string;
  formatThreshold: (v: number, t: string) => string;
}

function AlertCard({ alert, currentSymbol, formatTarget, formatThreshold }: AlertCardProps) {
  const isMatchCurrent = alert.symbol.toUpperCase() === currentSymbol.toUpperCase();
  const isRises = alert.condition === 'rises_above';

  return (
    <div
      className={`p-2.5 rounded-xl border transition-all ${
        alert.status === 'TRIGGERED'
          ? 'bg-amber-500/10 border-amber-500/40 shadow-md shadow-amber-500/10'
          : isMatchCurrent
          ? 'bg-slate-800/60 border-slate-700/80'
          : 'bg-[#070b13]/60 border-slate-800/80'
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-slate-100 font-mono">{alert.symbol}</span>
          <span className="text-[9px] font-bold px-1 rounded bg-slate-900 text-slate-400 border border-slate-800">
            {alert.target_type.toUpperCase()}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => alertStore.toggleAlertStatus(alert.id, alert.status)}
            className={`p-1 rounded-lg transition ${
              alert.status === 'ACTIVE'
                ? 'text-emerald-400 hover:bg-emerald-500/20'
                : alert.status === 'TRIGGERED'
                ? 'text-amber-400 hover:bg-amber-500/20'
                : 'text-slate-600 hover:bg-slate-800'
            }`}
            title={alert.status === 'ACTIVE' ? 'Devre Dışı Bırak' : 'Aktifleştir'}
          >
            <Power className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => alertStore.deleteAlert(alert.id)}
            className="p-1 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
            title="Alarmı Sil"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between mt-1">
        <div className="flex items-center gap-1 text-xs font-semibold text-slate-200">
          {isRises ? (
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          ) : (
            <TrendingDown className="w-3.5 h-3.5 text-red-400 shrink-0" />
          )}
          <span>{formatTarget(alert)}</span>
          <span className="font-mono text-amber-400 font-bold">
            {isRises ? '>' : '<'} {formatThreshold(alert.threshold_value, alert.target_type)}
          </span>
        </div>
      </div>

      {alert.note && (
        <p className="text-[10px] text-slate-400 mt-1 italic line-clamp-1">{alert.note}</p>
      )}

      {alert.status === 'TRIGGERED' && alert.triggered_at && (
        <div className="flex items-center gap-1 mt-1.5 text-[9px] text-amber-400 font-mono">
          <Clock className="w-3 h-3" />
          <span>Tetiklendi: {new Date(alert.triggered_at).toLocaleTimeString()}</span>
        </div>
      )}
    </div>
  );
}
