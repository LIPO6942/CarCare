/**
 * Module de gestion des jours fériés et des jours non ouvrés en Tunisie.
 * 
 * En Tunisie :
 * - Les services administratifs et financiers (recettes des finances, centres de visite technique ATTT,
 *   agences d'assurances, banques, etc.) sont fermés le samedi et le dimanche.
 * - Les jours fériés civils sont à dates fixes.
 * - Les jours fériés religieux sont lunaires (Aïd El Fitr, Aïd El Adha, Mouled, Nouvel An Hégirien).
 */

export interface NonWorkingDayAnalysis {
    isNonWorking: boolean;
    isWeekend: boolean;
    isHoliday: boolean;
    holidayName?: string;
    dayName: string; // Ex: 'samedi', 'dimanche', 'vendredi'
}

export interface DeadlineAnticipationInfo extends NonWorkingDayAnalysis {
    dueDate: Date;
    dueDateFormatted: string; // Ex: "dimanche 5 avril 2026"
    lastWorkingDate: Date;
    lastWorkingDateFormatted: string; // Ex: "vendredi 3 avril 2026"
    warningText: string;
    shortWarningText: string;
}

/**
 * Analyse de manière sûre une date (string "YYYY-MM-DD" ou Date) sans décalage de fuseau horaire.
 */
export function parseLocalDate(dateInput: Date | string): Date {
    if (dateInput instanceof Date) {
        return new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate(), 0, 0, 0, 0);
    }
    if (typeof dateInput === 'string') {
        const clean = dateInput.split('T')[0];
        const parts = clean.split('-').map(Number);
        if (parts.length === 3 && !parts.some(isNaN)) {
            return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
        }
        const parsed = new Date(dateInput);
        if (!isNaN(parsed.getTime())) {
            return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 0, 0, 0, 0);
        }
    }
    return new Date();
}

/**
 * Formate une date en chaîne locale "YYYY-MM-DD".
 */
export function formatDateToLocalISO(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

const FRENCH_DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const FRENCH_MONTHS = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
];

/**
 * Formate une date en français complet : "dimanche 5 avril 2026"
 */
export function formatFullFrenchDate(date: Date): string {
    const d = parseLocalDate(date);
    const dayName = FRENCH_DAYS[d.getDay()];
    const dayNum = d.getDate();
    const monthName = FRENCH_MONTHS[d.getMonth()];
    const year = d.getFullYear();
    return `${dayName} ${dayNum} ${monthName} ${year}`;
}

/**
 * Formate une date courte en français : "vendredi 3 avril"
 */
export function formatShortFrenchDate(date: Date): string {
    const d = parseLocalDate(date);
    const dayName = FRENCH_DAYS[d.getDay()];
    const dayNum = d.getDate();
    const monthName = FRENCH_MONTHS[d.getMonth()];
    return `${dayName} ${dayNum} ${monthName}`;
}

/**
 * Jours fériés civils officiels à date fixe en Tunisie.
 * Format clé : "MM-DD"
 */
const FIXED_TUNISIAN_HOLIDAYS: Record<string, string> = {
    '01-01': "Jour de l'An",
    '03-20': "Fête de l'Indépendance",
    '04-09': "Fête des Martyrs",
    '05-01': "Fête du Travail",
    '07-25': "Fête de la République",
    '08-13': "Fête de la Femme",
    '10-15': "Fête de l'Évacuation",
    '12-17': "Fête de la Révolution",
};

/**
 * Calendrier officiel et prévisionnel des fêtes religieuses en Tunisie (2024 - 2035).
 * Les administrations tunisiennes chôment :
 * - 3 jours pour l'Aïd El Fitr
 * - 2 jours pour l'Aïd El Adha
 * - 1 jour pour le Nouvel An Hégirien
 * - 1 jour pour le Mouled
 */
