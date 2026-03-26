import { NextResponse } from 'next/server';
import { adminDb, adminMessaging } from '@/lib/firebase-admin';
import { calculateNextVignetteDate, formatDateToLocalISO } from '@/lib/vignette';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    // Sécurité: s'assurer que seul le service de cron puisse déclencher cette API
    if (key !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Calculation for J+0 (Today)
        const date0 = new Date();
        const dateString0 = date0.toISOString().split('T')[0];

        // Calculation for J-3
        const date3 = new Date();
        date3.setDate(date3.getDate() + 3);
        const dateString3 = date3.toISOString().split('T')[0];

        // Calculation for J-7
        const date7 = new Date();
        date7.setDate(date7.getDate() + 7);
        const dateString7 = date7.toISOString().split('T')[0];

        // Fetching maintenances for each date
        const snapshot0 = adminDb.collection('maintenance').where('nextDueDate', '==', dateString0).get();
        const snapshot3 = adminDb.collection('maintenance').where('nextDueDate', '==', dateString3).get();
        const snapshot7 = adminDb.collection('maintenance').where('nextDueDate', '==', dateString7).get();
        
        // Also fetch ALL Vignettes to dynamically calculate their deadlines, 
        // bypassing any corruption or empty fields in the database.
        const snapshotVignettes = adminDb.collection('maintenance').where('task', '==', 'Vignette').get();

        const [results0, results3, results7, resultsVignettes] = await Promise.all([snapshot0, snapshot3, snapshot7, snapshotVignettes]);

        if (results0.empty && results3.empty && results7.empty && resultsVignettes.empty) {
            return NextResponse.json({ message: `Aucun rappel trouvé pour aujourd'hui, J+3 ou J+7.` });
        }

        const messages: any[] = [];
        const processedDocIds = new Set<string>();

        // Helper function to process docs and format the notification messages
        const processDocs = async (docs: any[], daysRemaining: number) => {
            for (const doc of docs) {
                if (processedDocIds.has(doc.id)) continue;
                processedDocIds.add(doc.id);

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
                    let title = 'Rappel Entretien !';
                    let body = '';

                    if (daysRemaining === 0) {
                        title = 'Jour J : Entretien';
                        body = `C'est aujourd'hui ! N'oubliez pas l'entretien "${task}" pour votre ${vehicleName}. Pensez à ajouter le document "${task}" dans l'onglet "Documents" pour un suivi complet.`;
                    } else {
                        body = `Dans ${daysRemaining} jours : ${task} pour ${vehicleName}. N'oubliez pas !`;
                    }

                    const tokens = tokensSnapshot.docs.map(t => t.data().token);

                    messages.push({
                        notification: { title, body },
                        tokens: tokens,
                    });
                }
            }
        };

        // Execution of the helper for all groups
        if (!results0.empty) await processDocs(results0.docs, 0);
        if (!results3.empty) await processDocs(results3.docs, 3);
        if (!results7.empty) await processDocs(results7.docs, 7);

        // Smart dynamic detection for Vignettes (catches those missing nextDueDate)
        if (!resultsVignettes.empty) {
            const dynamic0: any[] = [];
            const dynamic3: any[] = [];
            const dynamic7: any[] = [];

            for (const doc of resultsVignettes.docs) {
                if (processedDocIds.has(doc.id)) continue;
                const data = doc.data();
                if (!data.date || !data.vehicleId) continue;
                
                // Fetch vehicle to get license plate
                const vehicleDoc = await adminDb.collection('vehicles').doc(data.vehicleId).get();
                if (!vehicleDoc.exists) continue;
                const licensePlate = vehicleDoc.data()?.licensePlate || '';

                const calculated = calculateNextVignetteDate(licensePlate, new Date(data.date));
                const calcString = formatDateToLocalISO(calculated);

                if (calcString === dateString0) dynamic0.push(doc);
                else if (calcString === dateString3) dynamic3.push(doc);
                else if (calcString === dateString7) dynamic7.push(doc);
            }

            if (dynamic0.length > 0) await processDocs(dynamic0, 0);
            if (dynamic3.length > 0) await processDocs(dynamic3, 3);
            if (dynamic7.length > 0) await processDocs(dynamic7, 7);
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
            targets: { "J0": dateString0, "J-3": dateString3, "J-7": dateString7 },
            tasksFound: results0.size + results3.size + results7.size,
            notificationsSent: successCount,
            notificationsFailed: failureCount
        });

    } catch (error) {
        console.error('Erreur lors de l\'exécution du Cron Job:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
