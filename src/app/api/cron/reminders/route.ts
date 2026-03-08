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
        // Calculation for J-3
        const date3 = new Date();
        date3.setDate(date3.getDate() + 3);
        const dateString3 = date3.toISOString().split('T')[0];

        // Calculation for J-7
        const date7 = new Date();
        date7.setDate(date7.getDate() + 7);
        const dateString7 = date7.toISOString().split('T')[0];

        // Fetching maintenances for J-3
        const snapshot3 = adminDb.collection('maintenance').where('nextDueDate', '==', dateString3).get();
        // Fetching maintenances for J-7
        const snapshot7 = adminDb.collection('maintenance').where('nextDueDate', '==', dateString7).get();

        const [results3, results7] = await Promise.all([snapshot3, snapshot7]);

        if (results3.empty && results7.empty) {
            return NextResponse.json({ message: `Aucun rappel trouvé pour ${dateString3} ou ${dateString7}.` });
        }

        const messages: any[] = [];

        // Helper function to process docs and format the notification messages
        const processDocs = async (docs: any[], daysRemaining: number) => {
            for (const doc of docs) {
                const data = doc.data();
                const { userId, vehicleId, task } = data;

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
                    const title = 'Rappel Entretien !';
                    const body = `Dans ${daysRemaining} jours : ${task} pour ${vehicleName}. N'oubliez pas !`;

                    const tokens = tokensSnapshot.docs.map(t => t.data().token);

                    messages.push({
                        notification: { title, body },
                        tokens: tokens, // Array de tokens pour ce destinataire
                    });
                }
            }
        };

        // Execution of the helper for both groups
        if (!results3.empty) await processDocs(results3.docs, 3);
        if (!results7.empty) await processDocs(results7.docs, 7);


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
            targets: { "J-3": dateString3, "J-7": dateString7 },
            tasksFound: results3.size + results7.size,
            notificationsSent: successCount,
            notificationsFailed: failureCount
        });

    } catch (error) {
        console.error('Erreur lors de l\'exécution du Cron Job:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
