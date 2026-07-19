import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen w-full bg-[#070b13] text-slate-100 overflow-x-hidden">
      <main className="w-full">
        {children}
      </main>
    </div>
  );
}
