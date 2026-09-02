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

        console.log('[CRON] Dates cibles:', { J0: dateString0, J3: dateString3, J7: dateString7, J15: dateString15 });

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

        const messages: any[] = [];
        const processedDocIds = new Set<string>();

        // Tâches qui exigent un justificatif à ajouter dans l'application après paiement.
        const DOCUMENT_TASKS = new Set([
            'Vignette',
            'Paiement Assurance',
            'Assurance',
            'Visite Technique',
            'Contrôle Technique',
            'Carte Grise',
        ]);

        // Regrouper par (vehicleId_task) pour ne garder QUE le document le plus récent.
        // Si l'utilisateur a enregistré un nouvel entretien (ex: payé en avance),
        // c'est ce nouveau document qui devient le seul évalué.
        const latestMaintenanceByVehicleTask = new Map<string, any>();
        maintenanceSnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (!data.vehicleId || !data.task) return;
            const key = `${data.vehicleId}_${data.task}`;
            const existing = latestMaintenanceByVehicleTask.get(key);
            if (!existing) {
                latestMaintenanceByVehicleTask.set(key, doc);
            } else {
                const existingDate = new Date(existing.data().date || 0).getTime();
                const docDate = new Date(data.date || 0).getTime();
                // Priorité à la date la plus récente, ou à la date d'échéance la plus lointaine en cas d'égalité
                if (docDate > existingDate || (docDate === existingDate && (data.nextDueDate || '') > (existing.data().nextDueDate || ''))) {
                    latestMaintenanceByVehicleTask.set(key, doc);
                }
            }
        });

        console.log(`[CRON] Entretiens actifs uniques (par véhicule + tâche) : ${latestMaintenanceByVehicleTask.size}`);

        // 1. Traitement des maintenances standard par date d'échéance
        for (const doc of latestMaintenanceByVehicleTask.values()) {
            const data = doc.data();
            const { userId, vehicleId, task, nextDueDate } = data;
            if (!userId || !nextDueDate) continue;

            // Déterminer l'étape selon nextDueDate
            let stage: 'j0' | 'j3' | 'j7' | 'j15' | 'overdue' | null = null;
            if (nextDueDate === dateString0) stage = 'j0';
            else if (nextDueDate === dateString3) stage = 'j3';
            else if (nextDueDate === dateString7) stage = 'j7';
            else if (nextDueDate === dateString15) stage = 'j15';
            else if (nextDueDate < dateString0) stage = 'overdue';

            if (!stage) continue;

            const uniqueKey = `${doc.id}_${stage}`;
            if (processedDocIds.has(uniqueKey)) continue;
            processedDocIds.add(uniqueKey);

            const vehicle = vehicleId ? vehicleMap.get(vehicleId) : null;
            const vehicleName = vehicle ? `${vehicle.brand} ${vehicle.model}` : 'votre véhicule';

            const tokens = await getUserTokens(userId);
            console.log(`[CRON] 🎯 Candidat trouvé: "${task}" (${vehicleName}) | Étape: ${stage} | nextDueDate: ${nextDueDate} | userId: ${userId} | Tokens FCM: ${tokens.length}`);

            if (tokens.length === 0) {
                console.warn(`[CRON] ⚠️ Aucun token FCM enregistré pour l'utilisateur ${userId} (${vehicleName}). Notification non envoyée.`);
                continue;
            }

            let title = 'Rappel Entretien';
            let body = '';
            const isUrgent = stage === 'j0' || stage === 'overdue';
            const requiresDoc = DOCUMENT_TASKS.has(task);

            if (stage === 'overdue') {
                title = `⚠️ Entretien en retard : ${task} (${vehicleName})`;
                if (requiresDoc) {
                    body = `"${task}" pour ${vehicleName} aurait dû être fait le ${data.nextDueDate}. Payez dès que possible et ajoutez le justificatif dans la section Documents de l’application.`;
                } else {
                    body = `"${task}" pour ${vehicleName} aurait dû être fait le ${data.nextDueDate}. Effectuez-le dès que possible ou marquez-le comme fait avec sa vraie date dans l’application.`;
                }
            } else if (stage === 'j0') {
                title = `🚨 Jour J : ${task} (${vehicleName})`;
                if (requiresDoc) {
                    body = `C’est aujourd’hui la date limite pour "${task}" (${vehicleName}). Après le paiement, pensez à ajouter le reçu ou le document dans la section Documents de l’application.`;
                } else {
                    body = `C'est aujourd'hui la date limite pour "${task}" (${vehicleName}). Après l’entretien, n’oubliez pas de l’enregistrer avec la vraie date dans l’application.`;
                }
            } else if (stage === 'j3') {
                title = `Rappel J-3 : ${task} (${vehicleName})`;
                if (requiresDoc) {
                    body = `Plus que 3 jours pour "${task}" (${vehicleName}). Préparez votre paiement et n’oubliez pas d’enregistrer le justificatif dans l’application.`;
                } else {
                    body = `Dans 3 jours : "${task}" pour ${vehicleName}. Pensez à planifier votre rendez-vous.`;
                }
            } else if (stage === 'j7') {
                title = `Rappel J-7 : ${task} (${vehicleName})`;
                body = `Dans une semaine : "${task}" pour ${vehicleName} arrive à échéance.`;
            } else if (stage === 'j15') {
                title = `Rappel J-15 : ${task} (${vehicleName})`;
                body = `Dans 15 jours : pensez à anticiper l’entretien "${task}" pour votre ${vehicleName}.`;
            }

            const targetUrl = requiresDoc && (stage === 'j0' || stage === 'overdue')
                ? `/documents?vehicleId=${vehicleId || ''}`
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

        // 2. Traitement dynamique des Vignettes (y compris véhicules sans historique)
        const latestVignetteByVehicle = new Map<string, any>();
        maintenanceSnapshot.docs
            .filter(doc => doc.data().task === 'Vignette')
            .forEach(doc => {
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
                            title = `🚨 Jour J : Vignette (${vehicleName})`;
                            body = `Aujourd’hui est la date limite officielle pour le paiement de la Vignette de ${vehicleName}. Après le paiement, ajoutez immédiatement le reçu dans la section « Documents » de l’application.`;
                        } else if (stage === 'j3') {
                            title = `Rappel J-3 : Vignette (${vehicleName})`;
                            body = `Plus que 3 jours pour régler la Vignette de ${vehicleName} (date limite : ${nextVignetteDate.toLocaleDateString('fr-FR')}). Une fois payée, n’oubliez pas d’ajouter le justificatif dans « Documents ».`;
                        } else if (stage === 'j7') {
                            title = `Rappel J-7 : Vignette (${vehicleName})`;
                            body = `Dans 7 jours : échéance de la Vignette pour ${vehicleName} (${nextVignetteDate.toLocaleDateString('fr-FR')}). Préparez votre paiement et gardez le reçu pour l’application.`;
                        } else if (stage === 'j15') {
                            title = `Rappel J-15 : Vignette (${vehicleName})`;
                            body = `Dans 15 jours : prévoyez le règlement de la Vignette pour votre ${vehicleName}. Pensez à ajouter le justificatif dans « Documents » après paiement.`;
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
        // Ne garder que la vidange la plus récente par véhicule pour éviter les fausses alertes
        // sur d'anciens enregistrements dont le nextDueMileage a déjà été dépassé.
        const latestVidangeByVehicle = new Map<string, any>();
        maintenanceSnapshot.docs
            .filter(doc => doc.data().task === 'Vidange' && (doc.data().nextDueMileage || 0) > 0)
            .forEach(doc => {
                const data = doc.data();
                if (data.vehicleId) {
                    const existing = latestVidangeByVehicle.get(data.vehicleId);
                    if (!existing || new Date(data.date).getTime() > new Date(existing.data().date).getTime()) {
                        latestVidangeByVehicle.set(data.vehicleId, doc);
                    }
                }
            });

        const vidangesAvecMileage = Array.from(latestVidangeByVehicle.values());
        if (vidangesAvecMileage.length > 0) {
            for (const doc of vidangesAvecMileage) {
                const data = doc.data();
                const { userId, vehicleId, nextDueMileage } = data;
                if (!userId || !vehicleId || !nextDueMileage) continue;

                // Récupération des derniers pleins, réparations et entretiens pour calculer la moyenne journalière
                // Note: pas d'orderBy pour éviter les index composites Firestore (tri fait en JS)
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

                // Tri en JavaScript (remplace le orderBy Firestore qui nécessitait un index composite)
                allEvents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                const avgKmPerDay = calculateAverageKmPerDay(allEvents);
                const latestEvent = allEvents[0];

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
                    title = `⚠️ Vidange Dépassée : ${vehicleName}`;
                    body = `Vous avez dépassé les ${nextDueMileage.toLocaleString('fr-FR')} km prévus pour la vidange (actuel : ${latestEvent.mileage.toLocaleString('fr-FR')} km). Effectuez-la dès que possible ou marquez-la comme faite avec sa vraie date dans l’application.`;
                } else if (avgKmPerDay) {
                    const estimatedDate = estimateVidangeDate(latestEvent.mileage, nextDueMileage, avgKmPerDay);
                    if (estimatedDate) {
                        const daysRemaining = getDaysRemaining(estimatedDate, today);
                        if (daysRemaining <= 0) {
                            stageTag = 'j0';
                            isUrgent = true;
                            title = `🚨 Jour J : Vidange requise (${vehicleName})`;
                            body = `La vidange est due aujourd'hui selon votre rythme (${formatDateToFrench(estimatedDate)}). Reste ${kmRemaining.toLocaleString('fr-FR')} km. Après l’entretien, enregistrez-le avec la vraie date dans l’application.`;
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
        } // fin if vidangesAvecMileage

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