const RELIGIOUS_HOLIDAYS_TABLE: Record<string, string> = {
    // --- 2024 ---
    '2024-04-10': "Aïd El Fitr (1er jour)",
    '2024-04-11': "Aïd El Fitr (2ème jour)",
    '2024-04-12': "Aïd El Fitr (3ème jour)",
    '2024-06-16': "Aïd El Adha (1er jour)",
    '2024-06-17': "Aïd El Adha (2ème jour)",
    '2024-07-07': "Nouvel An Hégirien",
    '2024-09-15': "Le Mouled (Mawlid)",

    // --- 2025 ---
    '2025-03-30': "Aïd El Fitr (1er jour)",
    '2025-03-31': "Aïd El Fitr (2ème jour)",
    '2025-04-01': "Aïd El Fitr (3ème jour)",
    '2025-06-06': "Aïd El Adha (1er jour)",
    '2025-06-07': "Aïd El Adha (2ème jour)",
    '2025-06-26': "Nouvel An Hégirien",
    '2025-09-04': "Le Mouled (Mawlid)",

    // --- 2026 ---
    '2026-03-20': "Aïd El Fitr (1er jour)",
    '2026-03-21': "Aïd El Fitr (2ème jour)",
    '2026-03-22': "Aïd El Fitr (3ème jour)",
    '2026-05-27': "Aïd El Adha (1er jour)",
    '2026-05-28': "Aïd El Adha (2ème jour)",
    '2026-06-16': "Nouvel An Hégirien",
    '2026-08-25': "Le Mouled (Mawlid)",

    // --- 2027 ---
    '2027-03-09': "Aïd El Fitr (1er jour)",
    '2027-03-10': "Aïd El Fitr (2ème jour)",
    '2027-03-11': "Aïd El Fitr (3ème jour)",
    '2027-05-16': "Aïd El Adha (1er jour)",
    '2027-05-17': "Aïd El Adha (2ème jour)",
    '2027-06-06': "Nouvel An Hégirien",
    '2027-08-15': "Le Mouled (Mawlid)",

    // --- 2028 ---
    '2028-02-27': "Aïd El Fitr (1er jour)",
    '2028-02-28': "Aïd El Fitr (2ème jour)",
    '2028-02-29': "Aïd El Fitr (3ème jour)",
    '2028-05-05': "Aïd El Adha (1er jour)",
    '2028-05-06': "Aïd El Adha (2ème jour)",
    '2028-05-25': "Nouvel An Hégirien",
    '2028-08-03': "Le Mouled (Mawlid)",

    // --- 2029 ---
    '2029-02-15': "Aïd El Fitr (1er jour)",
    '2029-02-16': "Aïd El Fitr (2ème jour)",
    '2029-02-17': "Aïd El Fitr (3ème jour)",
    '2029-04-24': "Aïd El Adha (1er jour)",
    '2029-04-25': "Aïd El Adha (2ème jour)",
    '2029-05-14': "Nouvel An Hégirien",
    '2029-07-24': "Le Mouled (Mawlid)",

    // --- 2030 ---
    '2030-02-04': "Aïd El Fitr (1er jour)",
    '2030-02-05': "Aïd El Fitr (2ème jour)",
    '2030-02-06': "Aïd El Fitr (3ème jour)",
    '2030-04-13': "Aïd El Adha (1er jour)",
    '2030-04-14': "Aïd El Adha (2ème jour)",
    '2030-05-04': "Nouvel An Hégirien",
    '2030-07-13': "Le Mouled (Mawlid)",

    // --- 2031 ---
    '2031-01-24': "Aïd El Fitr (1er jour)",
    '2031-01-25': "Aïd El Fitr (2ème jour)",
    '2031-01-26': "Aïd El Fitr (3ème jour)",
    '2031-04-02': "Aïd El Adha (1er jour)",
    '2031-04-03': "Aïd El Adha (2ème jour)",
    '2031-04-23': "Nouvel An Hégirien",
    '2031-07-02': "Le Mouled (Mawlid)",

    // --- 2032 ---
    '2032-01-13': "Aïd El Fitr (1er jour)",
    '2032-01-14': "Aïd El Fitr (2ème jour)",
    '2032-01-15': "Aïd El Fitr (3ème jour)",
    '2032-03-21': "Aïd El Adha (1er jour)",
    '2032-03-22': "Aïd El Adha (2ème jour)",
    '2032-04-11': "Nouvel An Hégirien",
    '2032-06-20': "Le Mouled (Mawlid)",

    // --- 2033 ---
    '2033-01-02': "Aïd El Fitr (1er jour)",
    '2033-01-03': "Aïd El Fitr (2ème jour)",
    '2033-01-04': "Aïd El Fitr (3ème jour)",
    '2033-03-10': "Aïd El Adha (1er jour)",
    '2033-03-11': "Aïd El Adha (2ème jour)",
    '2033-03-31': "Nouvel An Hégirien",
    '2033-06-09': "Le Mouled (Mawlid)",
    '2033-12-22': "Aïd El Fitr (1er jour)",
    '2033-12-23': "Aïd El Fitr (2ème jour)",
    '2033-12-24': "Aïd El Fitr (3ème jour)",

    // --- 2034 ---
    '2034-02-28': "Aïd El Adha (1er jour)",
    '2034-03-01': "Aïd El Adha (2ème jour)",
    '2034-03-20': "Nouvel An Hégirien",
    '2034-05-29': "Le Mouled (Mawlid)",
    '2034-12-11': "Aïd El Fitr (1er jour)",
    '2034-12-12': "Aïd El Fitr (2ème jour)",
    '2034-12-13': "Aïd El Fitr (3ème jour)",

    // --- 2035 ---
    '2035-02-17': "Aïd El Adha (1er jour)",
    '2035-02-18': "Aïd El Adha (2ème jour)",
    '2035-03-10': "Nouvel An Hégirien",
    '2035-05-18': "Le Mouled (Mawlid)",
    '2035-12-01': "Aïd El Fitr (1er jour)",
    '2035-12-02': "Aïd El Fitr (2ème jour)",
    '2035-12-03': "Aïd El Fitr (3ème jour)",
};

