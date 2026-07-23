import {
  LineChart,
  SlidersHorizontal,
  PlayCircle,
  Search,
  History,
  BookOpen,
} from 'lucide-react';

export type NavigationTab = 'chart' | 'strategy' | 'replay' | 'scanner' | 'backtest' | 'journal';

interface SidebarProps {
  activeTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
}

export default function Sidebar({ activeTab, onSelectTab }: SidebarProps) {
  const navItems: { id: NavigationTab; label: string; icon: any }[] = [
    { id: 'chart', label: 'Grafik & Analiz', icon: LineChart },
    { id: 'strategy', label: 'Strateji Motoru', icon: SlidersHorizontal },
    { id: 'replay', label: 'Replay Modu', icon: PlayCircle },
    { id: 'scanner', label: 'Scanner', icon: Search },
    { id: 'backtest', label: 'Backtest', icon: History },
    { id: 'journal', label: 'Trade Journal', icon: BookOpen },
  ];

  return (
    <aside className="w-14 bg-[#0a0e1a] border-r border-slate-800/80 flex flex-col justify-between items-center py-3 px-1.5 select-none flex-shrink-0">
      {/* Nav Items List */}
      <nav className="space-y-2 w-full flex flex-col items-center pt-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <div key={item.id} className="relative group w-full flex justify-center">
              <button
                onClick={() => onSelectTab(item.id)}
                title={item.label}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                  isActive
                    ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/40 shadow-lg shadow-indigo-500/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <Icon className="w-4 h-4" />
              </button>

              {/* Hover Tooltip (Görsel İpucu) */}
              <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-slate-900 text-slate-100 text-xs font-medium rounded-lg border border-slate-700 shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap">
                {item.label}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Footer Status Indicator */}
      <div
        className="w-8 h-8 rounded-xl bg-[#070b13]/60 border border-slate-800/60 flex items-center justify-center"
        title="Engine Status: Online"
      >
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
      </div>
    </aside>
  );
}