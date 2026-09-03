import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import * as admin from 'firebase-admin';

// Configuration des en-têtes CORS pour permettre à Kol Youm d'appeler cette API
function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    };
}

export async function OPTIONS() {
    return NextResponse.json({}, { headers: corsHeaders() });
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const monthParam = searchParams.get('month'); // Format attendu : "YYYY-MM" (ex: "2026-08")
        const requestedUserId = searchParams.get('userId');
        const requestedEmail = (searchParams.get('userEmail') || searchParams.get('email') || '').trim().toLowerCase();

        let targetYear: number;
        let targetMonthIndex: number; // 0-11

        if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
            const [y, m] = monthParam.split('-').map(Number);
            targetYear = y;
            targetMonthIndex = m - 1;
        } else {
            const now = new Date();
            const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            targetYear = prev.getFullYear();
            targetMonthIndex = prev.getMonth();
        }

        const targetMonthKey = `${targetYear}-${String(targetMonthIndex + 1).padStart(2, '0')}`;

        // 1. Résoudre le userId CarCare correspondant à l'adresse e-mail
        const userIdsToMatch = new Set<string>();

        if (requestedUserId) {
            userIdsToMatch.add(requestedUserId);
        }

        if (requestedEmail) {
            try {
                // Recherche dans Firebase Authentication de CarCare
                const userRecord = await admin.auth().getUserByEmail(requestedEmail);
                if (userRecord && userRecord.uid) {
                    userIdsToMatch.add(userRecord.uid);
                    console.log(`[CarCare API] Utilisateur trouvé dans Auth pour ${requestedEmail} -> UID: ${userRecord.uid}`);
                }
            } catch (authErr: any) {
                console.warn(`[CarCare API] Aucun utilisateur Auth trouvé pour ${requestedEmail}:`, authErr.message);
            }
        }

        // Si une adresse e-mail ou un userId a été demandé mais qu'aucun compte n'a été trouvé,
        // NE JAMAIS piocher dans les données d'autres utilisateurs !
        if (userIdsToMatch.size === 0 && (requestedEmail || requestedUserId)) {
            return NextResponse.json({
                success: true,
                month: targetMonthKey,
                monthlyMileage: 0,
                totalCost: 0,
                vehicleName: null,
                vehiclesCount: 0,
                logsCount: 0,
                message: `Aucun compte CarCare trouvé pour l'email ${requestedEmail || requestedUserId}`,
            }, { headers: corsHeaders() });
        }

        // 2. Récupérer uniquement les véhicules de cet utilisateur
        let vehicles: any[] = [];
        if (userIdsToMatch.size > 0) {
            const userIds = Array.from(userIdsToMatch);
            const vehiclesSnaps = await Promise.all([
                ...userIds.map(uid => adminDb.collection('vehicles').where('userId', '==', uid).get().catch(() => ({ docs: [] }))),
                // Fallback si l'email était stocké en champ direct dans le véhicule
                ...(requestedEmail ? [
                    adminDb.collection('vehicles').where('userEmail', '==', requestedEmail).get().catch(() => ({ docs: [] })),
                    adminDb.collection('vehicles').where('email', '==', requestedEmail).get().catch(() => ({ docs: [] })),
                ] : [])
            ]);

            const seenVehicleIds = new Set<string>();
            vehiclesSnaps.forEach((snap: any) => {
                snap.docs.forEach((d: any) => {
                    if (!seenVehicleIds.has(d.id)) {
                        seenVehicleIds.add(d.id);
                        vehicles.push({ id: d.id, ...d.data() });
                    }
                });
            });
        } else {
            // Aucun filtre utilisateur fourni du tout
            const snap = await adminDb.collection('vehicles').get().catch(() => ({ docs: [] }));
            vehicles = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
        }

        // Si aucun véhicule ne correspond à cet utilisateur
        if (vehicles.length === 0) {
            return NextResponse.json({
                success: true,
                month: targetMonthKey,
                monthlyMileage: 0,
                totalCost: 0,
                vehicleName: null,
                vehiclesCount: 0,
                logsCount: 0,
                message: 'Aucun véhicule enregistré pour cet utilisateur',
            }, { headers: corsHeaders() });
        }

        // Set des identifiants des véhicules de l'utilisateur
        const userVehicleIds = new Set(vehicles.map(v => v.id));

        // Nom du véhicule principal
        const first = vehicles[0];
        const primaryVehicleName = `${first.brand || ''} ${first.model || ''}`.trim() || 'Mon Véhicule';

        // 3. Récupérer les pleins de carburant STRICTEMENT associés aux véhicules et/ou userId de l'utilisateur
        let allFuelLogs: any[] = [];
        if (userIdsToMatch.size > 0) {
            const userIds = Array.from(userIdsToMatch);
            const fuelSnaps = await Promise.all(
                userIds.map(uid => adminDb.collection('fuelLogs').where('userId', '==', uid).get().catch(() => ({ docs: [] })))
            );

            const seenLogIds = new Set<string>();
            fuelSnaps.forEach((snap: any) => {
                snap.docs.forEach((d: any) => {
                    if (!seenLogIds.has(d.id)) {
                        seenLogIds.add(d.id);
                        const logData = d.data();
                        // Filtrer pour s'assurer que le plein appartient bien à l'un des véhicules de l'utilisateur
                        if (userVehicleIds.has(logData.vehicleId)) {
                            allFuelLogs.push({ id: d.id, ...logData });
                        }
                    }
                });
            });
        } else {
            const snap = await adminDb.collection('fuelLogs').get().catch(() => ({ docs: [] }));
            allFuelLogs = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
        }

        // Grouper les pleins par véhicule
        const logsByVehicle: Record<string, any[]> = {};
        allFuelLogs.forEach((log: any) => {
            if (!log.vehicleId || typeof log.mileage !== 'number' || !log.date) return;
            if (!logsByVehicle[log.vehicleId]) {
                logsByVehicle[log.vehicleId] = [];
            }
            logsByVehicle[log.vehicleId].push(log);
        });

        let totalMonthlyDistance = 0;
        let totalMonthlyCost = 0;
        let monthlyLogsCount = 0;

        // Calcul de la distance parcourue dans le mois pour chaque véhicule de l'utilisateur
        for (const [vehicleId, logs] of Object.entries(logsByVehicle)) {
            // Trier les pleins chronologiquement par date
            const sortedLogs = [...logs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            for (let i = 0; i < sortedLogs.length; i++) {
                const currentLog = sortedLogs[i];
                const logDate = new Date(currentLog.date);

                if (isNaN(logDate.getTime())) continue;

                if (logDate.getFullYear() === targetYear && logDate.getMonth() === targetMonthIndex) {
                    monthlyLogsCount++;
                    totalMonthlyCost += Number(currentLog.totalCost || 0);

                    // Si on a un plein précédent chronologique (même du mois précédent),
                    // la distance jusqu'à ce plein a été parcourue pour ce mois
                    if (i > 0) {
                        const prevLog = sortedLogs[i - 1];
                        const diff = currentLog.mileage - prevLog.mileage;
                        if (diff > 0) {
                            totalMonthlyDistance += diff;
                        }
                    }
                }
            }
        }

        // Si aucun plein n'a de précédent mais qu'on a plusieurs pleins dans le mois : delta max-min
        if (totalMonthlyDistance === 0 && monthlyLogsCount >= 2) {
            const monthLogs = allFuelLogs.filter((log: any) => {
                const d = new Date(log.date);
                return d.getFullYear() === targetYear && d.getMonth() === targetMonthIndex;
            });
            const mileages = monthLogs.map((l: any) => l.mileage).filter((m: any) => typeof m === 'number');
            if (mileages.length >= 2) {
                totalMonthlyDistance = Math.max(...mileages) - Math.min(...mileages);
            }
        }

        return NextResponse.json({
            success: true,
            month: targetMonthKey,
            monthlyMileage: Math.round(totalMonthlyDistance),
            totalCost: parseFloat(totalMonthlyCost.toFixed(2)),
            vehicleName: primaryVehicleName,
            vehiclesCount: vehicles.length,
            logsCount: monthlyLogsCount,
        }, { headers: corsHeaders() });

    } catch (error: any) {
        console.error('[CarCare API] Error in /api/monthly-mileage:', error);
        return NextResponse.json({
            success: false,
            error: error.message || 'Erreur serveur CarCare',
            monthlyMileage: 0,
        }, { status: 500, headers: corsHeaders() });
    }
}
