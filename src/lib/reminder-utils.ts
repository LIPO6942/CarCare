import { getDeadlineAnticipationInfo } from './tunisia-holidays.ts';

export type ReminderStage =
    | 'j0'
    | 'j3'
    | 'j7'
    | 'j15'
    | 'overdue_1'
    | 'overdue_2'
    | 'overdue_3'
    | 'overdue_7'
    | 'overdue_14'
    | 'overdue_30'
    | 'overdue_60'
    | null;

export const OVERDUE_TARGET_DAYS = [1, 2, 3, 7, 14, 30, 60] as const;

export const DOCUMENT_TASKS = new Set([
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

/**
 * Normalisation canonique des tâches pour regrouper les variantes de libellés.
 */
export function getCanonicalTask(task: string): 'assurance' | 'visite_technique' | 'vignette' | 'vidange' | string {
    if (!task) return '';
    const clean = task.trim().toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // suppression des accents
    if (clean.includes('assurance')) return 'assurance';
    if (clean.includes('visite') || clean.includes('controle')) return 'visite_technique';
    if (clean.includes('vignette')) return 'vignette';
    if (clean.includes('vidange')) return 'vidange';
    return clean;
}

/**
 * Vérifie si une tâche requiert la fourniture d'un document justificatif.
 */
export function isDocumentTask(task: string): boolean {
    return DOCUMENT_TASKS.has(task) || DOCUMENT_TASKS.has(getCanonicalTask(task));
}

/**
 * Calcule la différence en jours calendaires stricts entre une date d'échéance ("YYYY-MM-DD")
 * et une date de référence (Date ou "YYYY-MM-DD").
 * 
 * Utilise Date.UTC(...) pour éliminer tout effet de fuseau horaire, d'heure locale,
 * et d'heure d'été/hiver (DST).
 * 
 * Résultat :
 * - diffDays > 0 : l'échéance est dans le futur (ex: +3 pour J-3).
 * - diffDays === 0 : aujourd'hui est le jour J (J0).
 * - diffDays < 0 : l'échéance est passée (ex: -1 pour J+1, -2 pour J+2).
 */
export function calculateCalendarDaysDiff(dueDateInput: string | Date, referenceDateInput: string | Date = new Date()): number {
    let dueY: number, dueM: number, dueD: number;
    let refY: number, refM: number, refD: number;

    if (typeof dueDateInput === 'string') {
        const clean = dueDateInput.split('T')[0];
        const parts = clean.split('-').map(Number);
        if (parts.length < 3 || parts.some(isNaN)) return 0;
        [dueY, dueM, dueD] = parts;
    } else {
        dueY = dueDateInput.getFullYear();
        dueM = dueDateInput.getMonth() + 1;
        dueD = dueDateInput.getDate();
    }

    if (typeof referenceDateInput === 'string') {
        const clean = referenceDateInput.split('T')[0];
        const parts = clean.split('-').map(Number);
        if (parts.length < 3 || parts.some(isNaN)) return 0;
        [refY, refM, refD] = parts;
    } else {
        refY = referenceDateInput.getFullYear();
        refM = referenceDateInput.getMonth() + 1;
        refD = referenceDateInput.getDate();
    }

    const utcDue = Date.UTC(dueY, dueM - 1, dueD);
    const utcRef = Date.UTC(refY, refM - 1, refD);

    return Math.round((utcDue - utcRef) / (1000 * 60 * 60 * 24));
}

/**
 * Détermine l'étape de rappel (stage) et le nombre de jours restants / de retard.
 * 
 * RÈGLES STRICTES :
 * - Notifications anticipées (J-15, J-7, J-3) et J0 :
 *   Préservées à l'identique avec tolérance d'exécution manquée pour ne jamais rater une échéance.
 * - Notifications de retard (overdue) :
 *   Déclenchées UNIQUEMENT sur les jours cibles précis :
 *   J+1 (diffDays === -1)
 *   J+2 (diffDays === -2)
 *   J+3 (diffDays === -3)
 *   J+7 (diffDays === -7)
 *   J+14 (diffDays === -14)
 *   J+30 (diffDays === -30)
 *   J+60 (diffDays === -60)
 *   Les jours intermédiaires (J+4, J+5, J+6...) retournent stage: null.
 */
export function getReminderStageAndDays(dueDateStr: string, referenceDate: string | Date = new Date()): { stage: ReminderStage; daysRemaining: number } {
    if (!dueDateStr) {
        return { stage: null, daysRemaining: 0 };
    }

    const diffDays = calculateCalendarDaysDiff(dueDateStr, referenceDate);

    // 1. Jour J
    if (diffDays === 0) {
        return { stage: 'j0', daysRemaining: 0 };
    }

    // 2. Notifications anticipées (comportement préservé)
    if (diffDays >= 1 && diffDays <= 3) {
        return { stage: 'j3', daysRemaining: diffDays };
    }
    if (diffDays >= 4 && diffDays <= 7) {
        return { stage: 'j7', daysRemaining: diffDays };
    }
    if (diffDays >= 8 && diffDays <= 15) {
        return { stage: 'j15', daysRemaining: diffDays };
    }

    // 3. Notifications de retard (jours précis)
    if (diffDays < 0) {
        const daysOverdue = Math.abs(diffDays);
        if (daysOverdue === 1) return { stage: 'overdue_1', daysRemaining: -1 };
        if (daysOverdue === 2) return { stage: 'overdue_2', daysRemaining: -2 };
        if (daysOverdue === 3) return { stage: 'overdue_3', daysRemaining: -3 };
        if (daysOverdue === 7) return { stage: 'overdue_7', daysRemaining: -7 };
        if (daysOverdue === 14) return { stage: 'overdue_14', daysRemaining: -14 };
        if (daysOverdue === 30) return { stage: 'overdue_30', daysRemaining: -30 };
        if (daysOverdue === 60) return { stage: 'overdue_60', daysRemaining: -60 };

        return { stage: null, daysRemaining: diffDays };
    }

    return { stage: null, daysRemaining: diffDays };
}

/**
 * Clé d'idempotence logique stable dans notificationLogs.
 */
export function buildNotificationLogKey(maintenanceId: string, stage: ReminderStage, dueDate: string): string {
    return `${maintenanceId}_${stage}_${dueDate}`;
}

/**
 * Vérifie si une échéance a été réellement couverte ou renouvelée par un cycle plus récent.
 * 
 * Règles impératives :
 * - Une simple intervention postérieure sans prochaine échéance ne prouve PAS qu'une ancienne échéance est réglée.
 * - Une échéance encore active et non effectuée ne doit PAS être ignorée.
 * - Ne supprime jamais nextDueDate de Firestore.
 * - Une échéance est considérée couverte uniquement si un autre enregistrement de même tâche et même véhicule
 *   possède une prochaine échéance (nextDueDate) strictement postérieure et une date >= candidate.
 */
export function isDeadlineAlreadyCompleted(
    candidateData: { id?: string; date?: string; nextDueDate?: string },
    allMaintenancesForVehicleAndTask: Array<{ id: string; [key: string]: any }>
): { isCompleted: boolean; reason?: string } {
    const candidateDueDate = candidateData.nextDueDate;
    if (!candidateDueDate) {
        return { isCompleted: true, reason: 'PAS_DE_DATE_ECHEANCE' };
    }

    const candidateDate = candidateData.date || '';

    for (const other of allMaintenancesForVehicleAndTask) {
        if (candidateData.id && other.id === candidateData.id) continue;
        const otherDueDate = other.nextDueDate;
        const otherDate = other.date || '';

        // Un renouvellement réel est avéré quand un autre document a été créé/enregistré
        // avec une date d'échéance strictement postérieure
        if (otherDueDate && otherDueDate > candidateDueDate && otherDate >= candidateDate) {
            return {
                isCompleted: true,
                reason: `Remplacée par une échéance plus récente (${otherDueDate})`
            };
        }
    }

    return { isCompleted: false };
}

/**
 * Construit le titre et le corps de notification pour une échéance standard ou administrative.
 * Préserve scrupuleusement les textes existants de J-15, J-7, J-3 et J0.
 */
export function buildReminderMessage(params: {
    task: string;
    vehicleName: string;
    dueDate: string;
    stage: ReminderStage;
    daysRemaining: number;
}): { title: string; body: string; isUrgent: boolean } {
    const { task, vehicleName, dueDate, stage, daysRemaining } = params;
    const requiresDoc = isDocumentTask(task);
    const isUrgent = stage === 'j0' || (stage ? stage.startsWith('overdue') : false);

    let title = 'Rappel Entretien';
    let body = '';

    if (stage && stage.startsWith('overdue')) {
        const daysOverdue = Math.abs(daysRemaining);
        title = `⚠️ Entretien en retard (J+${daysOverdue}) : ${task} (${vehicleName})`;
        if (requiresDoc) {
            body = `"${task}" pour ${vehicleName} aurait dû être fait le ${dueDate} (${daysOverdue} jour${daysOverdue > 1 ? 's' : ''} de retard). Payez dès que possible et ajoutez le justificatif dans la section Documents de l’application.`;
        } else {
            body = `"${task}" pour ${vehicleName} aurait dû être fait le ${dueDate} (${daysOverdue} jour${daysOverdue > 1 ? 's' : ''} de retard). Effectuez-le dès que possible ou marquez-le comme fait avec sa vraie date dans l’application.`;
        }
    } else if (stage === 'j0') {
        title = `🚨 Jour J : ${task} (${vehicleName})`;
        if (requiresDoc) {
            body = `C’est aujourd’hui la date limite pour "${task}" (${vehicleName}). Après le paiement, pensez à ajouter le reçu ou le document dans la section Documents de l’application.`;
        } else {
            body = `C'est aujourd'hui la date limite pour "${task}" (${vehicleName}). Après l’entretien, n’oubliez pas de l’enregistrer avec la vraie date dans l’application.`;
        }
    } else if (stage === 'j3') {
        const anticipation = getDeadlineAnticipationInfo(dueDate);
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
        const anticipation = getDeadlineAnticipationInfo(dueDate);
        if (anticipation.isNonWorking) {
            title = `Rappel J-7 : ${task} (${vehicleName})`;
            body = `Dans une semaine : "${task}" (${vehicleName}) arrive à échéance le ${anticipation.dueDateFormatted}. ${anticipation.warningText}`;
        } else {
            title = `Rappel J-7 : ${task} (${vehicleName})`;
            body = `Dans une semaine : "${task}" pour ${vehicleName} arrive à échéance.`;
        }
    } else if (stage === 'j15') {
        const anticipation = getDeadlineAnticipationInfo(dueDate);
        if (anticipation.isNonWorking) {
            title = `Rappel J-15 : ${task} (${vehicleName})`;
            body = `Dans 15 jours : pensez à anticiper l’entretien "${task}" pour votre ${vehicleName} (${anticipation.dueDateFormatted}). ${anticipation.warningText}`;
        } else {
            title = `Rappel J-15 : ${task} (${vehicleName})`;
            body = `Dans 15 jours : pensez à anticiper l’entretien "${task}" pour votre ${vehicleName}.`;
        }
    }

    return { title, body, isUrgent };
}

/**
 * Message spécifique pour les vignettes.
 */
export function buildVignetteMessage(params: {
    vehicleName: string;
    dueDateFormatted: string;
    stage: ReminderStage;
    daysRemaining: number;
    anticipation?: any;
}): { title: string; body: string; isUrgent: boolean } {
    const { vehicleName, dueDateFormatted, stage, daysRemaining, anticipation } = params;
    const isUrgent = stage === 'j0' || (stage ? stage.startsWith('overdue') : false);

    let title = `Rappel Vignette (${vehicleName})`;
    let body = `La date limite de la vignette (${dueDateFormatted}) approche pour ${vehicleName}.`;

    if (stage && stage.startsWith('overdue')) {
        const daysOverdue = Math.abs(daysRemaining);
        title = `⚠️ Vignette en retard (J+${daysOverdue}) : ${vehicleName}`;
        body = `La date limite de la Vignette (${dueDateFormatted}) pour ${vehicleName} est dépassée de ${daysOverdue} jour${daysOverdue > 1 ? 's' : ''}. Réglez-la dès que possible pour éviter les pénalités et ajoutez le reçu dans « Documents ».`;
    } else if (stage === 'j0') {
        title = `🚨 Jour J : Vignette (${vehicleName})`;
        body = `Aujourd’hui est la date limite officielle pour le paiement de la Vignette de ${vehicleName}. Après le paiement, ajoutez immédiatement le reçu dans la section « Documents » de l’application.`;
    } else if (stage === 'j3') {
        title = `⚠️ Rappel J-3 : Vignette (${vehicleName})`;
        body = `Plus que 3 jours pour régler la Vignette de ${vehicleName} (${anticipation?.dueDateFormatted || dueDateFormatted}). ${anticipation?.warningText || ''}`.trim();
    } else if (stage === 'j7') {
        title = `Rappel J-7 : Vignette (${vehicleName})`;
        body = `Dans 7 jours : échéance de la Vignette pour ${vehicleName} (${anticipation?.dueDateFormatted || dueDateFormatted}). ${anticipation?.warningText || ''}`.trim();
    } else if (stage === 'j15') {
        title = `Rappel J-15 : Vignette (${vehicleName})`;
        body = `Dans 15 jours : prévoyez le règlement de la Vignette pour votre ${vehicleName} (${anticipation?.dueDateFormatted || dueDateFormatted}). ${anticipation?.warningText || ''}`.trim();
    }

    return { title, body, isUrgent };
}
