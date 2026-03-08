/**
 * Tunisian Rules for Vignettes:
 * - Ends in EVEN (0, 2, 4, 6, 8): March 5th
 * - Ends in ODD (1, 3, 5, 7, 9): April 5th
 */
function getVignetteRules(licensePlate: string) {
    const digitsOnly = (licensePlate || "").replace(/\D/g, '');
    let lastDigit = 0;
    if (digitsOnly.length > 0) {
        lastDigit = parseInt(digitsOnly.slice(-1), 10);
    }
    const isEven = lastDigit % 2 === 0;
    return {
        month: isEven ? 2 : 3, // 0-indexed: 2=March, 3=April
        day: 5
    };
}

/**
 * Calculates the deadline after a PAYMENT is made.
 * If you paid in 2025, your NEXT deadline is in 2026.
 */
export function calculateNextVignetteDate(licensePlate: string, lastPaymentDate: Date = new Date()): Date {
    const rules = getVignetteRules(licensePlate);
    return new Date(lastPaymentDate.getFullYear() + 1, rules.month, rules.day);
}

/**
 * Adjusts an existing deadline to match the smart rules without changing the year.
 * Used for migration or correction.
 */
export function adjustVignetteDate(licensePlate: string, existingDeadline: Date): Date {
    const rules = getVignetteRules(licensePlate);
    return new Date(existingDeadline.getFullYear(), rules.month, rules.day);
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
