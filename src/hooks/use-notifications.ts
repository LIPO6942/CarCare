// src/hooks/use-notifications.ts
'use client';

import { useState, useEffect } from 'react';
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

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setIsPermissionGranted(Notification.permission === 'granted');
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && isPermissionGranted) {
      const messaging = getMessaging(app);

      const unsubscribe = onMessage(messaging, (payload) => {
        console.log('Foreground message received.', payload);
        toast({
            title: payload.notification?.title || 'Nouvelle Notification',
            description: payload.notification?.body,
        });
      });

      return () => unsubscribe();
    }
  }, [toast, isPermissionGranted]);

  const requestPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      toast({ title: "Erreur", description: "Les notifications ne sont pas supportées par ce navigateur.", variant: "destructive" });
      return;
    }
    if (!user) {
       toast({ title: "Erreur", description: "Vous devez être connecté pour activer les notifications.", variant: "destructive" });
      return;
    }
    
    // Handle the case where permission is already denied.
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
        
        // Get the token
        const messaging = getMessaging(app);
        const currentToken = await getToken(messaging, {
          vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
        });

        if (currentToken) {
          // Save the token to Firestore
          await saveFcmToken({ userId: user.uid, token: currentToken });
          toast({ title: "Succès", description: "Notifications activées." });
          console.log('FCM Token saved:', currentToken);
        } else {
          toast({ title: "Erreur", description: "Impossible d'obtenir le token de notification. Veuillez réessayer.", variant: "destructive" });
        }
      } else {
        setIsPermissionGranted(false);
        toast({ title: "Info", description: "Vous avez refusé les notifications.", variant: "default" });
      }
    } catch (error) {
      console.error('An error occurred while requesting notification permission. ', error);
      toast({ title: "Erreur", description: "Une erreur est survenue lors de l'activation des notifications.", variant: "destructive" });
    } finally {
        setIsRequesting(false);
    }
  };

  return { requestPermission, isPermissionGranted, isRequesting };
}
