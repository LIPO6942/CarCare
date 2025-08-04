'use client';

import { useState, useEffect, useCallback } from 'react';
import OneSignal from 'react-onesignal';
import { useAuth } from '@/context/auth-context';
import { useToast } from '@/hooks/use-toast';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Loader2, Bell, BellOff } from 'lucide-react';

export function NotificationSettings() {
    const { user } = useAuth();
    const { toast } = useToast();

    const [isSubscribed, setIsSubscribed] = useState(false);
    const [isPermissionBlocked, setIsPermissionBlocked] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function checkSubscriptionStatus() {
            if (!user) return;
            setIsLoading(true);
            const subscribed = await OneSignal.User.PushSubscription.isSubscribed();
            const permission = await OneSignal.Notifications.getPermission();
            
            setIsSubscribed(subscribed);
            setIsPermissionBlocked(permission === 'denied');
            setIsLoading(false);
        }
        // OneSignal might not be initialized yet, so we wait a bit
        setTimeout(checkSubscriptionStatus, 1000); 
    }, [user]);

    const handleSubscribe = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            await OneSignal.Notifications.requestPermission();
            const permission = await OneSignal.Notifications.getPermission();
            
            if (permission === 'granted') {
                 await OneSignal.User.PushSubscription.optIn();
                 setIsSubscribed(true);
                 setIsPermissionBlocked(false);
                 toast({
                    title: 'Notifications activées',
                    description: 'Vous recevrez des alertes pour les échéances importantes.',
                });
            } else {
                 setIsPermissionBlocked(true);
                 toast({
                    title: 'Permission refusée',
                    description: 'Vous ne recevrez pas de notifications.',
                    variant: 'destructive',
                });
            }
        } catch (error) {
            console.error('Error subscribing to OneSignal:', error);
            toast({
                title: 'Erreur',
                description: 'Impossible d\'activer les notifications.',
                variant: 'destructive',
            });
        } finally {
            setIsLoading(false);
        }
    }, [user, toast]);

    const handleUnsubscribe = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            await OneSignal.User.PushSubscription.optOut();
            setIsSubscribed(false);
            toast({ title: 'Notifications désactivées' });
        } catch (error) {
            console.error('Error unsubscribing from OneSignal:', error);
            toast({
                title: 'Erreur',
                description: 'Impossible de désactiver les notifications.',
                variant: 'destructive',
            });
        } finally {
            setIsLoading(false);
        }
    }, [user, toast]);

    return (
        <Card className="max-w-4xl mx-auto">
            <CardHeader>
                <CardTitle>Notifications Push</CardTitle>
                <CardDescription>
                    Recevez des alertes pour les échéances via le service OneSignal.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                     <Loader2 className="h-5 w-5 animate-spin" />
                ) : isSubscribed ? (
                     <Button onClick={handleUnsubscribe} disabled={isLoading} variant="destructive">
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BellOff className="mr-2 h-4 w-4" />}
                        Désactiver les notifications
                    </Button>
                ) : (
                    <Button onClick={handleSubscribe} disabled={isLoading || isPermissionBlocked}>
                         {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}
                        {isPermissionBlocked ? 'Permission bloquée' : 'Activer les notifications'}
                    </Button>
                )}
                
                {isPermissionBlocked && (
                    <p className="text-sm text-destructive mt-4">
                        Vous avez bloqué les notifications. Vous devez les réactiver dans les paramètres de votre navigateur pour ce site.
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
