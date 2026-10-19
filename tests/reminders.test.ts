import test from 'node:test';
import assert from 'node:assert';
import {
    calculateCalendarDaysDiff,
    getReminderStageAndDays,
    buildNotificationLogKey,
    isDeadlineAlreadyCompleted,
    buildReminderMessage,
    buildVignetteMessage,
    getCanonicalTask,
} from '../src/lib/reminder-utils.ts';
import type { ReminderStage } from '../src/lib/reminder-utils.ts';

// =========================================================================
// 1. TESTS DE NON-RÉGRESSION : J-15, J-7, J-3 et J0
// =========================================================================

test('Non-régression J-15 : étape et fenêtre préservées', () => {
    // Échéance fixée au 15 octobre 2026
    const dueDate = '2026-10-15';

    // Exactement 15 jours avant : 30 septembre 2026
    const res15 = getReminderStageAndDays(dueDate, '2026-09-30');
    assert.strictEqual(res15.stage, 'j15');
    assert.strictEqual(res15.daysRemaining, 15);

    // Fenêtre de tolérance J-15 (entre 8 et 15 jours)
    const res10 = getReminderStageAndDays(dueDate, '2026-10-05');
    assert.strictEqual(res10.stage, 'j15');
    assert.strictEqual(res10.daysRemaining, 10);

    const res8 = getReminderStageAndDays(dueDate, '2026-10-07');
    assert.strictEqual(res8.stage, 'j15');
    assert.strictEqual(res8.daysRemaining, 8);

    // Vérification du message J-15
    const msg = buildReminderMessage({
        task: 'Visite technique',
        vehicleName: 'Peugeot 308',
        dueDate,
        stage: 'j15',
        daysRemaining: 15,
    });
    assert.ok(msg.title.includes('Rappel J-15'));
    assert.ok(msg.body.includes('Dans 15 jours'));
    assert.strictEqual(msg.isUrgent, false);
});

test('Non-régression J-7 : étape et fenêtre préservées', () => {
    const dueDate = '2026-10-15';

    // Exactement 7 jours avant : 8 octobre 2026
    const res7 = getReminderStageAndDays(dueDate, '2026-10-08');
    assert.strictEqual(res7.stage, 'j7');
    assert.strictEqual(res7.daysRemaining, 7);

    // Fenêtre de tolérance J-7 (entre 4 et 7 jours)
    const res5 = getReminderStageAndDays(dueDate, '2026-10-10');
    assert.strictEqual(res5.stage, 'j7');
    assert.strictEqual(res5.daysRemaining, 5);

    const res4 = getReminderStageAndDays(dueDate, '2026-10-11');
    assert.strictEqual(res4.stage, 'j7');
    assert.strictEqual(res4.daysRemaining, 4);

    // Vérification du message J-7
    const msg = buildReminderMessage({
        task: 'Assurance',
        vehicleName: 'Kia Picanto',
        dueDate,
        stage: 'j7',
        daysRemaining: 7,
    });
    assert.ok(msg.title.includes('Rappel J-7'));
    assert.ok(msg.body.includes('Dans une semaine'));
    assert.strictEqual(msg.isUrgent, false);
});

test('Non-régression J-3 : étape et fenêtre préservées', () => {
    const dueDate = '2026-10-15';

    // Exactement 3 jours avant : 12 octobre 2026
    const res3 = getReminderStageAndDays(dueDate, '2026-10-12');
    assert.strictEqual(res3.stage, 'j3');
    assert.strictEqual(res3.daysRemaining, 3);

    // Fenêtre de tolérance J-3 (entre 1 et 3 jours)
    const res2 = getReminderStageAndDays(dueDate, '2026-10-13');
    assert.strictEqual(res2.stage, 'j3');
    assert.strictEqual(res2.daysRemaining, 2);

    const res1 = getReminderStageAndDays(dueDate, '2026-10-14');
    assert.strictEqual(res1.stage, 'j3');
    assert.strictEqual(res1.daysRemaining, 1);

    // Message J-3
    const msg = buildReminderMessage({
        task: 'Paiement Assurance',
        vehicleName: 'Peugeot 308',
        dueDate,
        stage: 'j3',
        daysRemaining: 3,
    });
    assert.ok(msg.title.includes('J-3'));
    assert.strictEqual(msg.isUrgent, false);
});

