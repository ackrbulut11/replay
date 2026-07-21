import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: LayoutProps) {
  return (
    <div className="h-screen w-screen bg-[#070b13] text-slate-100 overflow-hidden flex flex-col">
      <main className="w-full h-full flex flex-col flex-1 min-h-0">
        {children}
      </main>
    </div>
  );
}
