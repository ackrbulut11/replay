import logoImg from '../assets/logo.jpg';
import { useAuth } from '../context/AuthContext';
import {
  LineChart,
  SlidersHorizontal,
  PlayCircle,
  Search,
  History,
  BookOpen,
  ShieldCheck,
  LogOut,
} from 'lucide-react';

export type NavigationTab = 'chart' | 'strategy' | 'replay' | 'scanner' | 'backtest' | 'journal' | 'admin';

interface SidebarProps {
  activeTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
}

export default function Sidebar({ activeTab, onSelectTab }: SidebarProps) {
  const { logout, user } = useAuth();
  const navItems: { id: NavigationTab; label: string; icon: any }[] = [
    { id: 'chart', label: 'Grafik & Analiz', icon: LineChart },
    { id: 'strategy', label: 'Strateji Motoru', icon: SlidersHorizontal },
    { id: 'replay', label: 'Replay Modu', icon: PlayCircle },
    { id: 'scanner', label: 'Scanner', icon: Search },
    { id: 'backtest', label: 'Backtest', icon: History },
    { id: 'journal', label: 'Trade Journal', icon: BookOpen },
  ];

  // Admin sekmesi yalnızca yetkili hesaba görünür. Bu sadece görsel bir
  // filtre; uçların yetkisi her istekte sunucuda ayrıca kontrol edilir.
  if (user?.is_admin) {
    navItems.push({ id: 'admin', label: 'Admin Paneli', icon: ShieldCheck });
  }

  // Genişlik buton boyutuna (40px) sabitlendi; yanlardaki boşluk kaldırıldı
  return (
    <aside className="w-[41px] bg-[#0a0b0e] border-r border-white/[0.06] flex flex-col justify-between items-center py-3 px-0 select-none shrink-0 z-30">
      {/* Brand Logo & Nav Items List */}
      <div className="w-full flex flex-col items-center">
        {/* Brand Logo Icon */}
        <div className="w-10 h-10 mb-3.5 rounded-lg overflow-hidden border border-white/[0.1] shadow-xs flex items-center justify-center bg-white/[0.02] pointer-events-none select-none">
          <img src={logoImg} alt="REPLAY Logo" className="w-full h-full object-cover opacity-90" />
        </div>

        {/* Nav Items List */}
        <nav className="space-y-2 w-full flex flex-col items-center">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <div key={item.id} className="relative group w-full flex justify-center">
                <button
                  onClick={() => onSelectTab(item.id)}
                  title={item.label}
                  className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
                    isActive
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-xs'
                      : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04] border border-transparent'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </button>

                {/* Hover Tooltip (Görsel İpucu) */}
                <div className="absolute left-full ml-2.5 top-1/2 -translate-y-1/2 px-3 py-1 bg-[#0a0b0e] text-zinc-100 text-[11px] font-medium rounded-md border border-white/[0.1] shadow-2xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap">
                  {item.label}
                </div>
              </div>
            );
          })}
        </nav>
      </div>

      {/* Footer Controls: Logout & Status Indicator */}
      <div className="flex flex-col items-center gap-2.5">
        <button
          onClick={() => logout()}
          className="w-9 h-9 rounded-lg bg-red-500/[0.06] hover:bg-red-500/15 text-red-400/90 border border-red-500/20 flex items-center justify-center transition-all cursor-pointer group relative"
          title="Çıkış Yap / Giriş Ekranına Dön"
        >
          <LogOut className="w-3.5 h-3.5" />
          <div className="absolute left-full ml-2.5 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-[#0a0b0e] text-red-300 text-[11px] font-medium rounded-md border border-red-500/20 shadow-2xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap">
            Çıkış Yap
          </div>
        </button>

        <div
          className="w-9 h-9 rounded-lg bg-white/[0.02] border border-white/[0.06] flex items-center justify-center"
          title="Engine Status: Online"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-xs shadow-emerald-400/50" />
        </div>
      </div>
    </aside>
  );
}