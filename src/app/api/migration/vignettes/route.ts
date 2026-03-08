import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { adjustVignetteDate, formatDateToLocalISO } from '@/lib/vignette';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    // Sécurité: s'assurer que seul l'admin puisse déclencher cette API
    if (key !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Recherche de toutes les maintenances de type "Vignette" qui ont une échéance prévue
        const maintenanceTasksSnapshot = await adminDb
            .collection('maintenance')
            .where('task', '==', 'Vignette')
            .get();

        if (maintenanceTasksSnapshot.empty) {
            return NextResponse.json({ message: "Aucune vignette trouvée dans la base de données." });
        }

        let updatedCount = 0;
        let skippedCount = 0;
        const batch = adminDb.batch();
        let batchCount = 0;

        for (const doc of maintenanceTasksSnapshot.docs) {
            const data = doc.data();
            const { vehicleId, nextDueDate } = data;

            // Si la vignette n'a pas de date d'échéance (historique ancien), on l'ignore
            if (!nextDueDate) {
                skippedCount++;
                continue;
            }

            // Récupération de la plaque d'immatriculation du véhicule
            let licensePlate = '';
            if (vehicleId) {
                const vehicleDoc = await adminDb.collection('vehicles').doc(vehicleId).get();
                if (vehicleDoc.exists) {
                    const vehicleData = vehicleDoc.data();
                    if (vehicleData && vehicleData.licensePlate) {
                        licensePlate = vehicleData.licensePlate;
                    }
                }
            }

            if (!licensePlate) {
                skippedCount++;
                continue;
            }

            // Calcul de la nouvelle date intelligente
            // On se base sur l'ANCIENNE date prévue (ex: "2026-02-27") et on RECTIFIE juste le mois/jour
            const oldDate = new Date(nextDueDate);
            const smartNextDate = adjustVignetteDate(licensePlate, oldDate);
            const newDateString = formatDateToLocalISO(smartNextDate);

            // Si la date intelligente est différente de la date bête (+1 an), on la met à jour
            if (nextDueDate !== newDateString) {
                batch.update(doc.ref, { nextDueDate: newDateString });
                updatedCount++;
                batchCount++;
            } else {
                skippedCount++;
            }

            // Firestore Batch limits to 500 operations at a time
            if (batchCount >= 450) {
                await batch.commit();
                batchCount = 0; // Reset pour le prochain lot
            }
        }

        // Commit des dernières opérations restantes
        if (batchCount > 0) {
            await batch.commit();
        }

        return NextResponse.json({
            success: true,
            message: "Migration terminée avec succès.",
            stats: {
                totalFound: maintenanceTasksSnapshot.size,
                updatedCount,
                skippedOrAlreadySmartCount: skippedCount
            }
        });

    } catch (error) {
        console.error('Erreur lors de la migration des vignettes:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error instanceof Error ? error.message : String(error) }, { status: 500 });
    }
}
