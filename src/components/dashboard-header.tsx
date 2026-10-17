import type { ReactNode } from 'react';
import Image from 'next/image';
import { MobileSidebarTrigger } from './mobile-sidebar';

type DashboardHeaderProps = {
  title: string;
  description?: string;
  children?: ReactNode;
  showLogo?: boolean;
};

export function DashboardHeader({ title, description, children, showLogo = false }: DashboardHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-2.5 sm:gap-4 border-b bg-background px-3 py-2.5 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
      <div className="flex items-center gap-2 sm:gap-3.5 min-w-0">
        <MobileSidebarTrigger />
        {showLogo && (
          <div className="relative flex items-center justify-center h-9 w-9 sm:h-12 sm:w-12 lg:h-14 lg:w-14 rounded-xl sm:rounded-2xl overflow-hidden shadow-md sm:shadow-lg shadow-blue-500/20 border border-blue-500/30 ring-1 ring-white/10 shrink-0 transition-transform duration-200 hover:scale-105">
            <Image
              src="/car-care-logo.jpg"
              alt="Car Care"
              width={64}
              height={64}
              className="h-full w-full object-cover"
              priority
            />
          </div>
        )}
        <div className="grid gap-0 sm:gap-0.5 min-w-0">
          <h1 className="text-base sm:text-2xl lg:text-3xl font-bold tracking-tight truncate">{title}</h1>
          {description && (
            <p className="text-xs sm:text-sm text-muted-foreground truncate hidden sm:block">{description}</p>
          )}
        </div>
      </div>
      {children && (
        <div className="flex items-center gap-2 shrink-0">
          {children}
        </div>
      )}
    </header>
  );
}
