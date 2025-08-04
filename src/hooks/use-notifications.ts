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

  // Effect to retrieve and save FCM token when permission is granted
  useEffect(() => {
    const retrieveToken = async () => {
      if (isPermissionGranted && user && process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY) {
        try {
          const messaging = getMessaging(app);
          const currentToken = await getToken(messaging, {
            vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
          });

          if (currentToken) {
            await saveFcmToken({ userId: user.uid, token: currentToken });
            console.log('FCM Token saved:', currentToken);
            // Optionally, inform the user, but the UI state is the main feedback
          } else {
            console.error('No registration token available. Request permission to generate one.');
            toast({ title: "Erreur de Token", description: "Impossible d'obtenir le token de notification. L'enregistrement du Service Worker a peut-être échoué.", variant: "destructive" });
             setIsPermissionGranted(false); // Reset state as we failed
          }
        } catch (error) {
          console.error('An error occurred while retrieving token. ', error);
          toast({ title: "Erreur de Token", description: "Impossible d'obtenir le token. Vérifiez la console pour plus de détails.", variant: "destructive" });
          setIsPermissionGranted(false); // Reset state as we failed
        }
      }
    };

    retrieveToken();
  }, [isPermissionGranted, user, toast]);


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
    if (typeof window === 'undefined' || !('Notification' in window)) {
      toast({ title: "Non supporté", description: "Les notifications ne sont pas supportées par ce navigateur.", variant: "destructive" });
      return;
    }
    if (!user) {
       toast({ title: "Erreur", description: "Vous devez être connecté pour activer les notifications.", variant: "destructive" });
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
        toast({ title: "Succès", description: "Notifications activées. Le token sera enregistré." });
        setIsPermissionGranted(true);
      } else {
        toast({ title: "Info", description: "Vous avez refusé les notifications.", variant: "default" });
        setIsPermissionGranted(false);
      }
    } catch (error) {
      console.error('An error occurred while requesting notification permission. ', error);
      toast({ title: "Erreur", description: "Une erreur est survenue lors de la demande de permission.", variant: "destructive" });
    } finally {
        setIsRequesting(false);
    }
  }, [user, toast]);

  return { requestPermission, isPermissionGranted, isRequesting };
}
