import React from 'react';
import Sidebar, { NavigationTab } from '../components/Sidebar';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
}

export default function DashboardLayout({ children, activeTab, onSelectTab }: LayoutProps) {
  return (
    <div className="h-screen w-screen bg-[#0a0b0e] [background-image:radial-gradient(120%_100%_at_100%_0%,rgba(16,185,129,0.12),transparent_65%)] text-zinc-100 antialiased overflow-hidden flex flex-row">
      {/* Sol Navigasyon Menüsü */}
      <Sidebar activeTab={activeTab} onSelectTab={onSelectTab} />

      {/* Ana Ekran / İçerik Alanı */}
      <main className="flex-1 h-full min-w-0 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}

