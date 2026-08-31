import { NextResponse } from 'next/server';
import { adminDb, adminMessaging } from '@/lib/firebase-admin';
import { calculateNextVignetteDate, formatDateToLocalISO, getCorrectVignetteDeadline } from '@/lib/vignette';
import { calculateAverageKmPerDay, estimateVidangeDate, formatDateToFrench, getDaysRemaining } from '@/lib/vidange';

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
        // Vercel envoie aussi ce header sur les Cron Jobs
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

        // Date pour J-3
        const date3 = new Date(today);
        date3.setDate(date3.getDate() + 3);
        const dateString3 = formatDateToLocalISO(date3);

        // Date pour J-7
        const date7 = new Date(today);
        date7.setDate(date7.getDate() + 7);
        const dateString7 = formatDateToLocalISO(date7);

        // Date pour J-15
        const date15 = new Date(today);
        date15.setDate(date15.getDate() + 15);
        const dateString15 = formatDateToLocalISO(date15);

        // Limite pour les échéances dépassées (jusqu'à 14 jours en arrière)
        const dateOverdueCutoff = new Date(today);
        dateOverdueCutoff.setDate(dateOverdueCutoff.getDate() - 14);
        const dateStringOverdueCutoff = formatDateToLocalISO(dateOverdueCutoff);

        console.log('[CRON] Dates cibles:', { J0: dateString0, J3: dateString3, J7: dateString7, J15: dateString15, overdueCutoff: dateStringOverdueCutoff });

        // 1. Récupération des maintenances avec échéances exactes
        const [
            snapshot0,
            snapshot3,
            snapshot7,
            snapshot15,
            snapshotOverdue,
            snapshotVignettes,
            snapshotVidanges,
            vehiclesSnapshot
        ] = await Promise.all([
            adminDb.collection('maintenance').where('nextDueDate', '==', dateString0).get(),
            adminDb.collection('maintenance').where('nextDueDate', '==', dateString3).get(),
            adminDb.collection('maintenance').where('nextDueDate', '==', dateString7).get(),
            adminDb.collection('maintenance').where('nextDueDate', '==', dateString15).get(),
            adminDb.collection('maintenance')
                .where('nextDueDate', '<', dateString0)
                .where('nextDueDate', '>=', dateStringOverdueCutoff)
                .get(),
            adminDb.collection('maintenance').where('task', '==', 'Vignette').get(),
            adminDb.collection('maintenance').where('task', '==', 'Vidange').where('nextDueMileage', '>', 0).get(),
            adminDb.collection('vehicles').get()
        ]);

        console.log('[CRON] Résultats Firestore:', {
            j0: snapshot0.size,
            j3: snapshot3.size,
            j7: snapshot7.size,
            j15: snapshot15.size,
            overdue: snapshotOverdue.size,
            vignettes: snapshotVignettes.size,
            vidanges: snapshotVidanges.size,
            vehicles: vehiclesSnapshot.size,
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

        const messages: any[] = [];
        const processedDocIds = new Set<string>();

        // Fonction d'aide pour générer et formater les messages de rappel
        const processDocs = async (docs: any[], stage: 'j0' | 'j3' | 'j7' | 'j15' | 'overdue', daysRemaining: number) => {
            for (const doc of docs) {
                const uniqueKey = `${doc.id}_${stage}`;
                if (processedDocIds.has(uniqueKey)) continue;
                processedDocIds.add(uniqueKey);

                const data = doc.data();
                const { userId, vehicleId, task } = data;
                if (!userId) continue;

                const vehicle = vehicleId ? vehicleMap.get(vehicleId) : null;
                const vehicleName = vehicle ? `${vehicle.brand} ${vehicle.model}` : 'votre véhicule';

                const tokens = await getUserTokens(userId);
                if (tokens.length === 0) continue;

                let title = 'Rappel Entretien';
                let body = '';
                const isUrgent = stage === 'j0' || stage === 'overdue';

                if (stage === 'overdue') {
                    title = `⚠️ Échéance Dépassée : ${task}`;
                    body = `L'entretien "${task}" pour ${vehicleName} est en retard (prévu le ${data.nextDueDate}). Pensez à l'effectuer rapidement !`;
                } else if (stage === 'j0') {
                    title = `🚨 Jour J : ${task} (${vehicleName})`;
                    body = `C'est aujourd'hui la date limite pour "${task}" (${vehicleName}). N'oubliez pas d'enregistrer votre document après l'entretien.`;
                } else if (stage === 'j3') {
                    title = `Rappel J-3 : ${task} (${vehicleName})`;
                    body = `Dans 3 jours : "${task}" pour ${vehicleName}. Pensez à planifier votre rendez-vous.`;
                } else if (stage === 'j7') {
                    title = `Rappel J-7 : ${task} (${vehicleName})`;
                    body = `Dans une semaine : "${task}" pour ${vehicleName} arrive à échéance.`;
                } else if (stage === 'j15') {
                    title = `Rappel J-15 : ${task} (${vehicleName})`;
                    body = `Dans 15 jours : pensez à anticiper l'entretien "${task}" pour votre ${vehicleName}.`;
                }

                const targetUrl = isUrgent
                    ? `/maintenance?vehicleId=${vehicleId || ''}`
                    : `/maintenance?vehicleId=${vehicleId || ''}`;
                const tag = `carcare-task-${doc.id}-${stage}`;

                messages.push({
                    tokens,
                    notification: {
                        title,
                        body,
                    },
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
                            data: {
                                url: targetUrl,
                                tag,
                            }
                        },
                        fcmOptions: {
                            link: targetUrl
                        }
                    }
                });
            }
        };

        // Traitement des dates standard
        if (!snapshotOverdue.empty) await processDocs(snapshotOverdue.docs, 'overdue', -1);
        if (!snapshot0.empty) await processDocs(snapshot0.docs, 'j0', 0);
        if (!snapshot3.empty) await processDocs(snapshot3.docs, 'j3', 3);
        if (!snapshot7.empty) await processDocs(snapshot7.docs, 'j7', 7);
        if (!snapshot15.empty) await processDocs(snapshot15.docs, 'j15', 15);

        // 2. Traitement dynamique des Vignettes (y compris véhicules sans historique)
        const latestVignetteByVehicle = new Map<string, any>();
        snapshotVignettes.docs.forEach(doc => {
            const data = doc.data();
            if (data.vehicleId) {
                const existing = latestVignetteByVehicle.get(data.vehicleId);
                if (!existing || new Date(data.date).getTime() > new Date(existing.data().date).getTime()) {
                    latestVignetteByVehicle.set(data.vehicleId, doc);
                }
            }
        });

        // Analyse de chaque véhicule pour la vignette
        for (const [vehicleId, vehicle] of vehicleMap.entries()) {
            if (!vehicle.licensePlate || !vehicle.userId) continue;

            const existingVignetteDoc = latestVignetteByVehicle.get(vehicleId);
            let nextVignetteDate: Date;

            if (existingVignetteDoc) {
                const data = existingVignetteDoc.data();
                if (data.date) {
                    nextVignetteDate = calculateNextVignetteDate(vehicle.licensePlate, new Date(data.date));
                    if (nextVignetteDate < today) {
                        nextVignetteDate = getCorrectVignetteDeadline(vehicle.licensePlate, today);
                    }
                } else {
                    nextVignetteDate = getCorrectVignetteDeadline(vehicle.licensePlate, today);
                }
            } else {
                nextVignetteDate = getCorrectVignetteDeadline(vehicle.licensePlate, today);
            }

            const daysRemaining = Math.ceil((nextVignetteDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            const calculatedString = formatDateToLocalISO(nextVignetteDate);

            let stage: 'j0' | 'j3' | 'j7' | 'j15' | null = null;
            if (calculatedString === dateString0 || daysRemaining === 0) stage = 'j0';
            else if (calculatedString === dateString3 || daysRemaining === 3) stage = 'j3';
            else if (calculatedString === dateString7 || daysRemaining === 7) stage = 'j7';
            else if (calculatedString === dateString15 || daysRemaining === 15) stage = 'j15';

            if (stage) {
                const virtualId = existingVignetteDoc ? existingVignetteDoc.id : `synthetic-vignette-${vehicleId}`;
                const uniqueKey = `${virtualId}_${stage}`;

                if (!processedDocIds.has(uniqueKey)) {
                    processedDocIds.add(uniqueKey);
                    const tokens = await getUserTokens(vehicle.userId);

                    if (tokens.length > 0) {
                        const vehicleName = `${vehicle.brand} ${vehicle.model}`;
                        let title = `Rappel Vignette (${vehicleName})`;
                        let body = `La date limite de la vignette (${nextVignetteDate.toLocaleDateString('fr-FR')}) approche pour ${vehicleName}.`;

                        if (stage === 'j0') {
                            title = `🚨 Jour J : Vignette (${vehicleName})`;
                            body = `Aujourd'hui est la date limite officielle pour le paiement de la Vignette (${vehicleName}). N'oubliez pas d'ajouter le reçu dans "Documents".`;
                        } else if (stage === 'j3') {
                            title = `Rappel J-3 : Vignette (${vehicleName})`;
                            body = `Plus que 3 jours pour régler la Vignette de ${vehicleName} (date limite: ${nextVignetteDate.toLocaleDateString('fr-FR')}).`;
                        } else if (stage === 'j7') {
                            title = `Rappel J-7 : Vignette (${vehicleName})`;
                            body = `Dans 7 jours : échéance de la Vignette pour ${vehicleName} (${nextVignetteDate.toLocaleDateString('fr-FR')}).`;
                        } else if (stage === 'j15') {
                            title = `Rappel J-15 : Vignette (${vehicleName})`;
                            body = `Dans 15 jours : prévoyez le règlement de la Vignette pour votre ${vehicleName}.`;
                        }

                        const targetUrl = `/documents?vehicleId=${vehicleId}`;
                        const isUrgent = stage === 'j0';
                        const tag = `vignette-${vehicleId}-${stage}-${nextVignetteDate.getFullYear()}`;

                        messages.push({
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
                                    data: {
                                        url: targetUrl,
                                        tag
                                    }
                                },
                                fcmOptions: {
                                    link: targetUrl
                                }
                            }
                        });
                    }
                }
            }
        }

        // 3. Traitement dynamique des Vidanges selon le kilométrage estimé
        if (!snapshotVidanges.empty) {
            for (const doc of snapshotVidanges.docs) {
                const data = doc.data();
                const { userId, vehicleId, nextDueMileage } = data;
                if (!userId || !vehicleId || !nextDueMileage) continue;

                // Récupération des derniers pleins, réparations et entretiens pour calculer la moyenne journalière
                const [fuelLogsSnapshot, repairsSnapshot, maintenanceSnapshot] = await Promise.all([
                    adminDb.collection('fuelLogs').where('vehicleId', '==', vehicleId).orderBy('date', 'desc').limit(10).get(),
                    adminDb.collection('repairs').where('vehicleId', '==', vehicleId).orderBy('date', 'desc').limit(5).get(),
                    adminDb.collection('maintenance').where('vehicleId', '==', vehicleId).orderBy('date', 'desc').limit(5).get()
                ]);

                const allEvents: { date: string; mileage: number }[] = [
                    ...fuelLogsSnapshot.docs.map(d => d.data() as { date: string; mileage: number }),
                    ...repairsSnapshot.docs.map(d => d.data() as { date: string; mileage: number }),
                    ...maintenanceSnapshot.docs.map(d => d.data() as { date: string; mileage: number })
                ].filter(e => typeof e.mileage === 'number' && e.mileage > 0 && Boolean(e.date));

                const avgKmPerDay = calculateAverageKmPerDay(allEvents);
                const latestEvent = allEvents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

                if (!latestEvent) continue;

                const kmRemaining = nextDueMileage - latestEvent.mileage;
                const vehicle = vehicleMap.get(vehicleId);
                const vehicleName = vehicle ? `${vehicle.brand} ${vehicle.model}` : 'votre véhicule';
                const tokens = await getUserTokens(userId);
                if (tokens.length === 0) continue;

                let stageTag: string | null = null;
                let title = '';
                let body = '';
                let isUrgent = false;

                if (kmRemaining <= 0) {
                    stageTag = 'overdue';
                    isUrgent = true;
                    title = `⚠️ Vidange Dépacée : ${vehicleName}`;
                    body = `Kilométrage prévu (${nextDueMileage.toLocaleString('fr-FR')} km) dépassé ! Kilométrage actuel: ${latestEvent.mileage.toLocaleString('fr-FR')} km.`;
                } else if (avgKmPerDay) {
                    const estimatedDate = estimateVidangeDate(latestEvent.mileage, nextDueMileage, avgKmPerDay);
                    if (estimatedDate) {
                        const daysRemaining = getDaysRemaining(estimatedDate, today);
                        if (daysRemaining <= 0) {
                            stageTag = 'j0';
                            isUrgent = true;
                            title = `🚨 Jour J : Vidange requise (${vehicleName})`;
                            body = `Vidange due maintenant (${formatDateToFrench(estimatedDate)}). Reste ${kmRemaining.toLocaleString('fr-FR')} km.`;
                        } else if (daysRemaining === 3) {
                            stageTag = 'j3';
                            title = `Rappel J-3 : Vidange (${vehicleName})`;
                            body = `Vidange estimée dans 3 jours (${formatDateToFrench(estimatedDate)}). Reste ${kmRemaining.toLocaleString('fr-FR')} km.`;
                        } else if (daysRemaining === 7) {
                            stageTag = 'j7';
                            title = `Rappel J-7 : Vidange (${vehicleName})`;
                            body = `Vidange estimée dans 7 jours (${formatDateToFrench(estimatedDate)}). Reste ${kmRemaining.toLocaleString('fr-FR')} km.`;
                        } else if (daysRemaining === 15) {
                            stageTag = 'j15';
                            title = `Rappel J-15 : Vidange (${vehicleName})`;
                            body = `Vidange prévue dans environ 15 jours (${formatDateToFrench(estimatedDate)}). Reste ${kmRemaining.toLocaleString('fr-FR')} km.`;
                        }
                    }
                } else if (kmRemaining <= 500) {
                    stageTag = 'imminent';
                    title = `Vidange Proche : ${vehicleName}`;
                    body = `Plus que ${kmRemaining.toLocaleString('fr-FR')} km avant l'échéance de vidange (${nextDueMileage.toLocaleString('fr-FR')} km).`;
                }

                if (stageTag) {
                    const uniqueKey = `vidange_${doc.id}_${stageTag}`;
                    if (!processedDocIds.has(uniqueKey)) {
                        processedDocIds.add(uniqueKey);
                        const targetUrl = `/maintenance?vehicleId=${vehicleId}&highlight=${doc.id}`;
                        const tag = `vidange-${doc.id}-${stageTag}`;

                        messages.push({
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
                                    data: {
                                        url: targetUrl,
                                        tag
                                    }
                                },
                                fcmOptions: {
                                    link: targetUrl
                                }
                            }
                        });
                    }
                }
            }
        }

        let successCount = 0;
        let failureCount = 0;
        const deadTokensToDelete: string[] = [];

        console.log(`[CRON] Messages à envoyer: ${messages.length}`);

        // 4. Envoi des messages Multicast par batch
        for (const message of messages) {
            if (message.tokens && message.tokens.length > 0) {
                console.log(`[CRON] Envoi FCM: "${message.notification?.title}" → ${message.tokens.length} token(s)`);
                try {
                    const response = await adminMessaging.sendEachForMulticast(message);
                    console.log(`[CRON] FCM résultat: ${response.successCount} succès, ${response.failureCount} échecs`);
                    successCount += response.successCount;
                    failureCount += response.failureCount;

                    // Détection des tokens expirés ou non enregistrés pour nettoyage
                    response.responses.forEach((resp, idx) => {
                        if (!resp.success && resp.error) {
                            const errCode = resp.error.code;
                            if (
                                errCode === 'messaging/registration-token-not-registered' ||
                                errCode === 'messaging/invalid-registration-token' ||
                                errCode === 'messaging/invalid-argument'
                            ) {
                                deadTokensToDelete.push(message.tokens[idx]);
                            }
                        }
                    });
                } catch (err) {
                    console.error('Erreur lors de l\'envoi FCM Multicast :', err);
                    failureCount += message.tokens.length;
                }
            }
        }

        // 5. Nettoyage asynchrone des tokens morts
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
            targets: {
                "Overdue": `until ${dateString0}`,
                "J0": dateString0,
                "J-3": dateString3,
                "J-7": dateString7,
                "J-15": dateString15
            },
            messagesPrepared: messages.length,
            notificationsSent: successCount,
            notificationsFailed: failureCount,
            tokensCleaned: deadTokensToDelete.length
        });

    } catch (error) {
        console.error('Erreur lors de l\'exécution du Cron Job:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
