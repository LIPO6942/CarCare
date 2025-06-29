'use client'

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, Car, BarChart3, Bot, Settings, LogOut } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Logo } from './logo';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { auth } from '@/lib/firebase';

const navItems = [
  { href: '/', label: 'Mes Véhicules', icon: Car },
  { href: '/reports', label: 'Rapports', icon: BarChart3 },
  { href: '/ai-assistant', label: 'Assistant IA', icon: Bot },
];

export function MobileSidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const [isOpen, setIsOpen] = useState(false);
    const { user } = useAuth();

    const handleSignOut = async () => {
        await auth.signOut();
        setIsOpen(false);
        router.push('/login');
    };

    if (!user) return null;

    return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6 lg:hidden">
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <Button size="icon" variant="outline" className="lg:hidden">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle Menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="sm:max-w-xs flex flex-col p-0">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <SheetDescription className="sr-only">
                Menu de navigation principal
            </SheetDescription>
            <div className="p-4 border-b">
                <Logo />
            </div>
            <nav className="grid gap-2 text-lg font-medium flex-1 p-4">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={cn(
                    'flex items-center gap-4 px-2.5 text-muted-foreground hover:text-foreground',
                     (pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))) && 'text-foreground'
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="p-4 border-t space-y-2">
                <Link
                    href="#"
                    onClick={() => setIsOpen(false)}
                    className="flex items-center gap-4 px-2.5 text-muted-foreground hover:text-foreground"
                >
                    <Settings className="h-5 w-5" />
                    Paramètres
                </Link>
                <Button
                    variant="ghost"
                    onClick={handleSignOut}
                    className="w-full justify-start flex items-center gap-4 px-2.5 text-muted-foreground hover:text-foreground"
                >
                    <LogOut className="h-5 w-5" />
                    Déconnexion
                </Button>
            </div>
          </SheetContent>
        </Sheet>
    </header>
    )
}
