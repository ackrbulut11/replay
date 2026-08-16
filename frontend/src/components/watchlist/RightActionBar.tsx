import { Bookmark, Bell, ChevronRight, ChevronLeft } from 'lucide-react';
import { useWatchlistStore, watchlistStore } from '../../store/watchlistStore';
import { useAlertStore } from '../../store/alertStore';

interface RightActionBarProps {
  onOpenSearchModal?: () => void;
}

export default function RightActionBar(_props: RightActionBarProps) {
  const [state] = useWatchlistStore();
  const [alertState] = useAlertStore();

  // Total items across all lists (deduplicated by item id)
  const allIds = new Set<string>();
  state.lists.forEach(g => g.items.forEach(i => allIds.add(i.id)));
  const totalCount = allIds.size;
  const alertCount = alertState.alerts.filter(a => a.status === 'ACTIVE' || a.status === 'TRIGGERED').length;


  const isWatchlistActive = state.isOpen && state.activeRightTool === 'watchlist';
  const isAlertsActive = state.isOpen && state.activeRightTool === 'alerts';

  // Genişlik sol menü ile aynı (41px); buton boyutları korundu.
  //
  // Dar ekranda gizli: 375px'lik bir telefonda bu ray + izleme listesi paneli
  // + sol gezinme rayı grafiğe hiç yer bırakmıyordu. Aynı iki düğme (izleme
  // listesi, alarmlar) orada grafik araç çubuğunun genişletilmiş satırında yer
  // alır (bkz. CandleChart), yani işlev kaybolmaz — yerini değiştirir.
  return (
    <div className="hidden w-[41px] h-full bg-canvas border-l border-line lg:flex flex-col items-center justify-between py-3 z-20 select-none shrink-0">
      {/* Top Action Tools */}
      <div className="flex flex-col items-center gap-2.5 w-full">
        {/* Toggle Collapse/Expand Button */}
        <button
          onClick={() => watchlistStore.togglePanel()}
          className="p-2 text-content-muted hover:text-content-strong hover:bg-white/[0.04] rounded-lg transition-all"
          title={state.isOpen ? 'Yan Paneli Kapat' : 'Yan Paneli Aç'}
        >
          {state.isOpen ? (
            <ChevronRight className="w-4 h-4 text-content-muted" />
          ) : (
            <ChevronLeft className="w-4 h-4 text-accent-400" />
          )}
        </button>

        <div className="w-5 h-px bg-white/[0.06]" />

        {/* Watchlist (Favoriler) Icon Button */}
        <div className="relative">
          <button
            onClick={() => watchlistStore.setActiveRightTool('watchlist')}
            className={`p-2 rounded-lg transition-all relative group ${
              isWatchlistActive
                ? 'bg-accent-500/15 text-accent-400 border border-accent-500/30 shadow-xs'
                : 'text-content-muted hover:text-content-strong hover:bg-white/[0.04]'
            }`}
            title="Favoriler & İzleme Listesi"
          >
            <Bookmark className={`w-4 h-4 ${isWatchlistActive ? 'fill-accent-400' : ''}`} />

            {/* Item Count Badge */}
            {totalCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-accent-400 text-ink-950 text-2xs font-medium px-1 rounded-full min-w-[14px] text-center leading-[14px]">
                {totalCount > 99 ? '99+' : totalCount}
              </span>
            )}
          </button>
        </div>

        {/* Alarm / Alerts Button */}
        <div className="relative">
          <button
            onClick={() => watchlistStore.setActiveRightTool('alerts')}
            className={`p-2 rounded-lg transition-all relative group ${
              isAlertsActive
                ? 'bg-accent-500/15 text-accent-400 border border-accent-500/30 shadow-xs'
                : 'text-content-muted hover:text-content-strong hover:bg-white/[0.04]'
            }`}
            title="Fiyat & İndikatör Alarmları"
          >
            <Bell className={`w-4 h-4 ${isAlertsActive ? 'fill-accent-400' : ''}`} />

            {/* Alert Count Badge */}
            {alertCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-warn-400 text-ink-950 text-2xs font-medium px-1 rounded-full min-w-[14px] text-center leading-[14px]">
                {alertCount > 99 ? '99+' : alertCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Bottom status dot */}
      <div className="flex flex-col items-center gap-2">
        <div
          className={`w-2 h-2 rounded-full transition-colors ${state.isOpen ? 'bg-accent-400 animate-pulse' : 'bg-ink-650'}`}
          title={state.isOpen ? 'Panel Açık' : 'Panel Kapalı'}
        />
      </div>
    </div>
  );
}
