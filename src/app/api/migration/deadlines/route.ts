import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { adminDb } from '@/lib/firebase-admin';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    const userId = searchParams.get('userId'); // Optionnel: migrer un seul utilisateur

    // Sécurité: s'assurer que seul l'admin puisse déclencher cette API
    if (key !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Recherche des maintenances avec une date d'échéance passée
        // et qui ont déjà été "traitées" (ont un enregistrement plus récent du même type)
        let query = adminDb
            .collection('maintenance')
            .where('nextDueDate', '!=', null);
        
        if (userId) {
            query = query.where('userId', '==', userId);
        }
        
        const maintenanceSnapshot = await query.get();

        if (maintenanceSnapshot.empty) {
            return NextResponse.json({ message: "Aucune maintenance avec échéance trouvée." });
        }

        let updatedCount = 0;
        let skippedCount = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const batch = adminDb.batch();
        let batchCount = 0;

        for (const doc of maintenanceSnapshot.docs) {
            const data = doc.data();
            const { nextDueDate, task, vehicleId, userId: docUserId } = data;

            if (!nextDueDate) {
                skippedCount++;
                continue;
            }

            const dueDate = new Date(nextDueDate);
            
            // Si la date d'échéance est passée de plus de 30 jours
            // et qu'il existe un enregistrement plus récent du même type pour ce véhicule
            const thirtyDaysAgo = new Date(today);
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            
            if (dueDate < thirtyDaysAgo) {
                // Vérifier s'il existe un enregistrement plus récent du même type
                const recentMaintenance = await adminDb
                    .collection('maintenance')
                    .where('vehicleId', '==', vehicleId)
                    .where('userId', '==', docUserId)
                    .where('task', '==', task)
                    .where('date', '>', data.date)
                    .limit(1)
                    .get();

                if (!recentMaintenance.empty) {
                    // Cette échéance ancienne a déjà été réglée (il y a un enregistrement plus récent)
                    // On supprime les champs nextDueDate et nextDueMileage
                    batch.update(doc.ref, {
                        nextDueDate: admin.firestore.FieldValue.delete(),
                        nextDueMileage: admin.firestore.FieldValue.delete()
                    });
                    updatedCount++;
                    batchCount++;
                } else {
                    skippedCount++;
                }
            } else {
                skippedCount++;
            }

            // Firestore Batch limits to 500 operations at a time
            if (batchCount >= 450) {
                await batch.commit();
                batchCount = 0;
            }
        }

        // Commit des dernières opérations restantes
        if (batchCount > 0) {
            await batch.commit();
        }

        return NextResponse.json({
            success: true,
            message: "Migration des échéances terminée.",
            stats: {
                totalChecked: maintenanceSnapshot.size,
                cleanedCount: updatedCount,
                skippedCount: skippedCount
            }
        });

    } catch (error) {
        console.error('Erreur lors de la migration des échéances:', error);
        return NextResponse.json({ 
            error: 'Internal Server Error', 
            details: error instanceof Error ? error.message : String(error) 
        }, { status: 500 });
    }
}
