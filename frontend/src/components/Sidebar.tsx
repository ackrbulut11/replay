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

  // Genişlik buton boyutuna (40px) sabitlendi; grafik alanı pahalı, ray dar
  // kalıyor. Aktif sekme bu yüzden dolgu değil, sol kenardaki 2px'lik bir
  // çubukla işaretleniyor — dar rayda dolgu, ikonu boğuyordu.
  return (
    <aside className="z-30 flex w-[41px] shrink-0 select-none flex-col justify-between items-center border-r border-line bg-surface py-3">
      <div className="flex w-full flex-col items-center">
        <img
          src={logoImg}
          alt="REPLAY"
          className="pointer-events-none mb-4 h-8 w-8 rounded-md object-cover opacity-90"
        />

        <nav aria-label="Ana gezinme" className="flex w-full flex-col items-center gap-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <div key={item.id} className="group relative flex w-full justify-center">
                <button
                  onClick={() => onSelectTab(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={item.label}
                  className={`relative flex h-8 w-8 items-center justify-center rounded-md transition-colors ease-out ${
                    isActive
                      ? 'bg-accent-950 text-accent-300'
                      : 'text-content-faint hover:bg-surface-hover hover:text-content'
                  }`}
                >
                  {isActive && (
                    <span
                      aria-hidden
                      className="absolute -left-[6.5px] h-4 w-0.5 rounded-full bg-accent-400"
                    />
                  )}
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                </button>

                {/* Ray ikon-only; etiket yalnızca hover'da görünür. Bu yüzden
                    butonun kendisinde aria-label var — tooltip erişilebilirlik
                    için yeterli değil. */}
                <span
                  role="tooltip"
                  className="pointer-events-none absolute left-full top-1/2 z-50 ml-2.5 -translate-y-1/2 whitespace-nowrap rounded-md border border-line bg-surface-overlay px-2.5 py-1 text-2xs text-content opacity-0 shadow-md transition-opacity ease-out group-hover:opacity-100"
                >
                  {item.label}
                </span>
              </div>
            );
          })}
        </nav>
      </div>

      {/* Alt: çıkış.
          Kalıcı kırmızı bir buton rayın dibinde sürekli alarm veriyordu; çıkış
          yıkıcı değil, geri alınabilir bir eylem. Nötr duruyor, niyeti
          hover'da kırmızıya dönerek gösteriyor.

          Buradaki "Engine Status: Online" göstergesi kaldırıldı: sabit kodlu
          yeşil bir noktaydı, hiçbir şeyi ölçmüyordu ve her koşulda "çevrimiçi"
          diyordu. Gerçek bir sağlık sinyali bağlanana kadar yokluğu, yanlış
          olmasından iyi. */}
      <div className="group relative flex w-full justify-center">
        <button
          onClick={() => logout()}
          aria-label="Çıkış yap"
          className="flex h-8 w-8 items-center justify-center rounded-md text-content-faint transition-colors ease-out hover:bg-loss-950 hover:text-loss-400"
        >
          <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
        <span
          role="tooltip"
          className="pointer-events-none absolute left-full top-1/2 z-50 ml-2.5 -translate-y-1/2 whitespace-nowrap rounded-md border border-line bg-surface-overlay px-2.5 py-1 text-2xs text-content opacity-0 shadow-md transition-opacity ease-out group-hover:opacity-100"
        >
          Çıkış yap
        </span>
      </div>
    </aside>
  );
}
