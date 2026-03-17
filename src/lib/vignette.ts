/**
 * Tunisian Rules for Vignettes:
 * - Ends in EVEN (0, 2, 4, 6, 8): March 5th  (paire → 05 Mars)
 * - Ends in ODD  (1, 3, 5, 7, 9): April 5th  (impaire → 05 Avril)
 */
function getVignetteRules(licensePlate: string) {
    const match = (licensePlate || "").match(/\d+/);
    let isEven = false;
    if (match) {
        const registrationNumber = match[0];
        const lastDigit = parseInt(registrationNumber.slice(-1), 10);
        isEven = lastDigit % 2 === 0;
    }
    return {
        month: isEven ? 2 : 3, // 0-indexed: 2=March (paire), 3=April (impaire)
        day: 5
    };
}

/**
 * Calculates the next deadline after a PAYMENT is confirmed.
 */
export function calculateNextVignetteDate(licensePlate: string, lastPaymentDate: Date = new Date()): Date {
    const rules = getVignetteRules(licensePlate);
    const lastPaymentYear = lastPaymentDate.getFullYear();

    // If you paid in 2025 (or before), the next deadline is 2026.
    // If you paid in 2026, the next deadline is 2027.
    return new Date(lastPaymentYear + 1, rules.month, rules.day);
}

/**
 * Adjusts an existing deadline to match smart rules while ensuring the year is correct.
 * Crucial for migration from faulty data (like 2027 by mistake).
 */
export function adjustVignetteDate(licensePlate: string, currentDeadline: Date): Date {
    const rules = getVignetteRules(licensePlate);
    // Fix month and day according to rules, preserve the original year from the database
    return new Date(currentDeadline.getFullYear(), rules.month, rules.day);
}

/**
 * Robust date formatting to YYYY-MM-DD avoiding timezone shifts.
 */
export function formatDateToLocalISO(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
