'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Car, BarChart3, Bot, Settings, LogOut } from 'lucide-react';
import { Logo } from './logo';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/auth-context';
import { auth } from '@/lib/firebase';
import { Button } from './ui/button';
import { useRouter } from 'next/navigation';

const navItems = [
  { href: '/', label: 'Mes Véhicules', icon: Car },
  { href: '/reports', label: 'Rapports', icon: BarChart3 },
  { href: '/ai-assistant', label: 'Assistant IA', icon: Bot },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    await auth.signOut();
    router.push('/login');
  };

  if (!user) return null;

  return (
    <aside className="hidden lg:flex flex-col w-64 bg-card border-r h-screen sticky top-0">
      <div className="p-6">
        <Logo />
      </div>
      <nav className="flex-1 px-4">
        <ul>
          {navItems.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-foreground/80 transition-colors hover:bg-accent/50 hover:text-accent-foreground',
                  (pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))) && 'bg-accent text-accent-foreground font-semibold'
                )}
              >
                <item.icon className="h-5 w-5" />
                <span>{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="p-4 border-t space-y-2">
         <Link
            href="#"
            className='flex items-center gap-3 rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-accent/50 hover:text-accent-foreground'
          >
            <Settings className="h-5 w-5" />
            <span>Paramètres</span>
        </Link>
        <Button
            variant="ghost"
            onClick={handleSignOut}
            className='w-full justify-start flex items-center gap-3 rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive'
        >
            <LogOut className="h-5 w-5" />
            <span>Déconnexion</span>
        </Button>
      </div>
    </aside>
  );
}
