import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { adminDb, adminMessaging } from '@/lib/firebase-admin';
import { calculateNextVignetteDate, formatDateToLocalISO, getCorrectVignetteDeadline } from '@/lib/vignette';
import { calculateAverageKmPerDay, estimateVidangeDate, formatDateToFrench, getDaysRemaining } from '@/lib/vidange';
import { getDeadlineAnticipationInfo } from '@/lib/tunisia-holidays';
import {
    ReminderStage,
    getCanonicalTask,
    isDocumentTask,
    getReminderStageAndDays,
    buildNotificationLogKey,
    isDeadlineAlreadyCompleted,
    buildReminderMessage,
    buildVignetteMessage,
} from '@/lib/reminder-utils';

const NOTIF_LOGS_COLLECTION = 'notificationLogs';
const DIAGNOSTICS_COLLECTION = 'reminderDiagnostics';
const MAX_PENDING_ATTEMPTS = 5;
const IN_PROGRESS_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes lock timeout

export interface ReminderDiagnosticEntry {
    runId: string;
    executedAt: string;
    isSimulation: boolean;
    maintenanceId: string;
    vehicleId: string;
    vehicleName: string;
    task: string;
    dueDate: string;
    diffDays: number;
    daysOverdue: number;
    stage: ReminderStage | 'none';
    decision: 'ignored' | 'pending' | 'sent' | 'failed';
    reason: string;
    tokenCount: number;
    sendResult?: string | null;
    attemptCount: number;
    details?: string;
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    const authHeader = request.headers.get('authorization');
    const simulateDateParam = searchParams.get('simulateDate');
    const modeParam = searchParams.get('mode'); // 'simulate' (dry-run) | 'send' (controlled real send)
    const targetVehicleId = searchParams.get('targetVehicleId');
    const targetMaintenanceId = searchParams.get('targetMaintenanceId');
    const viewDiagnostics = searchParams.get('viewDiagnostics') === 'true';
    const forceParam = searchParams.get('force') === 'true';

    console.log('[CRON] Déclenchement détecté.');
    console.log('[CRON] Authorization header reçu:', authHeader ? `Bearer ***${authHeader.slice(-6)}` : 'ABSENT');
    console.log('[CRON] CRON_SECRET défini:', process.env.CRON_SECRET ? 'OUI' : 'NON');

    // Sécurité: accepte l'appel de Vercel Cron (Authorization header) ou via ?key=
    const cronSecret = process.env.CRON_SECRET;
    const isAuthorized =
        !cronSecret ||
        (key === cronSecret) ||
        (authHeader === `Bearer ${cronSecret}`) ||
        (request.headers.get('x-vercel-signature') !== null);

    if (!isAuthorized) {
        console.error('[CRON] ACCÈS REFUSÉ - Unauthorized. Header reçu:', authHeader);
        return NextResponse.json({ error: 'Unauthorized', hint: 'Vérifiez que CRON_SECRET est bien configuré sur Vercel' }, { status: 401 });
    }
    console.log('[CRON] Autorisation OK.');

    // Mode consultation rapide de l'historique des diagnostics
    if (viewDiagnostics) {
        try {
            const limit = Math.min(Number(searchParams.get('limit') || 50), 100);
            const diagSnap = await adminDb.collection(DIAGNOSTICS_COLLECTION)
                .orderBy('executedAt', 'desc')
                .limit(limit)
                .get();

            const items = diagSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            return NextResponse.json({ success: true, count: items.length, diagnostics: items });
        } catch (e: any) {
            return NextResponse.json({ error: e.message }, { status: 500 });
        }
    }