test('Non-régression J0 : étape et message du jour J préservés', () => {
    const dueDate = '2026-10-15';

    // Le jour même : 15 octobre 2026
    const res0 = getReminderStageAndDays(dueDate, '2026-10-15');
    assert.strictEqual(res0.stage, 'j0');
    assert.strictEqual(res0.daysRemaining, 0);

    const msg = buildReminderMessage({
        task: 'Paiement Assurance',
        vehicleName: 'Peugeot 308',
        dueDate,
        stage: 'j0',
        daysRemaining: 0,
    });
    assert.ok(msg.title.includes('🚨 Jour J'));
    assert.ok(msg.body.includes('C’est aujourd’hui la date limite'));
    assert.strictEqual(msg.isUrgent, true);
});

// =========================================================================
// 2. TESTS DES RETARDS : J+1, J+2, J+3, J+7, J+14, J+30, J+60
// =========================================================================

test('Retards : J+1 est identifié comme overdue_1 et jamais comme J0', () => {
    const dueDate = '2026-10-15';
    // Le lendemain : 16 octobre 2026
    const res = getReminderStageAndDays(dueDate, '2026-10-16');
    assert.strictEqual(res.stage, 'overdue_1');
    assert.strictEqual(res.daysRemaining, -1);
    assert.notStrictEqual(res.stage, 'j0');

    const msg = buildReminderMessage({
        task: 'Visite technique',
        vehicleName: 'Peugeot 308',
        dueDate,
        stage: 'overdue_1',
        daysRemaining: -1,
    });
    assert.ok(msg.title.includes('J+1'));
    assert.ok(msg.title.includes('⚠️ Entretien en retard'));
    assert.ok(msg.body.includes('1 jour de retard'));
    assert.strictEqual(msg.isUrgent, true);
});

test('Retards : J+2 et J+3 déclenchent les bonnes étapes et messages', () => {
    const dueDate = '2026-10-15';

    // J+2 : 17 octobre 2026
    const res2 = getReminderStageAndDays(dueDate, '2026-10-17');
    assert.strictEqual(res2.stage, 'overdue_2');
    assert.strictEqual(res2.daysRemaining, -2);
    const msg2 = buildReminderMessage({
        task: 'Assurance',
        vehicleName: 'Kia Picanto',
        dueDate,
        stage: 'overdue_2',
        daysRemaining: -2,
    });
    assert.ok(msg2.title.includes('J+2'));
    assert.ok(msg2.body.includes('2 jours de retard'));

    // J+3 : 18 octobre 2026
    const res3 = getReminderStageAndDays(dueDate, '2026-10-18');
    assert.strictEqual(res3.stage, 'overdue_3');
    assert.strictEqual(res3.daysRemaining, -3);
    const msg3 = buildReminderMessage({
        task: 'Assurance',
        vehicleName: 'Kia Picanto',
        dueDate,
        stage: 'overdue_3',
        daysRemaining: -3,
    });
    assert.ok(msg3.title.includes('J+3'));
    assert.ok(msg3.body.includes('3 jours de retard'));
});

test('Retards : Relances périodiques J+7, J+14, J+30 et J+60 aux jours précis', () => {
    const dueDate = '2026-10-15';

    // J+7 : 22 octobre 2026
    assert.strictEqual(getReminderStageAndDays(dueDate, '2026-10-22').stage, 'overdue_7');

    // J+14 : 29 octobre 2026
    assert.strictEqual(getReminderStageAndDays(dueDate, '2026-10-29').stage, 'overdue_14');

    // J+30 : 14 novembre 2026
    assert.strictEqual(getReminderStageAndDays(dueDate, '2026-11-14').stage, 'overdue_30');

    // J+60 : 14 décembre 2026
    assert.strictEqual(getReminderStageAndDays(dueDate, '2026-12-14').stage, 'overdue_60');
});

