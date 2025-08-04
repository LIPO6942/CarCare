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

  // Check initial permission status on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setIsPermissionGranted(Notification.permission === 'granted');
    }
  }, []);
  
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
        
        // --- Token retrieval is now here ---
        if (!process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY) {
            throw new Error("VAPID key is not configured in .env file.");
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
          // This case is unlikely if permission is granted, but good to have
          throw new Error("Impossible d'obtenir le token de notification. L'enregistrement du Service Worker a peut-être échoué.");
        }

      } else {
        setIsPermissionGranted(false);
        toast({ title: "Info", description: "Vous avez refusé la permission pour les notifications." });
      }

    } catch (error) {
      console.error('An error occurred during notification setup: ', error);
      const errorMessage = error instanceof Error ? error.message : "Une erreur inconnue est survenue.";
      toast({ title: "Erreur de Notification", description: errorMessage, variant: "destructive" });
      setIsPermissionGranted(false); // Reset state on error
    } finally {
        setIsRequesting(false);
    }
  }, [user, toast]);

  return { requestPermission, isPermissionGranted, isRequesting };
}
