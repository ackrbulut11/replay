import { Bookmark, Bell, ChevronRight, ChevronLeft, Plus } from 'lucide-react';
import { useWatchlistStore, watchlistStore } from '../../store/watchlistStore';
import { useAlertStore } from '../../store/alertStore';

interface RightActionBarProps {
  onOpenSearchModal: () => void;
}

export default function RightActionBar({ onOpenSearchModal }: RightActionBarProps) {
  const [state] = useWatchlistStore();
  const [alertState] = useAlertStore();

  // Total items across all lists (deduplicated by item id)
  const allIds = new Set<string>();
  state.lists.forEach(g => g.items.forEach(i => allIds.add(i.id)));
  const totalCount = allIds.size;
  const alertCount = alertState.alerts.filter(a => a.status === 'ACTIVE' || a.status === 'TRIGGERED').length;


  const isWatchlistActive = state.isOpen && state.activeRightTool === 'watchlist';
  const isAlertsActive = state.isOpen && state.activeRightTool === 'alerts';

  return (
    <div className="w-11 h-full bg-[#0d1321] border-l border-slate-800 flex flex-col items-center justify-between py-2.5 z-20 select-none shrink-0">
      {/* Top Action Tools */}
      <div className="flex flex-col items-center gap-2 w-full">

        {/* Toggle Collapse/Expand Button */}
        <button
          onClick={() => watchlistStore.togglePanel()}
          className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 rounded-xl transition-all"
          title={state.isOpen ? 'Yan Paneli Kapat' : 'Yan Paneli Aç'}
        >
          {state.isOpen ? (
            <ChevronRight className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronLeft className="w-4 h-4 text-indigo-400" />
          )}
        </button>

        <div className="w-6 h-px bg-slate-800/80" />

        {/* Watchlist (Favoriler) Icon Button */}
        <div className="relative">
          <button
            onClick={() => watchlistStore.setActiveRightTool('watchlist')}
            className={`p-2 rounded-xl transition-all relative group ${
              isWatchlistActive
                ? 'bg-indigo-600/30 text-indigo-400 border border-indigo-500/40 shadow-lg shadow-indigo-500/10'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
            title="Favoriler & İzleme Listesi"
          >
            <Bookmark className={`w-4 h-4 ${isWatchlistActive ? 'fill-indigo-400' : ''}`} />

            {/* Item Count Badge */}
            {totalCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-indigo-500 text-white text-[9px] font-bold px-1 rounded-full min-w-[14px] text-center leading-[14px]">
                {totalCount > 99 ? '99+' : totalCount}
              </span>
            )}
          </button>
        </div>

        {/* Quick Add Symbol Button */}
        <button
          onClick={onOpenSearchModal}
          className="p-2 text-slate-400 hover:text-indigo-400 hover:bg-slate-800/50 rounded-xl transition-all"
          title="Listeye Sembol Ekle (+)"
        >
          <Plus className="w-4 h-4" />
        </button>

        {/* Alarm / Alerts Button */}
        <div className="relative">
          <button
            onClick={() => watchlistStore.setActiveRightTool('alerts')}
            className={`p-2 rounded-xl transition-all relative group ${
              isAlertsActive
                ? 'bg-amber-600/30 text-amber-400 border border-amber-500/40 shadow-lg shadow-amber-500/10'
                : 'text-slate-400 hover:text-amber-400 hover:bg-slate-800/50'
            }`}
            title="Fiyat & İndikatör Alarmları"
          >
            <Bell className={`w-4 h-4 ${isAlertsActive ? 'fill-amber-400' : ''}`} />

            {/* Alert Count Badge */}
            {alertCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-amber-500 text-slate-950 text-[9px] font-extrabold px-1 rounded-full min-w-[14px] text-center leading-[14px]">
                {alertCount > 99 ? '99+' : alertCount}
              </span>
            )}
          </button>
        </div>


      </div>

      {/* Bottom status dot */}
      <div className="flex flex-col items-center gap-2">
        <div
          className={`w-2 h-2 rounded-full transition-colors ${state.isOpen ? 'bg-emerald-500 animate-pulse' : 'bg-slate-700'}`}
          title={state.isOpen ? 'Panel Açık' : 'Panel Kapalı'}
        />
      </div>
    </div>
  );
}