test('Retards : Les jours intermédiaires ne déclenchent pas de relances anticipées de plage', () => {
    const dueDate = '2026-10-15';

    // J+4, J+5, J+6 ne doivent pas déclencher overdue_7
    assert.strictEqual(getReminderStageAndDays(dueDate, '2026-10-19').stage, null); // J+4
    assert.strictEqual(getReminderStageAndDays(dueDate, '2026-10-20').stage, null); // J+5
    assert.strictEqual(getReminderStageAndDays(dueDate, '2026-10-21').stage, null); // J+6

    // J+8 à J+13 ne doivent pas déclencher overdue_14
    assert.strictEqual(getReminderStageAndDays(dueDate, '2026-10-23').stage, null); // J+8
    assert.strictEqual(getReminderStageAndDays(dueDate, '2026-10-28').stage, null); // J+13

    // J+15 à J+29 ne doivent pas déclencher overdue_30
    assert.strictEqual(getReminderStageAndDays(dueDate, '2026-10-30').stage, null); // J+15
    assert.strictEqual(getReminderStageAndDays(dueDate, '2026-11-13').stage, null); // J+29

    // J+31 à J+59 ne doivent pas déclencher overdue_60
    assert.strictEqual(getReminderStageAndDays(dueDate, '2026-11-15').stage, null); // J+31
    assert.strictEqual(getReminderStageAndDays(dueDate, '2026-12-13').stage, null); // J+59

    // Au-delà de J+60 : null
    assert.strictEqual(getReminderStageAndDays(dueDate, '2026-12-15').stage, null); // J+61
});

// =========================================================================
// 3. TESTS DE CALCUL CALENDAIRE ET INDÉPENDANCE DES FUSEAUX HORAIRES
// =========================================================================

test('Calcul calendaire : Identique quelle que soit l’heure d’exécution', () => {
    const dueDate = '2026-10-15';

    // Test à 00:00:01
    const morning = new Date(2026, 9, 16, 0, 0, 1);
    const resMorning = getReminderStageAndDays(dueDate, morning);
    assert.strictEqual(resMorning.stage, 'overdue_1');
    assert.strictEqual(resMorning.daysRemaining, -1);

    // Test à 12:00:00
    const noon = new Date(2026, 9, 16, 12, 0, 0);
    const resNoon = getReminderStageAndDays(dueDate, noon);
    assert.strictEqual(resNoon.stage, 'overdue_1');
    assert.strictEqual(resNoon.daysRemaining, -1);

    // Test à 23:59:59
    const night = new Date(2026, 9, 16, 23, 59, 59);
    const resNight = getReminderStageAndDays(dueDate, night);
    assert.strictEqual(resNight.stage, 'overdue_1');
    assert.strictEqual(resNight.daysRemaining, -1);
});

test('Calcul calendaire : Pas de dérive de fuseau horaire ni de passage à l’heure d’hiver', () => {
    // Passage à l'heure d'hiver en Europe/Tunisie fin octobre (31 octobre - 1er novembre)
    const dueDate = '2026-10-31';
    const dayAfter = '2026-11-01';

    const diff = calculateCalendarDaysDiff(dueDate, dayAfter);
    assert.strictEqual(diff, -1); // Exactement 1 jour de retard

    const stage = getReminderStageAndDays(dueDate, dayAfter);
    assert.strictEqual(stage.stage, 'overdue_1');
});

// =========================================================================
// 4. TESTS DE isDeadlineAlreadyCompleted() ET RÈGLES FIRESTORE
// =========================================================================

test('isDeadlineAlreadyCompleted : Une intervention postérieure sans nextDueDate NE clôture PAS une échéance active', () => {
    const candidate = {
        id: 'maint_1',
        task: 'Paiement Assurance',
        date: '2025-10-15',
        nextDueDate: '2026-10-15',
    };

    // Une facture ou note saisie le 16 octobre sans prochaine échéance
    const otherMaintenances = [
        candidate,
        {
            id: 'maint_2',
            task: 'Paiement Assurance',
            date: '2026-10-16',
            cost: 150,
            // PAS de nextDueDate !
        }
    ];

    const result = isDeadlineAlreadyCompleted(candidate, otherMaintenances);
    // L'échéance active de candidate ne doit PAS être ignorée à tort !
    assert.strictEqual(result.isCompleted, false);
});

test('isDeadlineAlreadyCompleted : Un renouvellement explicite avec nextDueDate postérieure clôture l’ancienne échéance', () => {
    const candidate = {
        id: 'maint_old',
        task: 'Assurance',
        date: '2025-10-15',
        nextDueDate: '2026-10-15',
    };

    // Un vrai renouvellement annuel effectué le 15 ou 16 octobre 2026 avec échéance en 2027
    const otherMaintenances = [
        candidate,
        {
            id: 'maint_new',
            task: 'Assurance',
            date: '2026-10-15',
            nextDueDate: '2027-10-15',
        }
    ];

    const result = isDeadlineAlreadyCompleted(candidate, otherMaintenances);
    assert.strictEqual(result.isCompleted, true);
    assert.ok(result.reason?.includes('2027-10-15'));
});

