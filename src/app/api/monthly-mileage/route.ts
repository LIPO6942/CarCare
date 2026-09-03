import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import * as admin from 'firebase-admin';

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
        const monthParam = searchParams.get('month'); // ex: "2026-08"
        const requestedUserId = searchParams.get('userId');
        const requestedEmail = (searchParams.get('userEmail') || searchParams.get('email') || '').trim().toLowerCase();

        // Mois cible
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
        const now = new Date();
        const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        // 1. Résolution de l'utilisateur par e-mail
        const userIdsToMatch = new Set<string>();
        if (requestedUserId) {
            userIdsToMatch.add(requestedUserId);
        }

        if (requestedEmail) {
            try {
                const userRecord = await admin.auth().getUserByEmail(requestedEmail);
                if (userRecord && userRecord.uid) {
                    userIdsToMatch.add(userRecord.uid);
                    console.log(`[CarCare API] Utilisateur trouvé dans Auth pour ${requestedEmail} -> UID: ${userRecord.uid}`);
                }
            } catch (authErr: any) {
                console.warn(`[CarCare API] Aucun utilisateur Auth pour ${requestedEmail}:`, authErr.message);
            }
        }

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

        // 2. Récupération des véhicules de cet utilisateur
        let vehicles: any[] = [];
        if (userIdsToMatch.size > 0) {
            const userIds = Array.from(userIdsToMatch);
            const vehiclesSnaps = await Promise.all([
                ...userIds.map(uid => adminDb.collection('vehicles').where('userId', '==', uid).get().catch(() => ({ docs: [] }))),
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
            const snap = await adminDb.collection('vehicles').get().catch(() => ({ docs: [] }));
            vehicles = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
        }

        if (vehicles.length === 0) {
            return NextResponse.json({
                success: true,
                month: targetMonthKey,
                monthlyMileage: 0,
                totalCost: 0,
                vehicleName: null,
                vehiclesCount: 0,
                logsCount: 0,
            }, { headers: corsHeaders() });
        }

        const userVehicleIds = new Set(vehicles.map(v => v.id));
        const first = vehicles[0];
        const primaryVehicleName = `${first.brand || ''} ${first.model || ''}`.trim() || 'Mon Véhicule';

        // 3. Récupération des pleins de carburant STRICTEMENT associés à l'utilisateur
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

        // 4. Calcul IDENTIQUE à vehicle-tabs.tsx de CarCare :
        // Groupement par mois (clé YYYY-MM)
        const groupedByMonth: Record<string, { logs: any[]; totalCost: number; totalDistance: number }> = {};

        allFuelLogs.forEach((log: any) => {
            if (typeof log.mileage !== 'number' || !log.date) return;
            const d = new Date(log.date);
            if (isNaN(d.getTime())) return;
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (!groupedByMonth[key]) {
                groupedByMonth[key] = { logs: [], totalCost: 0, totalDistance: 0 };
            }
            groupedByMonth[key].logs.push(log);
            groupedByMonth[key].totalCost += Number(log.totalCost || 0);
        });

        // Calcul exact de totalDistance pour chaque mois (même algorithme que vehicle-tabs.tsx)
        for (const key in groupedByMonth) {
            const monthData = groupedByMonth[key];
            const sortedLogs = [...monthData.logs].sort((a, b) => a.mileage - b.mileage);

            let totalDistance = 0;
            for (let i = 1; i < sortedLogs.length; i++) {
                const distance = sortedLogs[i].mileage - sortedLogs[i - 1].mileage;
                if (distance > 0) {
                    totalDistance += distance;
                }
            }

            // Si un seul plein dans le mois, calcul de la distance parcourue depuis le plein précédent antérieur
            if (totalDistance === 0 && sortedLogs.length === 1) {
                const singleLogDate = new Date(sortedLogs[0].date).getTime();
                const singleLogMileage = sortedLogs[0].mileage;

                const earlierLogs = allFuelLogs
                    .filter((l: any) => new Date(l.date).getTime() < singleLogDate && typeof l.mileage === 'number' && l.mileage < singleLogMileage)
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                if (earlierLogs.length > 0) {
                    totalDistance = singleLogMileage - earlierLogs[0].mileage;
                }
            }

            monthData.totalDistance = totalDistance;
        }

        // Résolution du mois à renvoyer :
        // 1. D'abord le mois cible demandé (ex: wrap-up month)
        let resolvedMonthKey = targetMonthKey;
        let selectedMonthData = groupedByMonth[targetMonthKey];

        // 2. Si le mois cible n'a aucun kilométrage calculé, vérifier le mois courant
        if ((!selectedMonthData || selectedMonthData.totalDistance === 0) && groupedByMonth[currentMonthKey]?.totalDistance > 0) {
            resolvedMonthKey = currentMonthKey;
            selectedMonthData = groupedByMonth[currentMonthKey];
        }

        // 3. Si toujours 0, chercher le mois le plus récent avec des données
        if (!selectedMonthData || selectedMonthData.totalDistance === 0) {
            const availableMonths = Object.keys(groupedByMonth).sort().reverse();
            for (const mKey of availableMonths) {
                if (groupedByMonth[mKey].totalDistance > 0) {
                    resolvedMonthKey = mKey;
                    selectedMonthData = groupedByMonth[mKey];
                    break;
                }
            }
        }

        const finalDistance = selectedMonthData ? Math.round(selectedMonthData.totalDistance) : 0;
        const finalCost = selectedMonthData ? parseFloat(selectedMonthData.totalCost.toFixed(2)) : 0;
        const finalLogsCount = selectedMonthData ? selectedMonthData.logs.length : 0;

        return NextResponse.json({
            success: true,
            month: resolvedMonthKey,
            targetMonthRequested: targetMonthKey,
            monthlyMileage: finalDistance,
            totalCost: finalCost,
            vehicleName: primaryVehicleName,
            vehiclesCount: vehicles.length,
            logsCount: finalLogsCount,
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
