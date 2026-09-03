import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

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

        // Récupérer les véhicules et les pleins de carburant
        let vehiclesQuery: any = adminDb.collection('vehicles');
        let fuelLogsQuery: any = adminDb.collection('fuelLogs');

        if (requestedUserId) {
            vehiclesQuery = vehiclesQuery.where('userId', '==', requestedUserId);
            fuelLogsQuery = fuelLogsQuery.where('userId', '==', requestedUserId);
        }

        const [vehiclesSnap, fuelLogsSnap] = await Promise.all([
            vehiclesQuery.get().catch((err: any) => {
                console.warn('[CarCare API] Erreur lecture vehicles:', err.message);
                return { docs: [] };
            }),
            fuelLogsQuery.get().catch((err: any) => {
                console.warn('[CarCare API] Erreur lecture fuelLogs:', err.message);
                return { docs: [] };
            }),
        ]);

        const vehicles = vehiclesSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
        const allFuelLogs = fuelLogsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));

        let primaryVehicleName = 'Mon Véhicule';
        if (vehicles.length > 0) {
            const first = vehicles[0];
            primaryVehicleName = `${first.brand || ''} ${first.model || ''}`.trim() || 'Véhicule';
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

        // Calculer la distance parcourue dans le mois pour chaque véhicule
        for (const [vehicleId, logs] of Object.entries(logsByVehicle)) {
            // Trier tous les pleins chronologiquement par date
            const sortedLogs = [...logs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            for (let i = 0; i < sortedLogs.length; i++) {
                const currentLog = sortedLogs[i];
                const logDate = new Date(currentLog.date);

                if (isNaN(logDate.getTime())) continue;

                if (logDate.getFullYear() === targetYear && logDate.getMonth() === targetMonthIndex) {
                    monthlyLogsCount++;
                    totalMonthlyCost += Number(currentLog.totalCost || 0);

                    // Si on a un plein antérieur (même du mois précédent), la distance jusqu'à ce plein compte pour ce mois
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