/**
 * Détection des fêtes religieuses via le calendrier lunaire Umm al-Qura (fallback pour les années non listées)
 */
function getIslamicHolidayFallback(date: Date): string | null {
    try {
        const formatter = new Intl.DateTimeFormat('en-US-u-ca-islamic-umalqura', {
            day: 'numeric',
            month: 'numeric',
        });
        const parts = formatter.formatToParts(date);
        const day = parseInt(parts.find(p => p.type === 'day')?.value || '0', 10);
        const month = parseInt(parts.find(p => p.type === 'month')?.value || '0', 10);

        // 1er Mouharram : Nouvel An Hégirien
        if (month === 1 && day === 1) return "Nouvel An Hégirien";
        // 12 Rabia al-Awwal : Le Mouled
        if (month === 3 && day === 12) return "Le Mouled (Mawlid)";
        // 1er au 3 Shawwal : Aïd El Fitr
        if (month === 10 && (day === 1 || day === 2 || day === 3)) {
            return `Aïd El Fitr (${day === 1 ? '1er' : `${day}ème`} jour)`;
        }
        // 10 et 11 Dhou al-Hijja : Aïd El Adha
        if (month === 12 && (day === 10 || day === 11)) {
            return `Aïd El Adha (${day === 10 ? '1er' : '2ème'} jour)`;
        }
    } catch {
        // Fallback silencieux en cas d'incompatibilité Intl
    }
    return null;
}

/**
 * Vérifie si une date correspond à un jour férié officiel en Tunisie.
 * Retourne le nom du jour férié si trouvé, sinon null.
 */
export function getTunisianHoliday(dateInput: Date | string): { name: string; isHoliday: boolean } | null {
    const date = parseLocalDate(dateInput);
    const isoString = formatDateToLocalISO(date);
    const mmdd = isoString.slice(5); // "MM-DD"

    // 1. Vérification jour férié civil fixe
    if (FIXED_TUNISIAN_HOLIDAYS[mmdd]) {
        return { name: FIXED_TUNISIAN_HOLIDAYS[mmdd], isHoliday: true };
    }

    // 2. Vérification table des fêtes religieuses
    if (RELIGIOUS_HOLIDAYS_TABLE[isoString]) {
        return { name: RELIGIOUS_HOLIDAYS_TABLE[isoString], isHoliday: true };
    }

    // 3. Fallback calculé pour les années éloignées
    const fallback = getIslamicHolidayFallback(date);
    if (fallback) {
        return { name: fallback, isHoliday: true };
    }

    return null;
}

