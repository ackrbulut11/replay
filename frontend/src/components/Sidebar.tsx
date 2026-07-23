import { LineChart, SlidersHorizontal, PlayCircle, Search, History, BookOpen } from 'lucide-react';

export type NavigationTab = 'chart' | 'strategy' | 'replay' | 'scanner' | 'backtest' | 'journal';

interface SidebarProps {
  activeTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
}

export default function Sidebar({ activeTab, onSelectTab }: SidebarProps) {
  const navItems: { id: NavigationTab; label: string; icon: any; badge?: string }[] = [
    { id: 'chart', label: 'Grafik & Analiz', icon: LineChart },
    { id: 'strategy', label: 'Strateji Motoru', icon: SlidersHorizontal, badge: 'FAZ 2' },
    { id: 'replay', label: 'Replay Modu', icon: PlayCircle },
    { id: 'scanner', label: 'Scanner', icon: Search },
    { id: 'backtest', label: 'Backtest', icon: History },
    { id: 'journal', label: 'Trade Journal', icon: BookOpen },
  ];

  return (
    <aside className="w-64 bg-[#0a0e1a] border-r border-slate-800/80 flex flex-col justify-between p-3 select-none flex-shrink-0">
      {/* Brand Header */}
      <div className="space-y-6">
        <div className="flex items-center gap-3 px-2 py-1.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <LineChart className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-xs font-bold tracking-wide text-slate-100 uppercase">Trading Platform</h1>
            <p className="text-[10px] text-slate-500 font-medium">Research & Strategy Engine</p>
          </div>
        </div>

        {/* Nav Items */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-indigo-600/15 text-indigo-300 border border-indigo-500/30 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-slate-500'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border border-indigo-500/40 bg-indigo-500/10 text-indigo-400">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Info */}
      <div className="p-3 rounded-xl bg-[#070b13]/60 border border-slate-800/60 text-[10px] text-slate-500 space-y-1">
        <div className="flex justify-between items-center text-slate-400 font-mono">
          <span>Engine Status</span>
          <span className="flex items-center gap-1 text-emerald-400 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Online
          </span>
        </div>
        <p className="text-slate-600">Local Sidecar Architecture v2.0</p>
      </div>
    </aside>
  );
}