'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Car, BarChart3, Bot } from 'lucide-react';
import { Logo } from './logo';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/auth-context';

const navItems = [
  { href: '/', label: 'Mes Véhicules', icon: Car },
  { href: '/reports', label: 'Rapports', icon: BarChart3 },
  { href: '/ai-assistant', label: 'Assistant IA', icon: Bot },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();

  if (!user) return null;

  return (
    <aside className="flex h-full max-h-screen flex-col gap-2">
      <div className="flex h-[60px] items-center border-b px-6">
        <Logo />
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary',
              (pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))) && 'bg-muted text-primary'
            )}
          >
            <item.icon className="h-4 w-4" />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}
