import type { ReactNode } from 'react';
import { Logo } from './logo';

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
        {showLogo && <Logo />}
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
