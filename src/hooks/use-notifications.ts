// src/hooks/use-notifications.ts
'use client';

import { useState, useEffect, useCallback } from 'react';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { app } from '@/lib/firebase';
import { useAuth } from '@/context/auth-context';
import { saveFcmToken } from '@/lib/data';
import { useToast } from './use-toast';

export function useNotifications() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isPermissionGranted, setIsPermissionGranted] = useState<boolean | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);

  // Function to check and update permission status
  const checkPermission = useCallback(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setIsPermissionGranted(Notification.permission === 'granted');
    }
  }, []);

  // Check initial permission status on mount and when tab becomes visible
  useEffect(() => {
    checkPermission(); // Check on initial load

    const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
            checkPermission(); // Re-check when tab is focused
        }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [checkPermission]);
  
  // Effect for handling foreground messages
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && isPermissionGranted) {
      try {
        const messaging = getMessaging(app);
        const unsubscribe = onMessage(messaging, (payload) => {
          console.log('Foreground message received.', payload);
          toast({
              title: payload.notification?.title || 'Nouvelle Notification',
              description: payload.notification?.body,
          });
        });
        return () => unsubscribe();
      } catch (error) {
        console.error("Error setting up foreground message handler", error);
      }
    }
  }, [toast, isPermissionGranted]);

  const requestPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window) || !user) {
      toast({ title: "Erreur", description: "Les notifications ne peuvent pas être activées.", variant: "destructive" });
      return;
    }
    
    if (Notification.permission === 'denied') {
        toast({
            title: "Permissions bloquées",
            description: "Vous avez bloqué les notifications. Veuillez les autoriser dans les paramètres de votre navigateur pour ce site.",
            variant: "destructive",
            duration: 10000,
        });
        return;
    }

    setIsRequesting(true);

    try {
      const permission = await Notification.requestPermission();
      
      if (permission === 'granted') {
        setIsPermissionGranted(true);
        
        if (!process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY) {
            console.error("VAPID key is missing from environment variables.");
            throw new Error("La configuration des notifications est incomplète côté serveur.");
        }

        const messaging = getMessaging(app);
        const currentToken = await getToken(messaging, {
          vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
        });

        if (currentToken) {
          await saveFcmToken({ userId: user.uid, token: currentToken });
          console.log('FCM Token saved:', currentToken);
          toast({ title: "Succès", description: "Notifications activées et token enregistré." });
        } else {
          throw new Error("Impossible d'obtenir le token. Le Service Worker est peut-être mal configuré ou l'enregistrement a échoué.");
        }

      } else {
        setIsPermissionGranted(false);
        toast({ title: "Info", description: "Vous avez refusé la permission pour les notifications." });
      }

    } catch (error) {
      console.error('An error occurred during notification setup: ', error);
      const errorMessage = error instanceof Error ? error.message : "Une erreur inconnue est survenue.";
      toast({ title: "Erreur de Notification", description: errorMessage, variant: "destructive" });
      setIsPermissionGranted(false);
    } finally {
        setIsRequesting(false);
    }
  }, [user, toast]);

  return { requestPermission, isPermissionGranted, isRequesting };
}
