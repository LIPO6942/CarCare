'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Wifi, WifiOff } from 'lucide-react';

export function PWAHandler() {
  const { toast } = useToast();
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Set initial status on client
    setIsOnline(navigator.onLine);
    // 1. Service Worker Registration
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(
          (registration) => {
            console.log('SW registered: ', registration);
          },
          (registrationError) => {
            console.log('SW registration failed: ', registrationError);
          }
        );
      });
    }

    // 2. Online/Offline status listeners
    const handleOnline = () => {
      setIsOnline(true);
      toast({
        title: "Mode En Ligne",
        description: "Vous êtes de retour en ligne. Vos données vont se synchroniser.",
        variant: "default",
        duration: 3000,
        className: "bg-green-500 text-white border-none",
      });
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast({
        title: "Mode Hors-ligne",
        description: "Vous êtes hors-ligne. Vous pouvez toujours consulter vos documents et ajouter du carburant.",
        variant: "destructive",
        duration: 5000,
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [toast]);

  // Optionally show a small banner if offline
  if (!isOnline) {
    return (
      <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-full shadow-lg animate-bounce text-sm font-medium">
        <WifiOff size={16} />
        <span>Mode Hors-ligne</span>
      </div>
    );
  }

  return null;
}