    try {
        const runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const executedAt = new Date().toISOString();

        // Détermination de la date de référence (avec support du mode simulation)
        let today: Date;
        let isSimulation = false;

        if (simulateDateParam) {
            const [y, m, d] = simulateDateParam.split('-').map(Number);
            today = new Date(y, m - 1, d);
            // Par défaut, la spécification d'une date simulée active le mode simulation sauf si mode=send explicitement demandé
            isSimulation = modeParam !== 'send';
        } else {
            today = new Date();
            today.setHours(0, 0, 0, 0);
            isSimulation = modeParam === 'simulate';
        }

        const dateString0 = formatDateToLocalISO(today);
        console.log(`[CRON] Date d'exécution de référence : ${dateString0} (Simulation: ${isSimulation ? 'OUI' : 'NON'})`);

        const diagnosticLogs: ReminderDiagnosticEntry[] = [];
        const recordDiagnostic = (entry: Omit<ReminderDiagnosticEntry, 'runId' | 'executedAt' | 'isSimulation'>) => {
            diagnosticLogs.push({
                runId,
                executedAt,
                isSimulation,
                ...entry
            });
        };

        // 1. Récupération des maintenances et véhicules
        const [maintenanceSnapshot, vehiclesSnapshot] = await Promise.all([
            adminDb.collection('maintenance').get(),
            adminDb.collection('vehicles').get()
        ]);

        console.log('[CRON] Données récupérées:', {
            totalMaintenances: maintenanceSnapshot.size,
            totalVehicles: vehiclesSnapshot.size
        });

        // Cache des véhicules
        const vehicleMap = new Map<string, any>();
        vehiclesSnapshot.docs.forEach(doc => {
            vehicleMap.set(doc.id, { id: doc.id, ...doc.data() });
        });

        // Cache des tokens FCM par utilisateur
        const userTokensCache = new Map<string, string[]>();
        const getUserTokens = async (userId: string): Promise<string[]> => {
            if (userTokensCache.has(userId)) {
                return userTokensCache.get(userId)!;
            }
            const tokensSnapshot = await adminDb
                .collection('fcmTokens')
                .where('userId', '==', userId)
                .get();
            const tokens = tokensSnapshot.docs.map(t => t.data().token).filter(Boolean);
            userTokensCache.set(userId, tokens);
            return tokens;
        };

        // Cache des logs existants dans notificationLogs
        const notifLogsCache = new Map<string, any>();
        const getNotifLog = async (logKey: string) => {
            if (notifLogsCache.has(logKey)) return notifLogsCache.get(logKey);
            const docSnap = await adminDb.collection(NOTIF_LOGS_COLLECTION).doc(logKey).get();
            const data = docSnap.exists ? docSnap.data() : null;
            notifLogsCache.set(logKey, data);
            return data;
        };

        const messagesToSend: Array<{
            logKey: string;
            maintenanceId: string;
            vehicleId: string;
            userId: string;
            task: string;
            stage: string;
            dueDate: string;
            tokens: string[];
            payload: any;
            isRetry?: boolean;
        }> = [];

        // =========================================================================
        // SECTION 0: RATTRAPAGE ET RETENTATIVE DES NOTIFICATIONS EN ATTENTE (PENDING)
        // =========================================================================
        console.log(`[CRON] Recherche des notifications 'pending' à retenter...`);
        const pendingSnap = await adminDb.collection(NOTIF_LOGS_COLLECTION)
            .where('status', '==', 'pending')
            .get();

        console.log(`[CRON] Notifications en attente trouvées: ${pendingSnap.size}`);

        for (const pendingDoc of pendingSnap.docs) {
            const pendingData = pendingDoc.data();
            const { id: logKey, maintenanceId, vehicleId, userId, task, stage, dueDate, attemptCount = 0 } = pendingData;

            if (!userId || !logKey) continue;
            if (targetVehicleId && vehicleId !== targetVehicleId) continue;
            if (targetMaintenanceId && maintenanceId !== targetMaintenanceId) continue;

            const vehicle = vehicleId ? vehicleMap.get(vehicleId) : null;
            const vehicleName = vehicle ? `${vehicle.brand} ${vehicle.model}` : 'votre véhicule';

            // 1. Dépassement du nombre maximal de tentatives (erreur permanente)
            if (attemptCount >= MAX_PENDING_ATTEMPTS) {
                console.warn(`[CRON] Pending ${logKey} a dépassé le max de tentatives (${attemptCount}). Marqué 'failed'.`);
                if (!isSimulation) {
                    await pendingDoc.ref.update({
                        status: 'failed',
                        failureReason: 'MAX_ATTEMPTS_EXCEEDED',
                        updatedAt: new Date().toISOString(),
                    });
                }
                recordDiagnostic({
                    maintenanceId,
                    vehicleId,
                    vehicleName,
                    task,
                    dueDate,
                    diffDays: 0,
                    daysOverdue: 0,
                    stage: stage as ReminderStage,
                    decision: 'failed',
                    reason: 'MAX_ATTEMPTS_EXCEEDED',
                    tokenCount: 0,
                    attemptCount,
                });
                continue;
            }

            // 2. Vérifier si l'échéance sous-jacente est toujours active (non supprimée et non renouvelée)
            if (maintenanceId && !maintenanceId.startsWith('synthetic-')) {
                const maintDoc = await adminDb.collection('maintenance').doc(maintenanceId).get();
                if (!maintDoc.exists) {
                    if (!isSimulation) {
                        await pendingDoc.ref.update({
                            status: 'cancelled',
                            pendingReason: 'MAINTENANCE_DELETED',
                            updatedAt: new Date().toISOString(),
                        });
                    }
                    recordDiagnostic({
                        maintenanceId,
                        vehicleId,
                        vehicleName,
                        task,
                        dueDate,
                        diffDays: 0,
                        daysOverdue: 0,
                        stage: stage as ReminderStage,
                        decision: 'ignored',
                        reason: 'MAINTENANCE_DELETED',
                        tokenCount: 0,
                        attemptCount,
                    });
                    continue;
                }

                const currentMaintData = maintDoc.data() || {};
                if (!currentMaintData.nextDueDate) {
                    // L'échéance a été marquée terminée ou n'a plus de date future
                    if (!isSimulation) {
                        await pendingDoc.ref.update({
                            status: 'cancelled',
                            pendingReason: 'MAINTENANCE_ALREADY_COMPLETED',
                            updatedAt: new Date().toISOString(),
                        });
                    }
                    recordDiagnostic({
                        maintenanceId,
                        vehicleId,
                        vehicleName,
                        task,
                        dueDate,
                        diffDays: 0,
                        daysOverdue: 0,
                        stage: stage as ReminderStage,
                        decision: 'ignored',
                        reason: 'MAINTENANCE_ALREADY_COMPLETED',
                        tokenCount: 0,
                        attemptCount,
                    });
                    continue;
                }
            }

            // 3. Récupération des tokens FCM disponibles
            const tokens = await getUserTokens(userId);
            if (tokens.length === 0) {
                console.log(`[CRON] Pending ${logKey} : toujours aucun token FCM pour ${userId}`);
                if (!isSimulation) {
                    await pendingDoc.ref.update({
                        attemptCount: admin.firestore.FieldValue.increment(1),
                        lastAttemptAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        pendingReason: 'NO_FCM_TOKEN',
                    });
                }
                recordDiagnostic({
                    maintenanceId,
                    vehicleId,
                    vehicleName,
                    task,
                    dueDate,
                    diffDays: 0,
                    daysOverdue: 0,
                    stage: stage as ReminderStage,
                    decision: 'pending',
                    reason: 'PENDING_RETRY',
                    details: 'Toujours aucun token FCM disponible',
                    tokenCount: 0,
                    attemptCount: attemptCount + 1,
                });
                continue;
            }

            // 4. Token disponible ! Reconstituer le message de rappel et l'enrôler pour envoi
            console.log(`[CRON] Pending ${logKey} : ${tokens.length} token(s) trouvés ! Programmation de la retentative...`);
            const msgInfo = buildReminderMessage({
                task,
                vehicleName,
                dueDate,
                stage: stage as ReminderStage,
                daysRemaining: stage?.startsWith('overdue') ? -Number(stage.split('_')[1] || 1) : 0,
            });

            const targetUrl = isDocumentTask(task) && (stage === 'j0' || (stage && stage.startsWith('overdue')))
                ? `/documents?vehicleId=${vehicleId || ''}`
                : `/maintenance?vehicleId=${vehicleId || ''}`;
            const tag = `carcare-retry-${maintenanceId}-${stage}`;

            messagesToSend.push({
                logKey,
                maintenanceId,
                vehicleId,
                userId,
                task,
                stage,
                dueDate,
                tokens,
                isRetry: true,
                payload: {
                    tokens,
                    notification: { title: msgInfo.title, body: msgInfo.body },
                    data: {
                        url: targetUrl,
                        title: msgInfo.title,
                        body: msgInfo.body,
                        type: 'maintenance-reminder',
                        taskId: String(maintenanceId || ''),
                        vehicleId: String(vehicleId || ''),
                        priority: msgInfo.isUrgent ? 'high' : 'normal',
                        tag,
                    },
                    webpush: {
                        headers: { Urgency: msgInfo.isUrgent ? 'high' : 'normal' },
                        notification: {
                            title: msgInfo.title,
                            body: msgInfo.body,
                            icon: '/android-chrome-192x192.png',
                            badge: '/badge-72x72.png',
                            tag,
                            renotify: true,
                            requireInteraction: msgInfo.isUrgent,
                            data: { url: targetUrl, tag }
                        },
                        fcmOptions: { link: targetUrl }
                    }
                }
            });

            recordDiagnostic({
                maintenanceId,
                vehicleId,
                vehicleName,
                task,
                dueDate,
                diffDays: 0,
                daysOverdue: 0,
                stage: stage as ReminderStage,
                decision: isSimulation ? 'ignored' : 'pending',
                reason: isSimulation ? 'SIMULATION_ONLY' : 'PENDING_RETRY',
                details: 'Notification en attente prête pour envoi',
                tokenCount: tokens.length,
                attemptCount: attemptCount + 1,
            });
        }

        // =========================================================================
        // SECTION 1: TRAITEMENT DES ÉCHÉANCES STANDARD PAR DATE (Assurance, Visite Tech, etc.)
        // =========================================================================
        console.log(`[CRON] Analyse des groupes d'entretiens par véhicule et tâche...`);

        // Regrouper toutes les maintenances par [vehicleId + canonicalTask]
        const maintenancesByVehicleAndCanonicalTask = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
        maintenanceSnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (!data.vehicleId || !data.task) return;
            const canonical = getCanonicalTask(data.task);
            const groupKey = `${data.vehicleId}_${canonical}`;
            if (!maintenancesByVehicleAndCanonicalTask.has(groupKey)) {
                maintenancesByVehicleAndCanonicalTask.set(groupKey, []);
            }
            maintenancesByVehicleAndCanonicalTask.get(groupKey)!.push(doc);
        });

        for (const [groupKey, docs] of maintenancesByVehicleAndCanonicalTask.entries()) {
            const firstDocData = docs[0].data();
            const vehicleId = firstDocData.vehicleId;
            if (targetVehicleId && vehicleId !== targetVehicleId) continue;

            const vehicle = vehicleId ? vehicleMap.get(vehicleId) : null;
            const vehicleName = vehicle ? `${vehicle.brand} ${vehicle.model}` : 'votre véhicule';

            // Trier les docs par date décroissante, puis nextDueDate décroissante
            docs.sort((a, b) => {
                const dateA = new Date(a.data().date || 0).getTime();
                const dateB = new Date(b.data().date || 0).getTime();
                if (dateB !== dateA) return dateB - dateA;
                return (b.data().nextDueDate || '').localeCompare(a.data().nextDueDate || '');
            });

            const allDocsForTask = docs.map(d => ({ id: d.id, ...d.data() }));

            for (const doc of docs) {
                const data = doc.data();
                const { userId, task, nextDueDate } = data;

                if (!userId || !nextDueDate) continue;
                if (targetMaintenanceId && doc.id !== targetMaintenanceId) continue;

                console.log(`--------------------------------------------------`);
                console.log(`[CRON] Maintenance trouvée: "${task}" (ID: ${doc.id})`);
                console.log(`[CRON] Véhicule: ${vehicleName}`);
                console.log(`[CRON] Due date: ${nextDueDate}`);

                // Vérification stricte du renouvellement (sans déduction hasardeuse ni suppression en base)
                const completionCheck = isDeadlineAlreadyCompleted({ id: doc.id, ...data }, allDocsForTask);
                if (completionCheck.isCompleted) {
                    console.log(`[CRON] IGNORÉE - maintenance déjà couverte (${completionCheck.reason})`);
                    recordDiagnostic({
                        maintenanceId: doc.id,
                        vehicleId: vehicleId || '',
                        vehicleName,
                        task,
                        dueDate: nextDueDate,
                        diffDays: 0,
                        daysOverdue: 0,
                        stage: 'none',
                        decision: 'ignored',
                        reason: 'MAINTENANCE_ALREADY_COMPLETED',
                        details: completionCheck.reason,
                        tokenCount: 0,
                        attemptCount: 0,
                    });
                    // RÈGLE ABSOLUE : on NE supprime JAMAIS nextDueDate automatiquement !
                    continue;
                }

                // Calcul exact de l'étape et des jours calendaires
                const { stage, daysRemaining } = getReminderStageAndDays(nextDueDate, today);
                const daysOverdue = daysRemaining < 0 ? Math.abs(daysRemaining) : 0;

                if (!stage) {
                    console.log(`[CRON] Échéance hors fenêtre active (${daysRemaining} jours restants)`);
                    recordDiagnostic({
                        maintenanceId: doc.id,
                        vehicleId: vehicleId || '',
                        vehicleName,
                        task,
                        dueDate: nextDueDate,
                        diffDays: daysRemaining,
                        daysOverdue,
                        stage: 'none',
                        decision: 'ignored',
                        reason: 'OUTSIDE_REMINDER_WINDOW',
                        details: `${daysRemaining} j restants`,
                        tokenCount: 0,
                        attemptCount: 0,
                    });
                    continue;
                }

                console.log(`[CRON] Stage: ${stage} (${daysRemaining} j restants / retard: ${daysOverdue})`);

                // Clé logique d'idempotence
                const logKey = buildNotificationLogKey(doc.id, stage, nextDueDate);
                const existingLog = await getNotifLog(logKey);

                if (existingLog && existingLog.status === 'sent' && !forceParam) {
                    console.log(`[CRON] Notification déjà envoyée: OUI (${logKey}) le ${existingLog.sentAt || 'précédemment'}`);
                    recordDiagnostic({
                        maintenanceId: doc.id,
                        vehicleId: vehicleId || '',
                        vehicleName,
                        task,
                        dueDate: nextDueDate,
                        diffDays: daysRemaining,
                        daysOverdue,
                        stage,
                        decision: 'ignored',
                        reason: 'ALREADY_SENT',
                        details: `Déjà envoyé le ${existingLog.sentAt || 'précédemment'}`,
                        tokenCount: 0,
                        attemptCount: existingLog.attemptCount || 1,
                    });
                    continue;
                }

                // Protection contre les exécutions concurrentes (verrou en cours)
                if (existingLog && existingLog.status === 'in_progress' && !forceParam) {
                    const lastAttemptMs = new Date(existingLog.lastAttemptAt || 0).getTime();
                    if (Date.now() - lastAttemptMs < IN_PROGRESS_TIMEOUT_MS) {
                        console.log(`[CRON] Traitement concurrent en cours: (${logKey})`);
                        recordDiagnostic({
                            maintenanceId: doc.id,
                            vehicleId: vehicleId || '',
                            vehicleName,
                            task,
                            dueDate: nextDueDate,
                            diffDays: daysRemaining,
                            daysOverdue,
                            stage,
                            decision: 'ignored',
                            reason: 'IN_PROGRESS_LOCK',
                            details: 'Un autre processus traite actuellement cette notification',
                            tokenCount: 0,
                            attemptCount: existingLog.attemptCount || 1,
                        });
                        continue;
                    }
                }

                if (forceParam && existingLog) {
                    console.log(`[CRON] Mode FORCE activé : renvoi forcé pour (${logKey})`);
                }

                // Récupération des tokens FCM
                const tokens = await getUserTokens(userId);
                console.log(`[CRON] Token FCM: ${tokens.length}`);

                if (tokens.length === 0) {
                    console.warn(`[CRON] EN ATTENTE - aucun token FCM pour ${userId}`);
                    if (!isSimulation) {
                        await adminDb.collection(NOTIF_LOGS_COLLECTION).doc(logKey).set({
                            id: logKey,
                            maintenanceId: doc.id,
                            vehicleId: vehicleId || '',
                            userId,
                            task,
                            stage,
                            dueDate: nextDueDate,
                            status: 'pending',
                            pendingReason: 'NO_FCM_TOKEN',
                            attemptCount: admin.firestore.FieldValue.increment(1),
                            lastAttemptAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                        }, { merge: true });
                    }
                    recordDiagnostic({
                        maintenanceId: doc.id,
                        vehicleId: vehicleId || '',
                        vehicleName,
                        task,
                        dueDate: nextDueDate,
                        diffDays: daysRemaining,
                        daysOverdue,
                        stage,
                        decision: isSimulation ? 'ignored' : 'pending',
                        reason: isSimulation ? 'SIMULATION_ONLY' : 'NO_FCM_TOKEN',
                        details: 'Aucun token FCM enregistré sur cet appareil',
                        tokenCount: 0,
                        attemptCount: 1,
                    });
                    continue;
                }

                // Préparation du contenu du message via reminder-utils
                const msgInfo = buildReminderMessage({
                    task,
                    vehicleName,
                    dueDate: nextDueDate,
                    stage,
                    daysRemaining,
                });

                const targetUrl = isDocumentTask(task) && (stage === 'j0' || stage.startsWith('overdue'))
                    ? `/documents?vehicleId=${vehicleId || ''}`
                    : `/maintenance?vehicleId=${vehicleId || ''}`;
                const tag = `carcare-task-${doc.id}-${stage}`;

                if (isSimulation) {
                    recordDiagnostic({
                        maintenanceId: doc.id,
                        vehicleId: vehicleId || '',
                        vehicleName,
                        task,
                        dueDate: nextDueDate,
                        diffDays: daysRemaining,
                        daysOverdue,
                        stage,
                        decision: 'ignored',
                        reason: 'SIMULATION_ONLY',
                        details: `Message préparé: "${msgInfo.title}"`,
                        tokenCount: tokens.length,
                        attemptCount: 0,
                    });
                } else {
                    // Verrou d'idempotence immédiat pour empêcher les doublons concurrents
                    await adminDb.collection(NOTIF_LOGS_COLLECTION).doc(logKey).set({
                        id: logKey,
                        maintenanceId: doc.id,
                        vehicleId: vehicleId || '',
                        userId,
                        task,
                        stage,
                        dueDate: nextDueDate,
                        status: 'in_progress',
                        lastAttemptAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    }, { merge: true });

                    messagesToSend.push({
                        logKey,
                        maintenanceId: doc.id,
                        vehicleId: vehicleId || '',
                        userId,
                        task,
                        stage,
                        dueDate: nextDueDate,
                        tokens,
                        payload: {
                            tokens,
                            notification: { title: msgInfo.title, body: msgInfo.body },
                            data: {
                                url: targetUrl,
                                title: msgInfo.title,
                                body: msgInfo.body,
                                type: 'maintenance-reminder',
                                taskId: String(doc.id || ''),
                                vehicleId: String(vehicleId || ''),
                                priority: msgInfo.isUrgent ? 'high' : 'normal',
                                tag,
                            },
                            webpush: {
                                headers: { Urgency: msgInfo.isUrgent ? 'high' : 'normal' },
                                notification: {
                                    title: msgInfo.title,
                                    body: msgInfo.body,
                                    icon: '/android-chrome-192x192.png',
                                    badge: '/badge-72x72.png',
                                    tag,
                                    renotify: true,
                                    requireInteraction: msgInfo.isUrgent,
                                    data: { url: targetUrl, tag }
                                },
                                fcmOptions: { link: targetUrl }
                            }
                        }
                    });
                }

                // Une seule échéance active notifiée par groupe véhicule/tâche à la fois
                break;
            }
        }

        // =========================================================================
        // SECTION 2: VIGNETTES DYNAMIQUES
        // =========================================================================
        const latestVignetteByVehicle = new Map<string, any>();
        maintenanceSnapshot.docs
            .filter(doc => getCanonicalTask(doc.data().task) === 'vignette')
            .forEach(doc => {
                const data = doc.data();
                if (data.vehicleId) {
                    const existing = latestVignetteByVehicle.get(data.vehicleId);
                    if (!existing || new Date(data.date).getTime() > new Date(existing.data().date).getTime()) {
                        latestVignetteByVehicle.set(data.vehicleId, doc);
                    }
                }
            });

        for (const [vehicleId, vehicle] of vehicleMap.entries()) {
            if (!vehicle.licensePlate || !vehicle.userId) continue;
            if (targetVehicleId && vehicleId !== targetVehicleId) continue;

            const existingVignetteDoc = latestVignetteByVehicle.get(vehicleId);
            let nextVignetteDate: Date;

            if (existingVignetteDoc && existingVignetteDoc.data().date) {
                const paymentDate = new Date(existingVignetteDoc.data().date);
                if (paymentDate.getFullYear() === today.getFullYear()) {
                    nextVignetteDate = calculateNextVignetteDate(vehicle.licensePlate, paymentDate);
                } else {
                    nextVignetteDate = getCorrectVignetteDeadline(vehicle.licensePlate, today, 60);
                }
            } else {
                nextVignetteDate = getCorrectVignetteDeadline(vehicle.licensePlate, today, 60);
            }

            const calculatedString = formatDateToLocalISO(nextVignetteDate);
            const { stage, daysRemaining } = getReminderStageAndDays(calculatedString, today);
            const daysOverdue = daysRemaining < 0 ? Math.abs(daysRemaining) : 0;
            const vehicleName = `${vehicle.brand} ${vehicle.model}`;

            if (stage) {
                const virtualId = existingVignetteDoc ? existingVignetteDoc.id : `synthetic-vignette-${vehicleId}`;
                const logKey = buildNotificationLogKey(virtualId, stage, calculatedString);
                const existingLog = await getNotifLog(logKey);

                console.log(`--------------------------------------------------`);
                console.log(`[CRON] Vignette trouvée pour ${vehicleName} (Due: ${calculatedString}, Stage: ${stage})`);

                if (existingLog && existingLog.status === 'sent' && !forceParam) {
                    console.log(`[CRON] Notification Vignette déjà envoyée (${logKey}) le ${existingLog.sentAt || 'précédemment'}`);
                    recordDiagnostic({
                        maintenanceId: virtualId,
                        vehicleId,
                        vehicleName,
                        task: 'Vignette',
                        dueDate: calculatedString,
                        diffDays: daysRemaining,
                        daysOverdue,
                        stage,
                        decision: 'ignored',
                        reason: 'ALREADY_SENT',
                        details: `Déjà envoyé le ${existingLog.sentAt || 'précédemment'}`,
                        tokenCount: 0,
                        attemptCount: existingLog.attemptCount || 1,
                    });
                    continue;
                }

                if (existingLog && existingLog.status === 'in_progress' && !forceParam) {
                    const lastAttemptMs = new Date(existingLog.lastAttemptAt || 0).getTime();
                    if (Date.now() - lastAttemptMs < IN_PROGRESS_TIMEOUT_MS) {
                        recordDiagnostic({
                            maintenanceId: virtualId,
                            vehicleId,
                            vehicleName,
                            task: 'Vignette',
                            dueDate: calculatedString,
                            diffDays: daysRemaining,
                            daysOverdue,
                            stage,
                            decision: 'ignored',
                            reason: 'IN_PROGRESS_LOCK',
                            details: 'Processus concurrent en cours',
                            tokenCount: 0,
                            attemptCount: existingLog.attemptCount || 1,
                        });
                        continue;
                    }
                }

                if (forceParam && existingLog) {
                    console.log(`[CRON] Mode FORCE activé : renvoi forcé pour Vignette (${logKey})`);
                }

                const tokens = await getUserTokens(vehicle.userId);
                if (tokens.length === 0) {
                    console.warn(`[CRON] EN ATTENTE - aucun token FCM pour Vignette ${vehicle.userId}`);
                    if (!isSimulation) {
                        await adminDb.collection(NOTIF_LOGS_COLLECTION).doc(logKey).set({
                            id: logKey,
                            maintenanceId: virtualId,
                            vehicleId,
                            userId: vehicle.userId,
                            task: 'Vignette',
                            stage,
                            dueDate: calculatedString,
                            status: 'pending',
                            pendingReason: 'NO_FCM_TOKEN',
                            attemptCount: admin.firestore.FieldValue.increment(1),
                            lastAttemptAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                        }, { merge: true });
                    }
                    recordDiagnostic({
                        maintenanceId: virtualId,
                        vehicleId,
                        vehicleName,
                        task: 'Vignette',
                        dueDate: calculatedString,
                        diffDays: daysRemaining,
                        daysOverdue,
                        stage,
                        decision: isSimulation ? 'ignored' : 'pending',
                        reason: isSimulation ? 'SIMULATION_ONLY' : 'NO_FCM_TOKEN',
                        details: 'Aucun token FCM enregistré',
                        tokenCount: 0,
                        attemptCount: 1,
                    });
                    continue;
                }

                const anticipation = (stage === 'j3' || stage === 'j7' || stage === 'j15')
                    ? getDeadlineAnticipationInfo(nextVignetteDate)
                    : undefined;

                const msgInfo = buildVignetteMessage({
                    vehicleName,
                    dueDateFormatted: nextVignetteDate.toLocaleDateString('fr-FR'),
                    stage,
                    daysRemaining,
                    anticipation,
                });

                const targetUrl = `/documents?vehicleId=${vehicleId}`;
                const tag = `vignette-${vehicleId}-${stage}-${nextVignetteDate.getFullYear()}`;

                if (isSimulation) {
                    recordDiagnostic({
                        maintenanceId: virtualId,
                        vehicleId,
                        vehicleName,
                        task: 'Vignette',
                        dueDate: calculatedString,
                        diffDays: daysRemaining,
                        daysOverdue,
                        stage,
                        decision: 'ignored',
                        reason: 'SIMULATION_ONLY',
                        details: `Message préparé: "${msgInfo.title}"`,
                        tokenCount: tokens.length,
                        attemptCount: 0,
                    });
                } else {
                    await adminDb.collection(NOTIF_LOGS_COLLECTION).doc(logKey).set({
                        id: logKey,
                        maintenanceId: virtualId,
                        vehicleId,
                        userId: vehicle.userId,
                        task: 'Vignette',
                        stage,
                        dueDate: calculatedString,
                        status: 'in_progress',
                        lastAttemptAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    }, { merge: true });

                    messagesToSend.push({
                        logKey,
                        maintenanceId: virtualId,
                        vehicleId,
                        userId: vehicle.userId,
                        task: 'Vignette',
                        stage,
                        dueDate: calculatedString,
                        tokens,
                        payload: {
                            tokens,
                            notification: { title: msgInfo.title, body: msgInfo.body },
                            data: {
                                url: targetUrl,
                                title: msgInfo.title,
                                body: msgInfo.body,
                                type: 'vignette-reminder',
                                vehicleId,
                                priority: msgInfo.isUrgent ? 'high' : 'normal',
                                tag
                            },
                            webpush: {
                                headers: { Urgency: msgInfo.isUrgent ? 'high' : 'normal' },
                                notification: {
                                    title: msgInfo.title,
                                    body: msgInfo.body,
                                    icon: '/android-chrome-192x192.png',
                                    badge: '/badge-72x72.png',
                                    tag,
                                    renotify: true,
                                    requireInteraction: msgInfo.isUrgent,
                                    data: { url: targetUrl, tag }
                                },
                                fcmOptions: { link: targetUrl }
                            }
                        }
                    });
                }
            } else {
                recordDiagnostic({
                    maintenanceId: existingVignetteDoc ? existingVignetteDoc.id : `synthetic-vignette-${vehicleId}`,
                    vehicleId,
                    vehicleName,
                    task: 'Vignette',
                    dueDate: calculatedString,
                    diffDays: daysRemaining,
                    daysOverdue,
                    stage: 'none',
                    decision: 'ignored',
                    reason: 'OUTSIDE_REMINDER_WINDOW',
                    details: `${daysRemaining} j restants`,
                    tokenCount: 0,
                    attemptCount: 0,
                });
            }
        }

        // =========================================================================
        // SECTION 3: VIDANGES SELON ESTIMATION KILOMÉTRIQUE
        // =========================================================================
        const latestVidangeByVehicle = new Map<string, any>();
        maintenanceSnapshot.docs
            .filter(doc => getCanonicalTask(doc.data().task) === 'vidange' && (doc.data().nextDueMileage || 0) > 0)
            .forEach(doc => {
                const data = doc.data();
                if (data.vehicleId) {
                    const existing = latestVidangeByVehicle.get(data.vehicleId);
                    if (!existing || new Date(data.date).getTime() > new Date(existing.data().date).getTime()) {
                        latestVidangeByVehicle.set(data.vehicleId, doc);
                    }
                }
            });

        for (const doc of latestVidangeByVehicle.values()) {
            const data = doc.data();
            const { userId, vehicleId, nextDueMileage } = data;
            if (!userId || !vehicleId || !nextDueMileage) continue;
            if (targetVehicleId && vehicleId !== targetVehicleId) continue;

            const [fuelLogsSnapshot, repairsSnapshot, vehicleMaintenanceSnapshot] = await Promise.all([
                adminDb.collection('fuelLogs').where('vehicleId', '==', vehicleId).get(),
                adminDb.collection('repairs').where('vehicleId', '==', vehicleId).get(),
                adminDb.collection('maintenance').where('vehicleId', '==', vehicleId).get()
            ]);

            const allEvents: { date: string; mileage: number }[] = [
                ...fuelLogsSnapshot.docs.map(d => d.data() as { date: string; mileage: number }),
                ...repairsSnapshot.docs.map(d => d.data() as { date: string; mileage: number }),
                ...vehicleMaintenanceSnapshot.docs.map(d => d.data() as { date: string; mileage: number })
            ].filter(e => typeof e.mileage === 'number' && e.mileage > 0 && Boolean(e.date));

            allEvents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            const avgKmPerDay = calculateAverageKmPerDay(allEvents);
            const latestEvent = allEvents[0];
            if (!latestEvent) continue;

            const kmRemaining = nextDueMileage - latestEvent.mileage;
            const vehicle = vehicleMap.get(vehicleId);
            const vehicleName = vehicle ? `${vehicle.brand} ${vehicle.model}` : 'votre véhicule';

            let stageTag: ReminderStage = null;
            let title = '';
            let body = '';
            let isUrgent = false;
            let estimatedDateString: string = '';
            let daysRemaining: number = 0;

            const estimatedDate = avgKmPerDay ? estimateVidangeDate(latestEvent.mileage, nextDueMileage, avgKmPerDay) : null;
            if (estimatedDate) {
                estimatedDateString = formatDateToLocalISO(estimatedDate);
                daysRemaining = getDaysRemaining(estimatedDate, today);
            }

            if (kmRemaining <= 0) {
                const absDays = daysRemaining < 0 ? Math.abs(daysRemaining) : 1;
                if (absDays === 1) stageTag = 'overdue_1';
                else if (absDays === 2) stageTag = 'overdue_2';
                else if (absDays === 3) stageTag = 'overdue_3';
                else if (absDays === 7) stageTag = 'overdue_7';
                else if (absDays === 14) stageTag = 'overdue_14';
                else if (absDays === 30) stageTag = 'overdue_30';
                else if (absDays === 60) stageTag = 'overdue_60';

                if (stageTag) {
                    isUrgent = true;
                    const kmDepasse = Math.abs(kmRemaining).toLocaleString('fr-FR');
                    const daysOverdueText = daysRemaining < 0 ? ` (J+${Math.abs(daysRemaining)})` : '';
                    title = `⚠️ Vidange Dépassée${daysOverdueText} : ${vehicleName}`;
                    body = `Vous avez dépassé de ${kmDepasse} km la limite prévue pour la vidange (actuel : ${latestEvent.mileage.toLocaleString('fr-FR')} km / prévu : ${nextDueMileage.toLocaleString('fr-FR')} km). Effectuez-la dès que possible ou marquez-la comme faite dans l’application.`;
                }
            } else if (estimatedDate && daysRemaining < 0) {
                const absDays = Math.abs(daysRemaining);
                if (absDays === 1) stageTag = 'overdue_1';
                else if (absDays === 2) stageTag = 'overdue_2';
                else if (absDays === 3) stageTag = 'overdue_3';
                else if (absDays === 7) stageTag = 'overdue_7';
                else if (absDays === 14) stageTag = 'overdue_14';
                else if (absDays === 30) stageTag = 'overdue_30';
                else if (absDays === 60) stageTag = 'overdue_60';

                if (stageTag) {
                    isUrgent = true;
                    title = `⚠️ Vidange en retard (J+${absDays}) : ${vehicleName}`;
                    body = `Selon votre rythme de conduite, votre vidange aurait dû être faite le ${formatDateToFrench(estimatedDate)} (${absDays} jour${absDays > 1 ? 's' : ''} de retard). Reste ${kmRemaining.toLocaleString('fr-FR')} km avant le terme. Pensez à l'effectuer dès que possible.`;
                }
            } else if (estimatedDate) {
                if (daysRemaining === 0) {
                    stageTag = 'j0';
                    isUrgent = true;
                    title = `🚨 Jour J : Vidange requise (${vehicleName})`;
                    body = `La vidange est due aujourd'hui selon votre rythme (${formatDateToFrench(estimatedDate)}). Reste ${kmRemaining.toLocaleString('fr-FR')} km.`;
                } else if (daysRemaining <= 3) {
                    stageTag = 'j3';
                    title = `Rappel J-3 : Vidange (${vehicleName})`;
                    body = `Vidange estimée dans ${daysRemaining} jours (${formatDateToFrench(estimatedDate)}). Reste ${kmRemaining.toLocaleString('fr-FR')} km.`;
                } else if (daysRemaining <= 7) {
                    stageTag = 'j7';
                    title = `Rappel J-7 : Vidange (${vehicleName})`;
                    body = `Vidange estimée dans une semaine (${formatDateToFrench(estimatedDate)}). Reste ${kmRemaining.toLocaleString('fr-FR')} km.`;
                } else if (daysRemaining <= 15) {
                    stageTag = 'j15';
                    title = `Rappel J-15 : Vidange (${vehicleName})`;
                    body = `Vidange prévue dans environ 15 jours (${formatDateToFrench(estimatedDate)}). Reste ${kmRemaining.toLocaleString('fr-FR')} km.`;
                }
            }

            if (stageTag) {
                const logKey = `vidange_${doc.id}_${stageTag}_${estimatedDateString || nextDueMileage}`;
                const existingLog = await getNotifLog(logKey);

                if (existingLog && existingLog.status === 'sent' && !forceParam) {
                    recordDiagnostic({
                        maintenanceId: doc.id,
                        vehicleId,
                        vehicleName,
                        task: 'Vidange',
                        dueDate: estimatedDateString || String(nextDueMileage),
                        diffDays: daysRemaining,
                        daysOverdue: daysRemaining < 0 ? Math.abs(daysRemaining) : 0,
                        stage: stageTag,
                        decision: 'ignored',
                        reason: 'ALREADY_SENT',
                        details: `Déjà envoyé le ${existingLog.sentAt || 'précédemment'}`,
                        tokenCount: 0,
                        attemptCount: existingLog.attemptCount || 1,
                    });
                    continue;
                }

                if (existingLog && existingLog.status === 'in_progress' && !forceParam) {
                    const lastAttemptMs = new Date(existingLog.lastAttemptAt || 0).getTime();
                    if (Date.now() - lastAttemptMs < IN_PROGRESS_TIMEOUT_MS) {
                        recordDiagnostic({
                            maintenanceId: doc.id,
                            vehicleId,
                            vehicleName,
                            task: 'Vidange',
                            dueDate: estimatedDateString || String(nextDueMileage),
                            diffDays: daysRemaining,
                            daysOverdue: daysRemaining < 0 ? Math.abs(daysRemaining) : 0,
                            stage: stageTag,
                            decision: 'ignored',
                            reason: 'IN_PROGRESS_LOCK',
                            details: 'Processus concurrent en cours',
                            tokenCount: 0,
                            attemptCount: existingLog.attemptCount || 1,
                        });
                        continue;
                    }
                }

                if (forceParam && existingLog) {
                    console.log(`[CRON] Mode FORCE activé : renvoi forcé pour Vidange (${logKey})`);
                }

                const tokens = await getUserTokens(userId);
                if (tokens.length === 0) {
                    if (!isSimulation) {
                        await adminDb.collection(NOTIF_LOGS_COLLECTION).doc(logKey).set({
                            id: logKey,
                            maintenanceId: doc.id,
                            vehicleId,
                            userId,
                            task: 'Vidange',
                            stage: stageTag,
                            dueDate: estimatedDateString || String(nextDueMileage),
                            status: 'pending',
                            pendingReason: 'NO_FCM_TOKEN',
                            attemptCount: admin.firestore.FieldValue.increment(1),
                            lastAttemptAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                        }, { merge: true });
                    }
                    recordDiagnostic({
                        maintenanceId: doc.id,
                        vehicleId,
                        vehicleName,
                        task: 'Vidange',
                        dueDate: estimatedDateString || String(nextDueMileage),
                        diffDays: daysRemaining,
                        daysOverdue: daysRemaining < 0 ? Math.abs(daysRemaining) : 0,
                        stage: stageTag,
                        decision: isSimulation ? 'ignored' : 'pending',
                        reason: isSimulation ? 'SIMULATION_ONLY' : 'NO_FCM_TOKEN',
                        details: 'Aucun token FCM enregistré',
                        tokenCount: 0,
                        attemptCount: 1,
                    });
                    continue;
                }

                const targetUrl = `/maintenance?vehicleId=${vehicleId}&highlight=${doc.id}`;
                const tag = `vidange-${doc.id}-${stageTag}`;

                if (isSimulation) {
                    recordDiagnostic({
                        maintenanceId: doc.id,
                        vehicleId,
                        vehicleName,
                        task: 'Vidange',
                        dueDate: estimatedDateString || String(nextDueMileage),
                        diffDays: daysRemaining,
                        daysOverdue: daysRemaining < 0 ? Math.abs(daysRemaining) : 0,
                        stage: stageTag,
                        decision: 'ignored',
                        reason: 'SIMULATION_ONLY',
                        details: `Message préparé: "${title}"`,
                        tokenCount: tokens.length,
                        attemptCount: 0,
                    });
                } else {
                    await adminDb.collection(NOTIF_LOGS_COLLECTION).doc(logKey).set({
                        id: logKey,
                        maintenanceId: doc.id,
                        vehicleId,
                        userId,
                        task: 'Vidange',
                        stage: stageTag,
                        dueDate: estimatedDateString || String(nextDueMileage),
                        status: 'in_progress',
                        lastAttemptAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    }, { merge: true });

                    messagesToSend.push({
                        logKey,
                        maintenanceId: doc.id,
                        vehicleId,
                        userId,
                        task: 'Vidange',
                        stage: stageTag,
                        dueDate: estimatedDateString || String(nextDueMileage),
                        tokens,
                        payload: {
                            tokens,
                            notification: { title, body },
                            data: {
                                url: targetUrl,
                                title,
                                body,
                                type: 'vidange-reminder',
                                taskId: String(doc.id),
                                vehicleId: String(vehicleId),
                                priority: isUrgent ? 'high' : 'normal',
                                tag
                            },
                            webpush: {
                                headers: { Urgency: isUrgent ? 'high' : 'normal' },
                                notification: {
                                    title,
                                    body,
                                    icon: '/android-chrome-192x192.png',
                                    badge: '/badge-72x72.png',
                                    tag,
                                    renotify: true,
                                    requireInteraction: isUrgent,
                                    data: { url: targetUrl, tag }
                                },
                                fcmOptions: { link: targetUrl }
                            }
                        }
                    });
                }
            } else {
                recordDiagnostic({
                    maintenanceId: doc.id,
                    vehicleId,
                    vehicleName,
                    task: 'Vidange',
                    dueDate: estimatedDateString || String(nextDueMileage),
                    diffDays: daysRemaining,
                    daysOverdue: daysRemaining < 0 ? Math.abs(daysRemaining) : 0,
                    stage: 'none',
                    decision: 'ignored',
                    reason: 'OUTSIDE_REMINDER_WINDOW',
                    details: `${daysRemaining} j restants, kmRemaining: ${kmRemaining}`,
                    tokenCount: 0,
                    attemptCount: 0,
                });
            }
        }

        // =========================================================================
        // SECTION 4: ENVOI FCM MULTICAST & ENREGISTREMENT IDEMPOTENT
        // =========================================================================
        let successCount = 0;
        let failureCount = 0;
        const deadTokensToDelete: string[] = [];

        console.log(`--------------------------------------------------`);
        console.log(`[CRON] Messages prêts à être envoyés: ${messagesToSend.length} (Simulation: ${isSimulation ? 'OUI' : 'NON'})`);

        if (!isSimulation) {
            for (const msg of messagesToSend) {
                console.log(`[CRON] Envoi FCM en cours pour: "${msg.task}" (${msg.stage}) → ${msg.tokens.length} token(s)`);
                try {
                    const response = await adminMessaging.sendEachForMulticast(msg.payload);
                    const isSuccess = response.successCount > 0;
                    console.log(`[CRON] Envoi FCM: ${isSuccess ? 'SUCCESS' : 'FAILED'} (${response.successCount} succès, ${response.failureCount} échecs)`);
                    successCount += response.successCount;
                    failureCount += response.failureCount;

                    if (isSuccess) {
                        // Accepté par Firebase : enregistrer comme 'sent'
                        await adminDb.collection(NOTIF_LOGS_COLLECTION).doc(msg.logKey).set({
                            id: msg.logKey,
                            maintenanceId: msg.maintenanceId,
                            vehicleId: msg.vehicleId,
                            userId: msg.userId,
                            task: msg.task,
                            stage: msg.stage,
                            dueDate: msg.dueDate,
                            status: 'sent',
                            sentAt: new Date().toISOString(),
                            lastAttemptAt: new Date().toISOString(),
                            attemptCount: admin.firestore.FieldValue.increment(1),
                            updatedAt: new Date().toISOString(),
                            successTokensCount: response.successCount,
                        }, { merge: true });

                        recordDiagnostic({
                            maintenanceId: msg.maintenanceId,
                            vehicleId: msg.vehicleId,
                            vehicleName: vehicleMap.get(msg.vehicleId) ? `${vehicleMap.get(msg.vehicleId).brand} ${vehicleMap.get(msg.vehicleId).model}` : 'Véhicule',
                            task: msg.task,
                            dueDate: msg.dueDate,
                            diffDays: 0,
                            daysOverdue: 0,
                            stage: msg.stage as ReminderStage,
                            decision: 'sent',
                            reason: 'FCM_SEND_SUCCESS',
                            sendResult: `${response.successCount} succès`,
                            tokenCount: msg.tokens.length,
                            attemptCount: 1,
                        });
                    } else {
                        // Échec Firebase : marquer 'pending' pour retentative ultérieure
                        await adminDb.collection(NOTIF_LOGS_COLLECTION).doc(msg.logKey).set({
                            id: msg.logKey,
                            maintenanceId: msg.maintenanceId,
                            vehicleId: msg.vehicleId,
                            userId: msg.userId,
                            task: msg.task,
                            stage: msg.stage,
                            dueDate: msg.dueDate,
                            status: 'pending',
                            pendingReason: 'FCM_TEMP_ERROR',
                            lastAttemptAt: new Date().toISOString(),
                            attemptCount: admin.firestore.FieldValue.increment(1),
                            updatedAt: new Date().toISOString(),
                        }, { merge: true });

                        recordDiagnostic({
                            maintenanceId: msg.maintenanceId,
                            vehicleId: msg.vehicleId,
                            vehicleName: vehicleMap.get(msg.vehicleId) ? `${vehicleMap.get(msg.vehicleId).brand} ${vehicleMap.get(msg.vehicleId).model}` : 'Véhicule',
                            task: msg.task,
                            dueDate: msg.dueDate,
                            diffDays: 0,
                            daysOverdue: 0,
                            stage: msg.stage as ReminderStage,
                            decision: 'failed',
                            reason: 'FCM_SEND_FAILED',
                            sendResult: `0 succès, ${response.failureCount} échecs`,
                            tokenCount: msg.tokens.length,
                            attemptCount: 1,
                        });
                    }

                    // Détection des tokens expirés ou non enregistrés pour nettoyage
                    response.responses.forEach((resp, idx) => {
                        if (!resp.success && resp.error) {
                            const errCode = resp.error.code;
                            if (
                                errCode === 'messaging/registration-token-not-registered' ||
                                errCode === 'messaging/invalid-registration-token' ||
                                errCode === 'messaging/invalid-argument'
                            ) {
                                deadTokensToDelete.push(msg.tokens[idx]);
                            }
                        }
                    });

                } catch (err: any) {
                    console.error(`[CRON] Envoi FCM FAILED avec exception :`, err);
                    failureCount += msg.tokens.length;

                    await adminDb.collection(NOTIF_LOGS_COLLECTION).doc(msg.logKey).set({
                        id: msg.logKey,
                        maintenanceId: msg.maintenanceId,
                        vehicleId: msg.vehicleId,
                        userId: msg.userId,
                        task: msg.task,
                        stage: msg.stage,
                        dueDate: msg.dueDate,
                        status: 'pending',
                        pendingReason: 'FCM_TEMP_ERROR',
                        lastAttemptAt: new Date().toISOString(),
                        attemptCount: admin.firestore.FieldValue.increment(1),
                        updatedAt: new Date().toISOString(),
                    }, { merge: true });

                    recordDiagnostic({
                        maintenanceId: msg.maintenanceId,
                        vehicleId: msg.vehicleId,
                        vehicleName: vehicleMap.get(msg.vehicleId) ? `${vehicleMap.get(msg.vehicleId).brand} ${vehicleMap.get(msg.vehicleId).model}` : 'Véhicule',
                        task: msg.task,
                        dueDate: msg.dueDate,
                        diffDays: 0,
                        daysOverdue: 0,
                        stage: msg.stage as ReminderStage,
                        decision: 'failed',
                        reason: 'FCM_SEND_FAILED',
                        sendResult: err?.message || 'Exception FCM',
                        tokenCount: msg.tokens.length,
                        attemptCount: 1,
                    });
                }
            }

            // Nettoyage asynchrone des tokens morts
            if (deadTokensToDelete.length > 0) {
                console.log(`Suppression de ${deadTokensToDelete.length} tokens FCM invalides...`);
                const uniqueDeadTokens = Array.from(new Set(deadTokensToDelete));
                for (const deadToken of uniqueDeadTokens) {
                    try {
                        const deadDocs = await adminDb.collection('fcmTokens').where('token', '==', deadToken).get();
                        deadDocs.forEach(d => d.ref.delete());
                    } catch (e) {
                        console.error('Erreur suppression token mort :', e);
                    }
                }
            }
        }

        // =========================================================================
        // SECTION 5: HISTORIQUE DES DIAGNOSTICS & RÉTENTION (30 JOURS)
        // =========================================================================
        try {
            // Sauvegarde batch des diagnostics de cette exécution
            if (diagnosticLogs.length > 0) {
                const batch = adminDb.batch();
                diagnosticLogs.forEach((diag, index) => {
                    const docRef = adminDb.collection(DIAGNOSTICS_COLLECTION).doc(`${runId}_${index}`);
                    batch.set(docRef, diag);
                });
                await batch.commit();
            }

            // Nettoyage régulier des anciens logs de diagnostic (> 30 jours)
            if (!isSimulation) {
                const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
                const oldDiagsSnap = await adminDb.collection(DIAGNOSTICS_COLLECTION)
                    .where('executedAt', '<', thirtyDaysAgoIso)
                    .limit(100)
                    .get();

                if (!oldDiagsSnap.empty) {
                    const cleanBatch = adminDb.batch();
                    oldDiagsSnap.docs.forEach(d => cleanBatch.delete(d.ref));
                    await cleanBatch.commit();
                }
            }
        } catch (diagError) {
            console.error('[CRON] Erreur enregistrement diagnostic Firestore:', diagError);
        }

        return NextResponse.json({
            success: true,
            runId,
            isSimulation,
            referenceDate: dateString0,
            messagesPrepared: messagesToSend.length,
            notificationsSent: successCount,
            notificationsFailed: failureCount,
            tokensCleaned: deadTokensToDelete.length,
            diagnosticsCount: diagnosticLogs.length,
            diagnostics: diagnosticLogs,
        });

    } catch (error: any) {
        console.error('Erreur lors de l\'exécution du Cron Job:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
