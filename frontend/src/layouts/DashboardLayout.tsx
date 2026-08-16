import React from 'react';
import Sidebar, { NavigationTab } from '../components/Sidebar';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
}

export default function DashboardLayout({ children, activeTab, onSelectTab }: LayoutProps) {
  return (
    /* Zemindeki yeşil radyal parıltı kaldırıldı: yeşil bu üründe kâr demek,
       dekorasyon değil — üstelik grafiğin yeşil mumlarıyla aynı kadrajda
       yarışıyordu. Zemin artık düz; derinlik panel kenarlarından geliyor. */
    /* lang="tr": index.html'de `<html lang="en">` yazıyor çünkü herkese açık
       landing sayfası İngilizce. Uygulamanın içi Türkçe ve bu bir yazım
       farkından fazlası — CSS `text-transform:` İngilizce
       kurallarıyla "ısınma"yı "ISINMA" değil yanlış eşler, "İ"nin noktasını
       düşürür. Tarayıcının doğru harita için dili bilmesi gerekiyor. */
    <div
      lang="tr"
      className="flex h-screen w-screen flex-row overflow-hidden bg-canvas text-content antialiased"
    >
      {/* Sol Navigasyon Menüsü */}
      <Sidebar activeTab={activeTab} onSelectTab={onSelectTab} />

      {/* Ana Ekran / İçerik Alanı */}
      <main className="flex-1 h-full min-w-0 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}

