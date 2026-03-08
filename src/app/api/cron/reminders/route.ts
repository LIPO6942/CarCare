import { NextResponse } from 'next/server';
import { adminDb, adminMessaging } from '@/lib/firebase-admin';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    // Sécurité: s'assurer que seul le service de cron puisse déclencher cette API
    if (key !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Calcul de la date dans 3 jours
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + 3);
        const dateString = targetDate.toISOString().split('T')[0];

        // Recherche des maintenances prévues pour cette date (Assurance, Visite Technique, etc.)
        const maintenanceTasksSnapshot = await adminDb
            .collection('maintenance')
            .where('nextDueDate', '==', dateString)
            .get();

        if (maintenanceTasksSnapshot.empty) {
            return NextResponse.json({ message: `Aucun rappel trouvé pour la date ${dateString}.` });
        }

        const messages = [];

        // Pour chaque maintenance trouvée
        for (const doc of maintenanceTasksSnapshot.docs) {
            const data = doc.data();
            const { userId, vehicleId, task } = data;

            // Récupération des infos du véhicule
            let vehicleName = 'votre véhicule';
            if (vehicleId) {
                const vehicleDoc = await adminDb.collection('vehicles').doc(vehicleId).get();
                if (vehicleDoc.exists) {
                    const vehicleData = vehicleDoc.data();
                    if (vehicleData) {
                        vehicleName = `${vehicleData.brand} ${vehicleData.model}`;
                    }
                }
            }

            // Récupération des tokens de notification associés au user
            const tokensSnapshot = await adminDb
                .collection('fcmTokens')
                .where('userId', '==', userId)
                .get();

            if (!tokensSnapshot.empty) {
                const title = 'Rappel imminent !';
                const body = `Dans 3 jours : ${task} pour ${vehicleName}. N'oubliez pas !`;

                // Un utilisateur peut avoir plusieurs appareils/tokens
                const tokens = tokensSnapshot.docs.map(t => t.data().token);

                messages.push({
                    notification: {
                        title,
                        body,
                    },
                    tokens: tokens, // Array de tokens pour ce destinataire
                });
            }
        }

        let successCount = 0;
        let failureCount = 0;

        // Envoi des notifications en rafale (Multicast)
        for (const message of messages) {
            if (message.tokens.length > 0) {
                try {
                    const response = await adminMessaging.sendEachForMulticast(message);
                    successCount += response.successCount;
                    failureCount += response.failureCount;
                } catch (err) {
                    console.error('Erreur lors de l\'envoi FCM pour un groupe de tokens', err);
                    failureCount += message.tokens.length;
                }
            }
        }

        return NextResponse.json({
            success: true,
            targetDate: dateString,
            tasksFound: maintenanceTasksSnapshot.size,
            notificationsSent: successCount,
            notificationsFailed: failureCount
        });

    } catch (error) {
        console.error('Erreur lors de l\'exécution du Cron Job:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
