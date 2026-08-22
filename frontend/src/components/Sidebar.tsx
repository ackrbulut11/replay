import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
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
  PanelLeftOpen,
  PanelLeftClose,
} from 'lucide-react';

export type NavigationTab = 'chart' | 'strategy' | 'replay' | 'scanner' | 'backtest' | 'journal' | 'admin';

interface SidebarProps {
  activeTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
}

export default function Sidebar({ activeTab, onSelectTab }: SidebarProps) {
  const { logout, user } = useAuth();

  /**
   * Rayın etiketli hâli.
   *
   * Ray ikon-only ve etiketler yalnızca hover'da beliriyordu — dokunmatik bir
   * cihazda hover diye bir şey yok, yani "Scanner" ile "Backtest" ikonları
   * telefonda hiç ayırt edilemiyordu. Bu düğme rayı etiketli bir çekmeceye
   * açar; içerik daralmasın diye çekmece yer kaplamaz, üstüne biner.
   */
  const [isExpanded, setIsExpanded] = useState(false);

  // Escape ile kapan — açık bir katmanın klavyeyle kapatılabilmesi gerekir.
  useEffect(() => {
    if (!isExpanded) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsExpanded(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isExpanded]);

  const navItems: { id: NavigationTab; label: string; icon: LucideIcon }[] = [
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

  const handleSelect = (tab: NavigationTab) => {
    onSelectTab(tab);
    setIsExpanded(false);
  };

  // Genişlik buton boyutuna (40px) sabitlendi; grafik alanı pahalı, ray dar
  // kalıyor. Aktif sekme bu yüzden dolgu değil, sol kenardaki 2px'lik bir
  // çubukla işaretleniyor — dar rayda dolgu, ikonu boğuyordu.
  //
  // Dokunmatikte düğmeler 32px değil 40px: rayın tam genişliği, parmak için
  // en az bu kadarı gerekiyor ve dikey aralık komşu hedefe taşmıyor.
  return (
    <>
      {/* Çekmece açıkken dışarı dokunuş kapatır. */}
      {isExpanded && (
        <div
          aria-hidden
          onClick={() => setIsExpanded(false)}
          className="sheet-backdrop fixed inset-0 z-30 animate-fadeIn lg:hidden"
        />
      )}

      <aside className="relative z-40 w-[41px] shrink-0 select-none">
        <div
          /* `pb-safe`: ana ekran çizgisi olan telefonlarda en alttaki çıkış
             düğmesi o çizginin altında kalıyordu. Sol tarafa güvenli alan
             payı VERİLMEZ — ray 41px sabit ve içeriden dolgu vermek ikonları
             sıkıştırırdı. */
          className={`pb-safe absolute inset-y-0 left-0 flex flex-col justify-between border-r border-line bg-surface py-3 transition-[width] duration-150 ease-out ${
            isExpanded ? 'w-[208px] shadow-2xl' : 'w-[41px]'
          }`}
        >
          <div className={`flex w-full flex-col ${isExpanded ? 'items-stretch px-2' : 'items-center'}`}>
            <div className={`mb-4 flex items-center ${isExpanded ? 'justify-between gap-2' : 'flex-col gap-2'}`}>
              <img
                src={logoImg}
                alt="REPLAY"
                className="pointer-events-none h-8 w-8 shrink-0 rounded-md object-cover opacity-90"
              />

              {/* Ray yalnızca dar ekranlarda açılır: masaüstünde etiketler
                  zaten hover'da geliyor ve grafik alanı kıymetli. */}
              <button
                onClick={() => setIsExpanded((v) => !v)}
                aria-expanded={isExpanded}
                aria-label={isExpanded ? 'Menüyü daralt' : 'Menüyü genişlet'}
                className="tap-target flex h-8 w-8 items-center justify-center rounded-md text-content-faint transition-colors ease-out hover:bg-surface-hover hover:text-content lg:hidden"
              >
                {isExpanded ? (
                  <PanelLeftClose className="h-4 w-4" strokeWidth={1.75} />
                ) : (
                  <PanelLeftOpen className="h-4 w-4" strokeWidth={1.75} />
                )}
              </button>
            </div>

            <nav
              aria-label="Ana gezinme"
              className={`flex w-full flex-col gap-1.5 ${isExpanded ? 'items-stretch' : 'items-center'}`}
            >
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;

                return (
                  <div key={item.id} className={`group relative flex w-full ${isExpanded ? '' : 'justify-center'}`}>
                    {/* Aktif sekme işareti. Düğmenin İÇİNDE `-left-[6.5px]`
                        ile duruyordu: 41px'lik rayda düğme 4.5px'ten başlıyor,
                        yani işaret -2px'e düşüyor ve tamamen ekran dışında
                        kalıyordu — hangi sekmede olduğunuzu gösteren tek
                        işaret hiç görünmüyordu. Artık rayın kendi sol
                        kenarına, düğme boyutundan bağımsız olarak konumlanır. */}
                    {isActive && !isExpanded && (
                      <span
                        aria-hidden
                        className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent-400"
                      />
                    )}
                    <button
                      onClick={() => handleSelect(item.id)}
                      aria-current={isActive ? 'page' : undefined}
                      aria-label={item.label}
                      className={`relative flex items-center rounded-md transition-colors ease-out ${
                        isExpanded
                          ? 'h-10 w-full gap-2.5 px-2.5 text-sm'
                          : 'h-8 w-8 justify-center touch:h-10 touch:w-10'
                      } ${
                        isActive
                          ? 'bg-accent-950 text-accent-300'
                          : 'text-content-faint hover:bg-surface-hover hover:text-content'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                      {isExpanded && <span className="truncate">{item.label}</span>}
                    </button>

                    {/* Ray ikon-only; etiket yalnızca hover'da görünür. Bu yüzden
                        butonun kendisinde aria-label var — tooltip erişilebilirlik
                        için yeterli değil. Çekmece açıkken etiket zaten satırda,
                        tooltip ikinci kez yazmaz. */}
                    {!isExpanded && (
                      <span
                        role="tooltip"
                        className="pointer-events-none absolute left-full top-1/2 z-50 ml-2.5 -translate-y-1/2 whitespace-nowrap rounded-md border border-line bg-surface-overlay px-2.5 py-1 text-2xs text-content opacity-0 shadow-md transition-opacity ease-out group-hover:opacity-100"
                      >
                        {item.label}
                      </span>
                    )}
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
          <div className={`group relative flex w-full ${isExpanded ? 'px-2' : 'justify-center'}`}>
            <button
              onClick={() => logout()}
              aria-label="Çıkış yap"
              className={`flex items-center rounded-md text-content-faint transition-colors ease-out hover:bg-loss-950 hover:text-loss-400 ${
                isExpanded ? 'h-10 w-full gap-2.5 px-2.5 text-sm' : 'h-8 w-8 justify-center touch:h-10 touch:w-10'
              }`}
            >
              <LogOut className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
              {isExpanded && <span>Çıkış yap</span>}
            </button>
            {!isExpanded && (
              <span
                role="tooltip"
                className="pointer-events-none absolute left-full top-1/2 z-50 ml-2.5 -translate-y-1/2 whitespace-nowrap rounded-md border border-line bg-surface-overlay px-2.5 py-1 text-2xs text-content opacity-0 shadow-md transition-opacity ease-out group-hover:opacity-100"
              >
                Çıkış yap
              </span>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
