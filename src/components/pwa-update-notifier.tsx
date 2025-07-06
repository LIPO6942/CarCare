/// <reference types="workbox-window" />

'use client';

import { useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';

// This allows us to use `window.workbox` without TypeScript errors.
declare global {
  interface Window {
    workbox: any;
  }
}

export function PwaUpdateNotifier() {
  const { toast } = useToast();

  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      window.workbox !== undefined
    ) {
      const wb = window.workbox;

      const promptNewVersionAvailable = () => {
        const { dismiss } = toast({
          title: 'Une nouvelle version est disponible !',
          description: 'Rechargez pour appliquer les dernières mises à jour.',
          duration: Infinity, // Keep the toast open until the user acts
          action: (
            <Button
              onClick={() => {
                // Send a message to the waiting service worker to activate it.
                wb.messageSW({ type: 'SKIP_WAITING' });
                // Dismiss the toast once the user clicks the button
                dismiss();
              }}
            >
              Mettre à jour
            </Button>
          ),
        });
      };
      
      // Listen for a waiting service worker. This means a new version of the app is available.
      wb.addEventListener('waiting', promptNewVersionAvailable);

      // Listen for when the new service worker has taken control.
      // After it takes control, we reload the page to get the new assets.
      wb.addEventListener('controlling', () => {
        window.location.reload();
      });

      // Register the service worker.
      // `next-pwa` will generate the service worker file in the `public` directory.
      wb.register();
    }
  }, [toast]);

  return null;
}
