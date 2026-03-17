/**
 * Tunisian Rules for Vignettes:
 * - Ends in EVEN (0, 2, 4, 6, 8): April 5th  (mois paire → 05 Avril)
 * - Ends in ODD  (1, 3, 5, 7, 9): March 5th  (mois impaire → 05 Mars)
 */
function getVignetteRules(licensePlate: string) {
    const digitsOnly = (licensePlate || "").replace(/\D/g, '');
    let lastDigit = 0;
    if (digitsOnly.length > 0) {
        lastDigit = parseInt(digitsOnly.slice(-1), 10);
    }
    const isEven = lastDigit % 2 === 0;
    return {
        month: isEven ? 3 : 2, // 0-indexed: 3=April (paire), 2=March (impaire)
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
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Try current year first (2026)
    const currentYearDeadline = new Date(today.getFullYear(), rules.month, rules.day);

    // If the 2026 deadline is still in the future, we use it.
    // This allows fixing the "2027" error.
    if (currentYearDeadline >= today) {
        return currentYearDeadline;
    }

    // Otherwise, use the next year
    return new Date(today.getFullYear() + 1, rules.month, rules.day);
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