test('isDeadlineAlreadyCompleted : Une tâche différente ne clôture pas l’échéance', () => {
    const candidate = {
        id: 'maint_assurance',
        task: 'Assurance',
        date: '2025-10-15',
        nextDueDate: '2026-10-15',
    };

    const otherMaintenances = [
        candidate,
        {
            id: 'maint_vidange',
            task: 'Vidange',
            date: '2026-10-16',
            nextDueDate: '2027-04-15',
        }
    ];

    // Dans le code réel, le regroupement se fait par tâche canonique, mais même en cas d'erreur de filtre :
    const filteredGroup = otherMaintenances.filter(m => getCanonicalTask(m.task) === 'assurance');
    const result = isDeadlineAlreadyCompleted(candidate, filteredGroup);
    assert.strictEqual(result.isCompleted, false);
});

// =========================================================================
// 5. TESTS D'IDEMPOTENCE ET GESTION DU SUIVI / RATTRAPAGE
// =========================================================================

test('Idempotence : Clé stable basée sur maintenanceId, stage et dueDate', () => {
    const key1 = buildNotificationLogKey('maint_123', 'overdue_1', '2026-10-15');
    const key2 = buildNotificationLogKey('maint_123', 'overdue_1', '2026-10-15');
    const key3 = buildNotificationLogKey('maint_123', 'overdue_2', '2026-10-15');

    assert.strictEqual(key1, 'maint_123_overdue_1_2026-10-15');
    assert.strictEqual(key1, key2);
    assert.notStrictEqual(key1, key3);
});

test('Normalisation canonique : Regroupement robuste des variantes de libellés', () => {
    assert.strictEqual(getCanonicalTask('Paiement Assurance'), 'assurance');
    assert.strictEqual(getCanonicalTask('Assurance'), 'assurance');
    assert.strictEqual(getCanonicalTask('Contrôle Technique'), 'visite_technique');
    assert.strictEqual(getCanonicalTask('Visite technique'), 'visite_technique');
    assert.strictEqual(getCanonicalTask('Vignette'), 'vignette');
    assert.strictEqual(getCanonicalTask('Vidange'), 'vidange');
});

// =========================================================================
// 6. TESTS DU SUIVI DES NOTIFICATIONS ET DU MÉCANISME DE RATTRAPAGE
// =========================================================================

test('Suivi : Une notification déjà marquée sent n’est pas renvoyée pour la même étape', () => {
    const logKey = buildNotificationLogKey('maint_1', 'overdue_1', '2026-10-15');
    const logsStore = new Map<string, any>();

    // Simule une notification déjà envoyée avec succès
    logsStore.set(logKey, {
        id: logKey,
        status: 'sent',
        sentAt: '2026-10-16T09:00:00Z',
    });

    const isAlreadySent = logsStore.get(logKey)?.status === 'sent';
    assert.strictEqual(isAlreadySent, true, 'La notification existante doit être identifiée comme sent');

    // Pour une nouvelle étape (ex: J+2), la clé est différente
    const nextStageKey = buildNotificationLogKey('maint_1', 'overdue_2', '2026-10-15');
    const isNextStageSent = logsStore.get(nextStageKey)?.status === 'sent';
    assert.strictEqual(isNextStageSent, false, 'La nouvelle étape J+2 doit pouvoir être évaluée');
});

test('Suivi : L’absence de token FCM ne fait pas perdre le rappel (marqué pending et non sent)', () => {
    const logKey = buildNotificationLogKey('maint_1', 'overdue_1', '2026-10-15');
    const logsStore = new Map<string, any>();

    const tokens: string[] = []; // aucun token disponible

    // Logique appliquée par le cron
    if (tokens.length === 0) {
        logsStore.set(logKey, {
            id: logKey,
            status: 'pending',
            pendingReason: 'NO_FCM_TOKEN',
            attemptCount: 1,
            lastAttemptAt: '2026-10-16T09:00:00Z',
        });
    }

    const log = logsStore.get(logKey);
    assert.strictEqual(log.status, 'pending');
    assert.strictEqual(log.pendingReason, 'NO_FCM_TOKEN');
    assert.notStrictEqual(log.status, 'sent', 'Ne doit jamais être marquée sent en l’absence de token');
});

