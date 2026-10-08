import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { adminDb, adminMessaging } from '@/lib/firebase-admin';
import { calculateNextVignetteDate, formatDateToLocalISO, getCorrectVignetteDeadline } from '@/lib/vignette';
import { calculateAverageKmPerDay, estimateVidangeDate, formatDateToFrench, getDaysRemaining } from '@/lib/vidange';
import { getDeadlineAnticipationInfo } from '@/lib/tunisia-holidays';

const NOTIF_LOGS_COLLECTION = 'notificationLogs';

// Normalisation canonique des tâches pour regrouper les variantes de libellés
function getCanonicalTask(task: string): 'assurance' | 'visite_technique' | 'vignette' | 'vidange' | string {
    if (!task) return '';
    const clean = task.trim().toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // suppression des accents
    if (clean.includes('assurance')) return 'assurance';
    if (clean.includes('visite') || clean.includes('controle')) return 'visite_technique';
    if (clean.includes('vignette')) return 'vignette';
    if (clean.includes('vidange')) return 'vidange';
    return clean;
}

// Calcul de l'étape (J0, J-3, J-7, J-15, overdue) avec tolérance aux exécutions manquées
function getStageAndDaysRemaining(dueDateStr: string, today: Date): { stage: 'j0' | 'j3' | 'j7' | 'j15' | 'overdue' | null; daysRemaining: number } {
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const [y, m, d] = dueDateStr.split('-').map(Number);
    const dueMidnight = new Date(y, m - 1, d).getTime();
    const diffDays = Math.round((dueMidnight - todayMidnight) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return { stage: 'j0', daysRemaining: 0 };
    if (diffDays >= 1 && diffDays <= 3) return { stage: 'j3', daysRemaining: diffDays };
    if (diffDays >= 4 && diffDays <= 7) return { stage: 'j7', daysRemaining: diffDays };
    if (diffDays >= 8 && diffDays <= 15) return { stage: 'j15', daysRemaining: diffDays };
    if (diffDays < 0) {
        // Fenêtre active d'overdue (jusqu'à 90 jours de retard pour éviter les enregistrements abandonnés de plusieurs années)
        if (diffDays >= -90) {
            return { stage: 'overdue', daysRemaining: diffDays };
        }
        return { stage: null, daysRemaining: diffDays };
    }
    return { stage: null, daysRemaining: diffDays };
}

// Vérifie si une échéance donnée a déjà été couverte ou renouvelée par un entretien postérieur
function isDeadlineAlreadyCompleted(
    candidateDoc: FirebaseFirestore.QueryDocumentSnapshot,
    allMaintenancesForVehicleAndTask: FirebaseFirestore.QueryDocumentSnapshot[]
): { isCompleted: boolean; reason?: string } {
    const candidateData = candidateDoc.data();
    const candidateDueDate = candidateData.nextDueDate;
    if (!candidateDueDate) {
        return { isCompleted: true, reason: 'Pas de date d\'échéance future' };
    }

    const candidateDueDateMs = new Date(candidateDueDate).getTime();
    const candidateDateMs = new Date(candidateData.date || 0).getTime();

    for (const other of allMaintenancesForVehicleAndTask) {
        if (other.id === candidateDoc.id) continue;
        const otherData = other.data();
        const otherDateMs = new Date(otherData.date || 0).getTime();
        const otherDueDate = otherData.nextDueDate;

        // Cas 1: Une intervention réelle a été enregistrée à la date d'échéance ou après
        if (otherDateMs >= candidateDueDateMs) {
            return {
                isCompleted: true,
                reason: `Couverte par l'intervention du ${otherData.date || 'date récente'}`
            };
        }

        // Cas 2: Un entretien plus récent ou identique a déjà généré une échéance plus lointaine
        if (otherDateMs >= candidateDateMs && otherDueDate && otherDueDate > candidateDueDate) {
            return {
                isCompleted: true,
                reason: `Remplacée par une échéance plus récente (${otherDueDate})`
            };
        }
    }

    return { isCompleted: false };
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    const authHeader = request.headers.get('authorization');

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

    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dateString0 = formatDateToLocalISO(today);

        // 1. Récupération de l'ensemble des maintenances et des véhicules
        const [maintenanceSnapshot, vehiclesSnapshot] = await Promise.all([
            adminDb.collection('maintenance').get(),
            adminDb.collection('vehicles').get()
        ]);

        console.log('[CRON] Données récupérées:', {
            totalMaintenances: maintenanceSnapshot.size,
            totalVehicles: vehiclesSnapshot.size
        });

        // Cache des informations des véhicules
        const vehicleMap = new Map<string, any>();
        vehiclesSnapshot.docs.forEach(doc => {
            vehicleMap.set(doc.id, { id: doc.id, ...doc.data() });
        });

        // Cache des tokens FCM par utilisateur pour éviter les requêtes répétées
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

        // Cache des statuts de notifications existantes dans notificationLogs
        const notifLogsCache = new Map<string, any>();
        const getNotifLog = async (logKey: string) => {
            if (notifLogsCache.has(logKey)) return notifLogsCache.get(logKey);
            const docSnap = await adminDb.collection(NOTIF_LOGS_COLLECTION).doc(logKey).get();
            const data = docSnap.exists ? docSnap.data() : null;
            notifLogsCache.set(logKey, data);
            return data;
        };

        const DOCUMENT_TASKS = new Set([
            'Vignette',
            'vignette',
            'Paiement Assurance',
            'Assurance',
            'Visite Technique',
            'Visite technique',
            'Contrôle Technique',
            'Controle technique',
            'Carte Grise',
        ]);

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
        }> = [];

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

        // =========================================================================
        // SECTION 1: TRAITEMENT DES ÉCHÉANCES STANDARD PAR DATE (Assurance, Visite Tech, etc.)
        // =========================================================================
        console.log(`[CRON] Analyse des groupes d'entretiens par véhicule et tâche...`);

        for (const [groupKey, docs] of maintenancesByVehicleAndCanonicalTask.entries()) {
            // Identifier le véhicule
            const firstDocData = docs[0].data();
            const vehicleId = firstDocData.vehicleId;
            const vehicle = vehicleId ? vehicleMap.get(vehicleId) : null;
            const vehicleName = vehicle ? `${vehicle.brand} ${vehicle.model}` : 'votre véhicule';

            // Trier les docs par date décroissante, puis nextDueDate décroissante
            docs.sort((a, b) => {
                const dateA = new Date(a.data().date || 0).getTime();
                const dateB = new Date(b.data().date || 0).getTime();
                if (dateB !== dateA) return dateB - dateA;
                return (b.data().nextDueDate || '').localeCompare(a.data().nextDueDate || '');
            });

            // Pour chaque document avec une nextDueDate, vérifier son statut
            for (const doc of docs) {
                const data = doc.data();
                const { userId, task, nextDueDate } = data;

                // Ignorer les documents sans échéance ou sans utilisateur
                if (!userId || !nextDueDate) continue;

                console.log(`--------------------------------------------------`);
                console.log(`[CRON] Maintenance trouvée: "${task}" (ID: ${doc.id})`);
                console.log(`[CRON] Véhicule: ${vehicleName}`);
                console.log(`[CRON] Tâche: ${task}`);
                console.log(`[CRON] Due date: ${nextDueDate}`);

                // Vérifier si cette échéance est déjà terminée / couverte par une action postérieure
                const completionCheck = isDeadlineAlreadyCompleted(doc, docs);
                if (completionCheck.isCompleted) {
                    console.log(`[CRON] IGNORÉE - maintenance déjà effectuée (${completionCheck.reason})`);
                    // Nettoyage en tâche de fond du champ obsolète pour assainir Firestore
                    if (data.nextDueDate < dateString0) {
                        doc.ref.update({
                            nextDueDate: admin.firestore.FieldValue.delete(),
                            nextDueMileage: admin.firestore.FieldValue.delete()
                        }).catch(() => {});
                    }
                    continue;
                }

                // Calcul du stage avec tolérance de jours
                const { stage, daysRemaining } = getStageAndDaysRemaining(nextDueDate, today);
                if (!stage) {
                    console.log(`[CRON] Échéance hors fenêtre active (${daysRemaining} jours restants)`);
                    continue;
                }

                console.log(`[CRON] Stage: ${stage} (${daysRemaining} j restants)`);

                // Clé logique d'idempotence
                const logKey = `${doc.id}_${stage}_${nextDueDate}`;
                const existingLog = await getNotifLog(logKey);

                if (existingLog && existingLog.status === 'sent') {
                    console.log(`[CRON] Notification déjà envoyée: OUI (${logKey})`);
                    continue;
                }

                console.log(`[CRON] Notification déjà envoyée: NON`);

                // Récupération des tokens FCM
                const tokens = await getUserTokens(userId);
                console.log(`[CRON] Token FCM: ${tokens.length}`);

                if (tokens.length === 0) {
                    console.warn(`[CRON] EN ATTENTE - aucun token FCM pour ${userId}`);
                    // Sauvegarde dans notificationLogs comme 'pending' pour retentative ultérieure
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
                    continue;
                }

                // Préparation du contenu du message
                let title = 'Rappel Entretien';
                let body = '';
                const isUrgent = stage === 'j0' || stage === 'overdue';
                const requiresDoc = DOCUMENT_TASKS.has(task) || DOCUMENT_TASKS.has(getCanonicalTask(task));

                if (stage === 'overdue') {
                    title = `⚠️ Entretien en retard : ${task} (${vehicleName})`;
                    if (requiresDoc) {
                        body = `"${task}" pour ${vehicleName} aurait dû être fait le ${nextDueDate}. Payez dès que possible et ajoutez le justificatif dans la section Documents de l’application.`;
                    } else {
                        body = `"${task}" pour ${vehicleName} aurait dû être fait le ${nextDueDate}. Effectuez-le dès que possible ou marquez-le comme fait avec sa vraie date dans l’application.`;
                    }
                } else if (stage === 'j0') {
                    title = `🚨 Jour J : ${task} (${vehicleName})`;
                    if (requiresDoc) {
                        body = `C’est aujourd’hui la date limite pour "${task}" (${vehicleName}). Après le paiement, pensez à ajouter le reçu ou le document dans la section Documents de l’application.`;
                    } else {
                        body = `C'est aujourd'hui la date limite pour "${task}" (${vehicleName}). Après l’entretien, n’oubliez pas de l’enregistrer avec la vraie date dans l’application.`;
                    }
                } else if (stage === 'j3') {
                    const anticipation = getDeadlineAnticipationInfo(nextDueDate);
                    if (anticipation.isNonWorking) {
                        title = `⚠️ Rappel J-3 (${anticipation.dayName}) : ${task} (${vehicleName})`;
                        if (requiresDoc) {
                            body = `Plus que 3 jours pour "${task}" (${vehicleName}). ${anticipation.warningText} Pensez à enregistrer le justificatif dans l’application après paiement.`;
                        } else {
                            body = `Dans 3 jours : "${task}" pour ${vehicleName}. ${anticipation.warningText} Pensez à planifier votre rendez-vous.`;
                        }
                    } else {
                        title = `Rappel J-3 : ${task} (${vehicleName})`;
                        if (requiresDoc) {
                            body = `Plus que 3 jours pour "${task}" (${vehicleName}). Préparez votre paiement et n’oubliez pas d’enregistrer le justificatif dans l’application.`;
                        } else {
                            body = `Dans 3 jours : "${task}" pour ${vehicleName}. Pensez à planifier votre rendez-vous.`;
                        }
                    }
                } else if (stage === 'j7') {
                    const anticipation = getDeadlineAnticipationInfo(nextDueDate);
                    if (anticipation.isNonWorking) {
                        title = `Rappel J-7 : ${task} (${vehicleName})`;
                        body = `Dans une semaine : "${task}" (${vehicleName}) arrive à échéance le ${anticipation.dueDateFormatted}. ${anticipation.warningText}`;
                    } else {
                        title = `Rappel J-7 : ${task} (${vehicleName})`;
                        body = `Dans une semaine : "${task}" pour ${vehicleName} arrive à échéance.`;
                    }
                } else if (stage === 'j15') {
                    const anticipation = getDeadlineAnticipationInfo(nextDueDate);
                    if (anticipation.isNonWorking) {
                        title = `Rappel J-15 : ${task} (${vehicleName})`;
                        body = `Dans 15 jours : pensez à anticiper l’entretien "${task}" pour votre ${vehicleName} (${anticipation.dueDateFormatted}). ${anticipation.warningText}`;
                    } else {
                        title = `Rappel J-15 : ${task} (${vehicleName})`;
                        body = `Dans 15 jours : pensez à anticiper l’entretien "${task}" pour votre ${vehicleName}.`;
                    }
                }

                const targetUrl = requiresDoc && (stage === 'j0' || stage === 'overdue')
                    ? `/documents?vehicleId=${vehicleId || ''}`
                    : `/maintenance?vehicleId=${vehicleId || ''}`;
                const tag = `carcare-task-${doc.id}-${stage}`;

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
                        notification: { title, body },
                        data: {
                            url: targetUrl,
                            title,
                            body,
                            type: 'maintenance-reminder',
                            taskId: String(doc.id || ''),
                            vehicleId: String(vehicleId || ''),
                            priority: isUrgent ? 'high' : 'normal',
                            tag,
                        },
                        webpush: {
                            headers: {
                                Urgency: isUrgent ? 'high' : 'normal',
                            },
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

            const existingVignetteDoc = latestVignetteByVehicle.get(vehicleId);
            let nextVignetteDate: Date;

            if (existingVignetteDoc && existingVignetteDoc.data().date) {
                nextVignetteDate = calculateNextVignetteDate(vehicle.licensePlate, new Date(existingVignetteDoc.data().date));
                if (nextVignetteDate < today) {
                    nextVignetteDate = getCorrectVignetteDeadline(vehicle.licensePlate, today);
                }
            } else {
                nextVignetteDate = getCorrectVignetteDeadline(vehicle.licensePlate, today);
            }

            const calculatedString = formatDateToLocalISO(nextVignetteDate);
            const { stage } = getStageAndDaysRemaining(calculatedString, today);

            if (stage && stage !== 'overdue') { // Les vignettes synthétiques n'envoient pas d'overdue permanent
                const virtualId = existingVignetteDoc ? existingVignetteDoc.id : `synthetic-vignette-${vehicleId}`;
                const logKey = `${virtualId}_${stage}_${calculatedString}`;
                const existingLog = await getNotifLog(logKey);

                const vehicleName = `${vehicle.brand} ${vehicle.model}`;

                console.log(`--------------------------------------------------`);
                console.log(`[CRON] Maintenance trouvée: "Vignette"`);
                console.log(`[CRON] Véhicule: ${vehicleName}`);
                console.log(`[CRON] Tâche: Vignette`);
                console.log(`[CRON] Due date: ${calculatedString}`);
                console.log(`[CRON] Stage: ${stage}`);

                if (existingLog && existingLog.status === 'sent') {
                    console.log(`[CRON] Notification déjà envoyée: OUI (${logKey})`);
                    continue;
                }

                console.log(`[CRON] Notification déjà envoyée: NON`);
                const tokens = await getUserTokens(vehicle.userId);
                console.log(`[CRON] Token FCM: ${tokens.length}`);

                if (tokens.length === 0) {
                    console.warn(`[CRON] EN ATTENTE - aucun token FCM pour ${vehicle.userId}`);
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
                    continue;
                }

                let title = `Rappel Vignette (${vehicleName})`;
                let body = `La date limite de la vignette (${nextVignetteDate.toLocaleDateString('fr-FR')}) approche pour ${vehicleName}.`;

                if (stage === 'j0') {
                    title = `🚨 Jour J : Vignette (${vehicleName})`;
                    body = `Aujourd’hui est la date limite officielle pour le paiement de la Vignette de ${vehicleName}. Après le paiement, ajoutez immédiatement le reçu dans la section « Documents » de l’application.`;
                } else if (stage === 'j3') {
                    const anticipation = getDeadlineAnticipationInfo(nextVignetteDate);
                    title = `⚠️ Rappel J-3 : Vignette (${vehicleName})`;
                    body = `Plus que 3 jours pour régler la Vignette de ${vehicleName} (${anticipation.dueDateFormatted}). ${anticipation.warningText}`;
                } else if (stage === 'j7') {
                    const anticipation = getDeadlineAnticipationInfo(nextVignetteDate);
                    title = `Rappel J-7 : Vignette (${vehicleName})`;
                    body = `Dans 7 jours : échéance de la Vignette pour ${vehicleName} (${anticipation.dueDateFormatted}). ${anticipation.warningText}`;
                } else if (stage === 'j15') {
                    const anticipation = getDeadlineAnticipationInfo(nextVignetteDate);
                    title = `Rappel J-15 : Vignette (${vehicleName})`;
                    body = `Dans 15 jours : prévoyez le règlement de la Vignette pour votre ${vehicleName} (${anticipation.dueDateFormatted}). ${anticipation.warningText}`;
                }

                const targetUrl = `/documents?vehicleId=${vehicleId}`;
                const isUrgent = stage === 'j0';
                const tag = `vignette-${vehicleId}-${stage}-${nextVignetteDate.getFullYear()}`;

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
                        notification: { title, body },
                        data: {
                            url: targetUrl,
                            title,
                            body,
                            type: 'vignette-reminder',
                            vehicleId,
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

            let stageTag: string | null = null;
            let title = '';
            let body = '';
            let isUrgent = false;
            let estimatedDateString: string = '';

            if (kmRemaining <= 0) {
                stageTag = 'overdue';
                isUrgent = true;
                title = `⚠️ Vidange Dépassée : ${vehicleName}`;
                body = `Vous avez dépassé les ${nextDueMileage.toLocaleString('fr-FR')} km prévus pour la vidange (actuel : ${latestEvent.mileage.toLocaleString('fr-FR')} km). Effectuez-la dès que possible ou marquez-la comme faite dans l’application.`;
            } else if (avgKmPerDay) {
                const estimatedDate = estimateVidangeDate(latestEvent.mileage, nextDueMileage, avgKmPerDay);
                if (estimatedDate) {
                    estimatedDateString = formatDateToLocalISO(estimatedDate);
                    const daysRemaining = getDaysRemaining(estimatedDate, today);
                    if (daysRemaining <= 0) {
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
            }

            if (stageTag) {
                const logKey = `vidange_${doc.id}_${stageTag}_${estimatedDateString || nextDueMileage}`;
                const existingLog = await getNotifLog(logKey);

                console.log(`--------------------------------------------------`);
                console.log(`[CRON] Maintenance trouvée: "Vidange" (ID: ${doc.id})`);
                console.log(`[CRON] Véhicule: ${vehicleName}`);
                console.log(`[CRON] Tâche: Vidange`);
                console.log(`[CRON] Due mileage: ${nextDueMileage} km (reste ${kmRemaining} km)`);
                console.log(`[CRON] Stage: ${stageTag}`);

                if (existingLog && existingLog.status === 'sent') {
                    console.log(`[CRON] Notification déjà envoyée: OUI (${logKey})`);
                    continue;
                }

                console.log(`[CRON] Notification déjà envoyée: NON`);
                const tokens = await getUserTokens(userId);
                console.log(`[CRON] Token FCM: ${tokens.length}`);

                if (tokens.length === 0) {
                    console.warn(`[CRON] EN ATTENTE - aucun token FCM pour ${userId}`);
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
                    continue;
                }

                const targetUrl = `/maintenance?vehicleId=${vehicleId}&highlight=${doc.id}`;
                const tag = `vidange-${doc.id}-${stageTag}`;

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
        }

        // =========================================================================
        // SECTION 4: ENVOI FCM MULTICAST & ENREGISTREMENT IDEMPOTENT
        // =========================================================================
        let successCount = 0;
        let failureCount = 0;
        const deadTokensToDelete: string[] = [];

        console.log(`--------------------------------------------------`);
        console.log(`[CRON] Messages prêts à être envoyés: ${messagesToSend.length}`);

        for (const msg of messagesToSend) {
            console.log(`[CRON] Envoi FCM en cours pour: "${msg.task}" (${msg.stage}) → ${msg.tokens.length} token(s)`);
            try {
                const response = await adminMessaging.sendEachForMulticast(msg.payload);
                console.log(`[CRON] Envoi FCM: ${response.successCount > 0 ? 'SUCCESS' : 'FAILED'} (${response.successCount} succès, ${response.failureCount} échecs)`);
                successCount += response.successCount;
                failureCount += response.failureCount;

                if (response.successCount > 0) {
                    // Marquer comme envoyé définitivement dans notificationLogs
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
                    }, { merge: true });
                } else {
                    // Échec temporaire FCM -> marquer comme pending
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

            } catch (err) {
                console.error(`[CRON] Envoi FCM: FAILED avec exception :`, err);
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

        return NextResponse.json({
            success: true,
            executionDate: dateString0,
            messagesPrepared: messagesToSend.length,
            notificationsSent: successCount,
            notificationsFailed: failureCount,
            tokensCleaned: deadTokensToDelete.length,
        });

    } catch (error) {
        console.error('Erreur lors de l\'exécution du Cron Job:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
