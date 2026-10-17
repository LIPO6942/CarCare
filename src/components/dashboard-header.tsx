import type { ReactNode } from 'react';
import Image from 'next/image';

type DashboardHeaderProps = {
  title: string;
  description?: string;
  children?: ReactNode;
  showLogo?: boolean;
};

export function DashboardHeader({ title, description, children, showLogo = false }: DashboardHeaderProps) {
  return (
    <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b bg-background p-4 sm:p-6 lg:p-8">
      <div className="flex items-center gap-4">
        {showLogo && (
          <div className="relative flex items-center justify-center h-12 w-12 sm:h-14 sm:w-14 rounded-2xl overflow-hidden shadow-lg shadow-blue-500/20 border border-blue-500/30 ring-1 ring-white/10 shrink-0 transition-transform duration-200 hover:scale-105">
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
        <div className="grid gap-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{title}</h1>
          {description && (
            <p className="text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {children}
      </div>
    </header>
  );
}
