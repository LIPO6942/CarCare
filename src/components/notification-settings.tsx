'use client';

import { useState, useEffect, useCallback } from 'react';
import { getToken, onMessage, isSupported } from 'firebase/messaging';
import { useAuth } from '@/context/auth-context';
import { useToast } from '@/hooks/use-toast';
import { messaging } from '@/lib/firebase';
import { saveFcmToken, removeFcmToken } from '@/lib/data';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Loader2, Bell, BellOff } from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';

const FCM_TOKEN_KEY = 'fcm_token';

export function NotificationSettings() {
    const { user } = useAuth();
    const { toast } = useToast();

    const [isSupportedBrowser, setIsSupportedBrowser] = useState(false);
    const [permission, setPermission] = useState<NotificationPermission | 'loading'>('loading');
    const [isSubscribing, setIsSubscribing] = useState(false);
    const [currentToken, setCurrentToken] = useState<string | null>(null);

    useEffect(() => {
        isSupported().then(setIsSupportedBrowser);
    }, []);

    useEffect(() => {
        if (isSupportedBrowser) {
            setPermission(Notification.permission);
            const savedToken = localStorage.getItem(FCM_TOKEN_KEY);
            setCurrentToken(savedToken);
        }
    }, [isSupportedBrowser]);
    
     useEffect(() => {
        if (!messaging) return;
        
        const unsubscribeOnMessage = onMessage(messaging, (payload) => {
            console.log('Foreground notification received:', payload);
            toast({
                title: payload.notification?.title || "Notification",
                description: payload.notification?.body,
            });
        });

        return () => {
            unsubscribeOnMessage();
        };
    }, [toast]);

    const handleRequestPermission = useCallback(async () => {
        if (!messaging || !user) return;
        
        setIsSubscribing(true);
        try {
            const permissionResult = await Notification.requestPermission();
            setPermission(permissionResult);

            if (permissionResult === 'granted') {
                const newPublicVapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
                if (!newPublicVapidKey) {
                    throw new Error("VAPID key not found. Check environment variables.");
                }

                const token = await getToken(messaging, { vapidKey: newPublicVapidKey });
                await saveFcmToken(user.uid, token);
                localStorage.setItem(FCM_TOKEN_KEY, token);
                setCurrentToken(token);
                toast({
                    title: 'Notifications activées',
                    description: 'Vous recevrez des alertes pour les échéances importantes.',
                });
            } else {
                toast({
                    title: 'Permission refusée',
                    description: 'Vous ne recevrez pas de notifications.',
                    variant: 'destructive',
                });
            }
        } catch (error) {
            console.error('Error getting FCM token:', error);
            toast({
                title: 'Erreur',
                description: 'Impossible d\'activer les notifications. Vérifiez la console pour les erreurs.',
                variant: 'destructive',
            });
        } finally {
            setIsSubscribing(false);
        }
    }, [messaging, user, toast]);

    const handleDisableNotifications = useCallback(async () => {
        if (!user || !currentToken) return;

        setIsSubscribing(true);
        try {
            // We don't need to call deleteToken() from firebase/messaging,
            // as it invalidates the token. We just remove it from our DB.
            await removeFcmToken(user.uid, currentToken);
            localStorage.removeItem(FCM_TOKEN_KEY);
            setCurrentToken(null);
            // Manually set permission to 'default' in UI to allow re-enabling
            setPermission('default');
            toast({ title: 'Notifications désactivées' });
        } catch (error) {
            console.error('Error removing FCM token:', error);
            toast({
                title: 'Erreur',
                description: 'Impossible de désactiver les notifications.',
                variant: 'destructive',
            });
        } finally {
            setIsSubscribing(false);
        }
    }, [user, currentToken, toast]);


    if (!isSupportedBrowser) {
        return (
            <Card className="max-w-4xl mx-auto">
                <CardHeader>
                    <CardTitle>Notifications</CardTitle>
                </CardHeader>
                <CardContent>
                    <Alert variant="destructive">
                        <AlertDescription>
                            Les notifications ne sont pas prises en charge par votre navigateur.
                        </AlertDescription>
                    </Alert>
                </CardContent>
            </Card>
        );
    }
    
    const isEnabled = permission === 'granted' && currentToken;

    return (
        <Card className="max-w-4xl mx-auto">
            <CardHeader>
                <CardTitle>Notifications</CardTitle>
                <CardDescription>
                    Recevez des alertes pour les échéances importantes comme les vidanges, les visites techniques et les paiements d'assurance.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {permission === 'loading' ? (
                     <Loader2 className="h-5 w-5 animate-spin" />
                ) : isEnabled ? (
                     <Button onClick={handleDisableNotifications} disabled={isSubscribing} variant="destructive">
                        {isSubscribing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BellOff className="mr-2 h-4 w-4" />}
                        Désactiver les notifications
                    </Button>
                ) : (
                    <Button onClick={handleRequestPermission} disabled={isSubscribing || permission === 'denied'}>
                         {isSubscribing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}
                        {permission === 'denied' ? 'Permission bloquée' : 'Activer les notifications'}
                    </Button>
                )}
                
                {permission === 'denied' && (
                    <p className="text-sm text-destructive mt-4">
                        Vous avez bloqué les notifications. Vous devez les réactiver dans les paramètres de votre navigateur pour ce site.
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
