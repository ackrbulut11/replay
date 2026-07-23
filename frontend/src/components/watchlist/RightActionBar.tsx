import { Bookmark, Clock, BarChart2, Layers, ChevronRight, ChevronLeft, Plus } from 'lucide-react';
import { useWatchlistStore, watchlistStore } from '../../store/watchlistStore';

interface RightActionBarProps {
  onOpenSearchModal: () => void;
}

export default function RightActionBar({ onOpenSearchModal }: RightActionBarProps) {
  const [state] = useWatchlistStore();

  const activeGroup = state.lists.find((g) => g.id === state.activeListId);
  const itemCount = activeGroup ? activeGroup.items.length : 0;

  return (
    <div className="w-11 h-full bg-[#0d1321] border-l border-slate-800 flex flex-col items-center justify-between py-2.5 z-20 select-none shrink-0">
      {/* Top Action Tools */}
      <div className="flex flex-col items-center gap-2.5 w-full">
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

        <div className="w-6 h-px bg-slate-800/80 my-1" />

        {/* Watchlist Icon Button */}
        <div className="relative">
          <button
            onClick={() => watchlistStore.setActiveRightTool('watchlist')}
            className={`p-2 rounded-xl transition-all relative group ${
              state.isOpen && state.activeRightTool === 'watchlist'
                ? 'bg-indigo-600/30 text-indigo-400 border border-indigo-500/40 shadow-lg shadow-indigo-500/10'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
            title="Favoriler & İzleme Listesi (Watchlist)"
          >
            <Bookmark className="w-4 h-4 fill-current" />

            {/* Item Count Badge */}
            {itemCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-indigo-500 text-white text-[9px] font-bold px-1 py-0.2 rounded-full min-w-[14px] text-center leading-none">
                {itemCount}
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

        {/* Alerts / Alarmlar Button */}
        <button
          onClick={() => watchlistStore.setActiveRightTool('alerts')}
          className={`p-2 rounded-xl transition-all ${
            state.isOpen && state.activeRightTool === 'alerts'
              ? 'bg-indigo-600/30 text-indigo-400 border border-indigo-500/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
          title="Fiyat Alarmları"
        >
          <Clock className="w-4 h-4" />
        </button>

        {/* Hotlist / Stats Button */}
        <button
          onClick={() => watchlistStore.setActiveRightTool('stats')}
          className={`p-2 rounded-xl transition-all ${
            state.isOpen && state.activeRightTool === 'stats'
              ? 'bg-indigo-600/30 text-indigo-400 border border-indigo-500/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
          title="Piyasa İstatistikleri"
        >
          <BarChart2 className="w-4 h-4" />
        </button>

        {/* Layers / Object Tree Button */}
        <button
          onClick={() => watchlistStore.setActiveRightTool('layers')}
          className={`p-2 rounded-xl transition-all ${
            state.isOpen && state.activeRightTool === 'layers'
              ? 'bg-indigo-600/30 text-indigo-400 border border-indigo-500/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
          title="Grafik Katmanları"
        >
          <Layers className="w-4 h-4" />
        </button>
      </div>

      {/* Bottom status indicator */}
      <div className="flex flex-col items-center gap-2">
        <div 
          className={`w-2 h-2 rounded-full ${state.isOpen ? 'bg-emerald-500 animate-pulse' : 'bg-slate-700'}`} 
          title={state.isOpen ? 'Panel Açık' : 'Panel Kapalı'}
        />
      </div>
    </div>
  );
}
