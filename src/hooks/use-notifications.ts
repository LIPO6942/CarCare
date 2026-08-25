// src/hooks/use-notifications.ts
'use client';

import { useState, useEffect, useCallback } from 'react';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { app } from '@/lib/firebase';
import { useAuth } from '@/context/auth-context';
import { saveFcmToken } from '@/lib/data';
import { useToast } from './use-toast';

async function getOrRegisterServiceWorker(): Promise<ServiceWorkerRegistration | undefined> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return undefined;
  }
  try {
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/',
      updateViaCache: 'none'
    });
    await navigator.serviceWorker.ready;
    return registration;
  } catch (error) {
    console.error('Failed to register firebase-messaging-sw.js:', error);
    return undefined;
  }
}

export function useNotifications() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isPermissionGranted, setIsPermissionGranted] = useState<boolean | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission | null>(null);

  // This function attempts to get and save the FCM token with the unified Service Worker.
  const syncFcmToken = useCallback(async () => {
    if (!user || typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
      setIsPermissionGranted(false);
      return;
    }
    
    try {
        if (!process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY) {
            console.error("VAPID key is missing from environment variables.");
            throw new Error("La configuration des notifications est incomplète.");
        }

        const registration = await getOrRegisterServiceWorker();
        const messaging = getMessaging(app);
        const currentToken = await getToken(messaging, {
            vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
            serviceWorkerRegistration: registration,
        });

        if (currentToken) {
            await saveFcmToken({ userId: user.uid, token: currentToken });
            setIsPermissionGranted(true);
        } else {
            console.warn("Permission granted, but no FCM token received.");
            setIsPermissionGranted(false);
        }

    } catch(error) {
        console.error("Error during token sync:", error);
        setIsPermissionGranted(false);
    }
  }, [user]);

  // Function to check and update permission status
  const checkPermission = useCallback(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const currentPermission = Notification.permission;
      setPermissionStatus(currentPermission);

      if (currentPermission === 'granted') {
        syncFcmToken();
      } else {
        setIsPermissionGranted(false);
      }
    }
  }, [syncFcmToken]);

  // Check initial permission status on mount and when tab becomes visible
  useEffect(() => {
    checkPermission();

    const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
            checkPermission();
        }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [checkPermission]);
  
  // Effect for handling foreground messages (both Toast and native OS Notification)
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && isPermissionGranted) {
      try {
        const messaging = getMessaging(app);
        const unsubscribe = onMessage(messaging, (payload) => {
          console.log('Foreground message received in app.', payload);

          const title = payload.notification?.title || payload.data?.title || 'Nouvelle Notification';
          const body = payload.notification?.body || payload.data?.body;

          // 1. Toast dans l'interface
          toast({
              title,
              description: body,
          });

          // 2. Notification système OS native (bannière / centre de notifications)
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            if ('serviceWorker' in navigator) {
              navigator.serviceWorker.ready.then(reg => {
                reg.showNotification(title, {
                  body: body,
                  icon: payload.notification?.icon || '/android-chrome-192x192.png',
                  badge: '/badge-72x72.png',
                  tag: payload.data?.tag || `carcare-${Date.now()}`,
                  renotify: true,
                  data: { url: payload.data?.url || '/settings' }
                } as any);
              }).catch(() => {
                try {
                  new Notification(title, {
                    body: body,
                    icon: '/android-chrome-192x192.png',
                    badge: '/badge-72x72.png',
                    tag: payload.data?.tag || `carcare-${Date.now()}`,
                  });
                } catch (e) {
                  console.warn("Direct Notification error:", e);
                }
              });
            } else {
              try {
                new Notification(title, {
                  body: body,
                  icon: '/android-chrome-192x192.png',
                  badge: '/badge-72x72.png',
                  tag: payload.data?.tag || `carcare-${Date.now()}`,
                });
              } catch (e) {
                console.warn("Direct Notification error:", e);
              }
            }
          }
        });
        return () => unsubscribe();
      } catch (error) {
        console.error("Error setting up foreground message handler", error);
      }
    }
  }, [toast, isPermissionGranted]);

  const requestPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window) || !user) {
      toast({ title: "Erreur", description: "Les notifications ne peuvent pas être activées sur cet appareil.", variant: "destructive" });
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
      setPermissionStatus(permission);
      
      if (permission === 'granted') {
        if (!process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY) {
            console.error("VAPID key is missing from environment variables.");
            throw new Error("La clé VAPID des notifications est manquante.");
        }

        const registration = await getOrRegisterServiceWorker();
        const messaging = getMessaging(app);
        const currentToken = await getToken(messaging, {
          vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
          serviceWorkerRegistration: registration,
        });

        if (currentToken) {
          const { isNew } = await saveFcmToken({ userId: user.uid, token: currentToken });
          setIsPermissionGranted(true);
          console.log('FCM Token enregistré avec succès:', currentToken);
          if (isNew) {
            toast({ title: "Succès 🎉", description: "Notifications activées ! Votre appareil recevra désormais les rappels d'entretien." });
          } else {
            toast({ title: "Notifications actives", description: "Token synchronisé et opérationnel." });
          }
        } else {
          throw new Error("Impossible d'obtenir le token FCM. Vérifiez la configuration du navigateur.");
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

  // Permet de tester l'envoi d'une notification push réelle (immédiate ou différée en arrière-plan)
  const testNotification = useCallback(async (delaySeconds: number = 0) => {
    if (!user) return;
    setIsTesting(true);

    if (delaySeconds > 0) {
      toast({
        title: "Test en arrière-plan démarré ⏳",
        description: `Réduisez l'application ou verrouillez votre écran maintenant ! Le push arrivera dans ${delaySeconds} secondes.`,
        duration: 6000,
      });
    }

    try {
      const response = await fetch('/api/notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid, delaySeconds }),
      });

      const data = await response.json();
      if (response.ok && data.success) {
        if (delaySeconds === 0) {
          toast({
            title: "Notification envoyée !",
            description: `Test réussi (${data.notificationsSent} appareil(s) notifié(s)). La notification système apparaît sur votre appareil.`,
          });
        }
      } else {
        throw new Error(data.message || data.error || "Échec de l'envoi de la notification de test.");
      }
    } catch (error: any) {
      console.error("Test notification error:", error);
      toast({
        title: "Échec du test",
        description: error.message || "Impossible d'envoyer la notification de test. Vérifiez que votre token est bien enregistré.",
        variant: "destructive",
      });
    } finally {
      setIsTesting(false);
    }
  }, [user, toast]);

  return { requestPermission, testNotification, isPermissionGranted, isRequesting, isTesting, permissionStatus };
}