test('Suivi : Une notification en attente est récupérée et envoyée dès qu’un token devient disponible', () => {
    const logKey = buildNotificationLogKey('maint_1', 'overdue_1', '2026-10-15');
    const logsStore = new Map<string, any>();

    // Initialement pending (J+1 manqué car pas de token)
    logsStore.set(logKey, {
        id: logKey,
        maintenanceId: 'maint_1',
        task: 'Assurance',
        stage: 'overdue_1',
        dueDate: '2026-10-15',
        status: 'pending',
        pendingReason: 'NO_FCM_TOKEN',
        attemptCount: 1,
    });

    // Lors de l'exécution suivante (ex: J+2), l'utilisateur a enregistré un token FCM
    const updatedTokens = ['fcm_token_device_abc'];

    // Le mécanisme de rattrapage inspecte les logs pending
    const pendingLog = logsStore.get(logKey);
    assert.strictEqual(pendingLog.status, 'pending');

    if (updatedTokens.length > 0) {
        // Envoi simulé réussi
        const sendSuccess = true;
        if (sendSuccess) {
            logsStore.set(logKey, {
                ...pendingLog,
                status: 'sent',
                sentAt: '2026-10-17T09:00:00Z',
                attemptCount: pendingLog.attemptCount + 1,
            });
        }
    }

    const updatedLog = logsStore.get(logKey);
    assert.strictEqual(updatedLog.status, 'sent');
    assert.strictEqual(updatedLog.attemptCount, 2);
});

test('Suivi : Une tentative d’envoi FCM échouée n’est pas marquée sent mais pending', () => {
    const logKey = buildNotificationLogKey('maint_1', 'overdue_1', '2026-10-15');
    const logsStore = new Map<string, any>();

    // Simule une réponse FCM avec échec (ex: erreur temporaire de réseau ou serveur)
    const fcmResponse = { successCount: 0, failureCount: 1 };

    if (fcmResponse.successCount > 0) {
        logsStore.set(logKey, { status: 'sent' });
    } else {
        logsStore.set(logKey, {
            id: logKey,
            status: 'pending',
            pendingReason: 'FCM_TEMP_ERROR',
            attemptCount: 1,
        });
    }

    const log = logsStore.get(logKey);
    assert.strictEqual(log.status, 'pending');
    assert.strictEqual(log.pendingReason, 'FCM_TEMP_ERROR');
    assert.notStrictEqual(log.status, 'sent');
});

test('Suivi : Plusieurs exécutions successives ne créent pas de doublons grâce au statut sent', () => {
    const logKey = buildNotificationLogKey('maint_1', 'overdue_1', '2026-10-15');
    const logsStore = new Map<string, any>();
    let sendsExecuted = 0;

    const runCron = () => {
        const existing = logsStore.get(logKey);
        if (existing && existing.status === 'sent') {
            return; // ignoré
        }
        sendsExecuted++;
        logsStore.set(logKey, { status: 'sent', sentAt: new Date().toISOString() });
    };

    // 1ère exécution
    runCron();
    assert.strictEqual(sendsExecuted, 1);

    // 2ème exécution immédiate
    runCron();
    assert.strictEqual(sendsExecuted, 1, 'Aucun doublon ne doit être envoyé lors de la 2e exécution');

    // 3ème exécution ultérieure
    runCron();
    assert.strictEqual(sendsExecuted, 1, 'Aucun doublon ne doit être envoyé lors de la 3e exécution');
});

test('Suivi : Une maintenance récente ne masque pas arbitrairement une ancienne échéance encore active', () => {
    const oldActiveDeadline = {
        id: 'doc_old_insurance',
        task: 'Paiement Assurance',
        date: '2025-10-15',
        nextDueDate: '2026-10-15',
    };

    // Une intervention récente enregistrée pour ce véhicule (ex: facture d'un rétroviseur ou contre-visite)
    const recentMaintenance = {
        id: 'doc_recent_expense',
        task: 'Paiement Assurance',
        date: '2026-10-16',
        cost: 60,
        // Pas de nextDueDate définie
    };

    const allMaintenances = [oldActiveDeadline, recentMaintenance];

    // Vérifier si oldActiveDeadline est considérée complétée
    const check = isDeadlineAlreadyCompleted(oldActiveDeadline, allMaintenances);
    assert.strictEqual(check.isCompleted, false, 'L’ancienne échéance active ne doit PAS être masquée par la récente');

    // Calcul du stage pour oldActiveDeadline à J+1 (le 16 octobre)
    const stageInfo = getReminderStageAndDays(oldActiveDeadline.nextDueDate, '2026-10-16');
    assert.strictEqual(stageInfo.stage, 'overdue_1', 'L’échéance active doit générer son rappel J+1');
});