/**
 * Vérifie si une date tombe un samedi (6) ou dimanche (0).
 */
export function isWeekend(dateInput: Date | string): boolean {
    const date = parseLocalDate(dateInput);
    const day = date.getDay();
    return day === 0 || day === 6;
}

/**
 * Analyse complète pour savoir si une date est non ouvrée en Tunisie (weekend ou jour férié).
 */
export function checkNonWorkingDay(dateInput: Date | string): NonWorkingDayAnalysis {
    const date = parseLocalDate(dateInput);
    const dayOfWeek = date.getDay();
    const dayName = FRENCH_DAYS[dayOfWeek];
    const weekend = dayOfWeek === 0 || dayOfWeek === 6;
    const holiday = getTunisianHoliday(date);

    return {
        isNonWorking: weekend || Boolean(holiday),
        isWeekend: weekend,
        isHoliday: Boolean(holiday),
        holidayName: holiday?.name,
        dayName,
    };
}

/**
 * Calcule le dernier jour ouvré (non-weekend et non-férié) précédant strictement l'échéance.
 * Exemple : si l'échéance est un dimanche 5 avril, retourne le vendredi 3 avril.
 * Si le vendredi était également férié, remonte au jeudi, etc.
 */
export function getLastWorkingDayBefore(dueDateInput: Date | string): Date {
    const cursor = parseLocalDate(dueDateInput);
    cursor.setDate(cursor.getDate() - 1);

    // Remonte jour par jour jusqu'à trouver un jour ouvré
    while (true) {
        const analysis = checkNonWorkingDay(cursor);
        if (!analysis.isNonWorking) {
            return new Date(cursor.getTime());
        }
        cursor.setDate(cursor.getDate() - 1);
    }
}

/**
 * Génère toutes les informations d'anticipation pour une échéance donnée.
 * Prépare des messages d'avertissement clairs et adaptés pour les notifications push et l'UI.
 */
export function getDeadlineAnticipationInfo(dueDateInput: Date | string): DeadlineAnticipationInfo {
    const dueDate = parseLocalDate(dueDateInput);
    const analysis = checkNonWorkingDay(dueDate);
    const lastWorkingDate = getLastWorkingDayBefore(dueDate);

    const dueDateFormatted = formatFullFrenchDate(dueDate);
    const lastWorkingDateFormatted = formatFullFrenchDate(lastWorkingDate);
    const shortLastWorking = formatShortFrenchDate(lastWorkingDate);

    let warningText = '';
    let shortWarningText = '';

    if (analysis.isNonWorking) {
        let reasonLabel = '';
        if (analysis.isWeekend && analysis.isHoliday) {
            reasonLabel = `un weekend et jour férié (${analysis.holidayName})`;
        } else if (analysis.isWeekend) {
            reasonLabel = `un ${analysis.dayName} (weekend)`;
        } else if (analysis.isHoliday) {
            reasonLabel = `un jour férié (${analysis.holidayName})`;
        }

        warningText = `⚠️ Attention : l'échéance du ${dueDateFormatted} tombe ${reasonLabel} (administrations fermées). Anticipez votre démarche et réglez avant le ${lastWorkingDateFormatted} !`;
        shortWarningText = `⚠️ Échéance ${analysis.dayName}${analysis.holidayName ? ` (${analysis.holidayName})` : ''} : payer avant le ${shortLastWorking}`;
    }

    return {
        ...analysis,
        dueDate,
        dueDateFormatted,
        lastWorkingDate,
        lastWorkingDateFormatted,
        warningText,
        shortWarningText,
    };
}
