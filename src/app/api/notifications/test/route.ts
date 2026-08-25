import { NextResponse } from 'next/server';
import { adminDb, adminMessaging } from '@/lib/firebase-admin';

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const { userId, token, delaySeconds } = body;

        if (!userId && !token) {
            return NextResponse.json(
                { error: 'userId ou token requis pour tester les notifications.' },
                { status: 400 }
            );
        }

        // Si un délai est demandé (ex: 5s), attendre pour laisser le temps à l'utilisateur de fermer/minimiser l'application
        if (delaySeconds && typeof delaySeconds === 'number' && delaySeconds > 0) {
            const safeDelay = Math.min(delaySeconds, 15);
            await new Promise(resolve => setTimeout(resolve, safeDelay * 1000));
        }

        let targetTokens: string[] = [];

        if (token) {
            targetTokens = [token];
        } else if (userId) {
            const tokensSnapshot = await adminDb
                .collection('fcmTokens')
                .where('userId', '==', userId)
                .get();

            if (tokensSnapshot.empty) {
                return NextResponse.json(
                    {
                        success: false,
                        message: "Aucun token FCM enregistré pour cet utilisateur. Veuillez d'abord cliquer sur 'Activer les notifications' dans les Paramètres."
                    },
                    { status: 404 }
                );
            }

            targetTokens = tokensSnapshot.docs.map(doc => doc.data().token).filter(Boolean);
        }

        if (targetTokens.length === 0) {
            return NextResponse.json(
                { success: false, message: "Aucun token valide trouvé pour cet appareil." },
                { status: 404 }
            );
        }

        const title = "🚗 CarCare Pro - Test Réussi !";
        const notificationBody = "Vos notifications push d'échéances d'entretiens sont parfaitement actives sur cet appareil.";
        const tag = `test-notification-${Date.now()}`;
        const targetUrl = "/settings";

        const messagePayload = {
            tokens: targetTokens,
            notification: {
                title,
                body: notificationBody,
            },
            data: {
                url: targetUrl,
                title,
                body: notificationBody,
                type: 'test-notification',
                priority: 'high',
                tag: tag,
            },
            webpush: {
                headers: {
                    Urgency: 'high',
                },
                notification: {
                    title,
                    body: notificationBody,
                    icon: '/android-chrome-192x192.png',
                    badge: '/badge-72x72.png',
                    tag: tag,
                    renotify: true,
                    requireInteraction: true,
                    data: {
                        url: targetUrl,
                        tag: tag,
                    }
                },
                fcmOptions: {
                    link: targetUrl
                }
            }
        };

        const response = await adminMessaging.sendEachForMulticast(messagePayload);

        // Nettoyage automatique des éventuels tokens périmés découverts lors du test
        const deadTokens: string[] = [];
        response.responses.forEach((resp, idx) => {
            if (!resp.success && resp.error) {
                const code = resp.error.code;
                if (
                    code === 'messaging/registration-token-not-registered' ||
                    code === 'messaging/invalid-registration-token' ||
                    code === 'messaging/invalid-argument'
                ) {
                    deadTokens.push(targetTokens[idx]);
                }
            }
        });

        if (deadTokens.length > 0) {
            for (const deadToken of deadTokens) {
                try {
                    const deadDocs = await adminDb.collection('fcmTokens').where('token', '==', deadToken).get();
                    deadDocs.forEach(d => d.ref.delete());
                } catch (e) {
                    console.error('Erreur suppression token mort :', e);
                }
            }
        }

        return NextResponse.json({
            success: response.successCount > 0,
            notificationsSent: response.successCount,
            notificationsFailed: response.failureCount,
            totalTokens: targetTokens.length,
            message: response.successCount > 0
                ? "Notification de test envoyée avec succès !"
                : "Échec de l'envoi vers les tokens enregistrés. Veuillez renouveler l'autorisation.",
            details: response.responses.map(r => ({
                success: r.success,
                error: r.error ? r.error.message : null
            }))
        });

    } catch (error: any) {
        console.error('Erreur test notification:', error);
        return NextResponse.json(
            { error: error.message || 'Erreur interne lors du test de notification' },
            { status: 500 }
        );
    }
}
