import { useEffect, useCallback, useRef } from 'react';
import {
  Bell, Plus, Trash2, Power,
  TrendingUp, TrendingDown, Clock, GripVertical
} from 'lucide-react';
import { alertStore, useAlertStore, AlertItem } from '../../store/alertStore';
import { watchlistStore, useWatchlistStore } from '../../store/watchlistStore';

interface AlertsPanelProps {
  currentSymbol: string;
  currentProvider?: string;
  currentPrice?: number;
  onOpenCreateModal: () => void;
  onSelectSymbol?: (symbol: string, provider: string) => void;
}

export default function AlertsPanel({
  currentSymbol,
  onOpenCreateModal,
  onSelectSymbol,
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
    if (alert.target_type === 'EMA_CROSS') {
      const fast = alert.indicator_period_fast || 20;
      const slow = alert.indicator_period_slow || 50;
      return `EMA (${fast} / ${slow}) Kesişimi`;
    }
    if (alert.target_type === 'PERCENT_CHANGE') {
      return `${alert.symbol} Yüzdelik Değişim`;
    }
    const p = alert.indicator_period ? `(${alert.indicator_period})` : '';
    return `${alert.target_type}${p}`;
  };

  const formatThreshold = (val: number, targetType: string) => {
    if (targetType === 'price') {
      return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (targetType === 'EMA_CROSS') {
      return 'Kesişim';
    }
    if (targetType === 'PERCENT_CHANGE') {
      return `%${val}`;
    }
    return val.toString();
  };

  return (
    <div
      style={{ width: watchlistState.panelWidth }}
      className="h-full bg-canvas border-l border-line flex flex-col z-20 select-none shrink-0 shadow-2xl backdrop-blur-md animate-fadeIn relative overflow-hidden text-content-strong"
    >
      {/* Resize handle (left edge) */}
      <div
        onMouseDown={onResizeMouseDown}
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-30 group hover:bg-accent-600/30 transition-colors"
        title="Genişliği Ayarla"
      >
        <div className="absolute left-0.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
          <GripVertical className="w-3 h-3 text-content-muted group-hover:text-accent-300" />
        </div>
      </div>
      {/* Panel Header */}
      <div className="p-3 border-b border-line flex items-center justify-between bg-canvas">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-accent-500/10 border border-accent-500/30 text-accent-400">
            <Bell className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-medium text-content-strong flex items-center gap-1.5">
              <span>Alarmlar</span>
              <span className="text-2xs bg-accent-500/20 text-accent-400 border border-accent-500/30 font-mono px-1.5 rounded-full font-medium">
                {alertState.alerts.length}
              </span>
            </h3>
            <span className="text-2xs text-content-faint font-medium">Canlı Fiyat & Koşul Uyarıları</span>
          </div>
        </div>

        <button
          onClick={onOpenCreateModal}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-ink-50 text-ink-950 text-xs font-medium hover:bg-accent-300 transition-colors shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Alarm Ekle</span>
        </button>
      </div>

      {/* Alerts Content */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-3 custom-scrollbar">
        {alertState.loading && alertState.alerts.length === 0 ? (
          <div className="text-center py-8 text-xs text-content-faint">Alarmlar yükleniyor...</div>
        ) : alertState.alerts.length === 0 ? (
          <div className="text-center py-12 px-4 border border-dashed border-line rounded-2xl bg-canvas">
            <Bell className="w-8 h-8 mx-auto text-content-faint mb-2" />
            <p className="text-xs font-medium text-content">Henüz alarm yok</p>
            <p className="text-2xs text-content-faint mt-1 mb-3">
              Fiyat veya indikatör seviyeleri için uyarı tanımlayabilirsiniz.
            </p>
            <button
              onClick={onOpenCreateModal}
              className="px-3 py-1.5 text-xs font-medium text-warn-400 bg-warn-500/10 border border-warn-500/30 rounded-xl hover:bg-warn-500/20 transition"
            >
              + Alarm Ekle
            </button>
          </div>
        ) : (
          <>
            {/* Active Alerts */}
            {activeAlerts.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-2xs font-medium text-content-muted px-1 flex items-center justify-between">
                  <span>Aktif Alarmlar ({activeAlerts.length})</span>
                </div>
                {activeAlerts.map(alert => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    currentSymbol={currentSymbol}
                    formatTarget={formatTarget}
                    formatThreshold={formatThreshold}
                    onSelectSymbol={onSelectSymbol}
                  />
                ))}
              </div>
            )}

            {/* Triggered Alerts */}
            {triggeredAlerts.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-line">
                <div className="text-2xs font-medium text-warn-400 px-1 flex items-center justify-between">
                  <span>Tetiklenen Alarmlar ({triggeredAlerts.length})</span>
                </div>
                {triggeredAlerts.map(alert => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    currentSymbol={currentSymbol}
                    formatTarget={formatTarget}
                    formatThreshold={formatThreshold}
                    onSelectSymbol={onSelectSymbol}
                  />
                ))}
              </div>
            )}

            {/* Disabled Alerts */}
            {disabledAlerts.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-line opacity-60">
                <div className="text-2xs font-medium text-content-faint px-1">
                  <span>Devre Dışı ({disabledAlerts.length})</span>
                </div>
                {disabledAlerts.map(alert => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    currentSymbol={currentSymbol}
                    formatTarget={formatTarget}
                    formatThreshold={formatThreshold}
                    onSelectSymbol={onSelectSymbol}
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
  onSelectSymbol?: (symbol: string, provider: string) => void;
}

function AlertCard({ alert, currentSymbol, formatTarget, formatThreshold, onSelectSymbol }: AlertCardProps) {
  const isMatchCurrent = alert.symbol.toUpperCase() === currentSymbol.toUpperCase();
  const isRises = alert.condition === 'rises_above';
  const canNavigate = !!onSelectSymbol && !isMatchCurrent;

  return (
    <div
      onClick={() => {
        if (canNavigate) {
          onSelectSymbol!(alert.symbol, alert.provider);
        }
      }}
      title={canNavigate ? `${alert.symbol} paritesine geç` : undefined}
      className={`p-2.5 rounded-xl border transition-all ${canNavigate ? 'cursor-pointer hover:border-warn-500/50' : ''} ${
        alert.status === 'TRIGGERED'
          ? 'bg-warn-500/10 border-warn-500/40 shadow-md shadow-warn-500/10'
          : isMatchCurrent
          ? 'bg-surface-hover border-line-strong'
          : 'bg-canvas border-line'
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-content-strong font-mono">{alert.symbol}</span>
          <span className="text-2xs font-medium px-1 rounded bg-surface-raised text-content-muted border border-line">
            {alert.target_type.toUpperCase()}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              alertStore.toggleAlertStatus(alert.id, alert.status);
            }}
            className={`p-1 rounded-lg transition ${
              alert.status === 'ACTIVE'
                ? 'text-accent-400 hover:bg-accent-300/20'
                : alert.status === 'TRIGGERED'
                ? 'text-warn-400 hover:bg-warn-500/20'
                : 'text-content-faint hover:bg-surface-hover'
            }`}
            title={alert.status === 'ACTIVE' ? 'Devre Dışı Bırak' : 'Aktifleştir'}
          >
            <Power className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              alertStore.deleteAlert(alert.id);
            }}
            className="p-1 text-content-faint hover:text-loss-400 hover:bg-surface-hover rounded-lg transition"
            title="Alarmı Sil"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between mt-1">
        <div className="flex items-center gap-1 text-xs font-medium text-content">
          {isRises ? (
            <TrendingUp className="w-3.5 h-3.5 text-profit-400 shrink-0" />
          ) : (
            <TrendingDown className="w-3.5 h-3.5 text-loss-400 shrink-0" />
          )}
          <span>{formatTarget(alert)}</span>
          <span className="font-mono text-warn-400 font-medium">
            {isRises ? '>' : '<'} {formatThreshold(alert.threshold_value, alert.target_type)}
          </span>
        </div>
      </div>

      {alert.note && (
        <p className="text-2xs text-content-muted mt-1 italic line-clamp-1">{alert.note}</p>
      )}

      {alert.status === 'TRIGGERED' && alert.triggered_at && (
        <div className="flex items-center gap-1 mt-1.5 text-2xs text-warn-400 font-mono">
          <Clock className="w-3 h-3" />
          <span>Tetiklendi: {new Date(alert.triggered_at).toLocaleTimeString()}</span>
        </div>
      )}
    </div>
  );
}
