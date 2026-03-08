/**
 * Calculates the next vignette deadline based on the last digit of the Tunisian license plate.
 * 
 * Rules:
 * - Ends in ODD (1, 3, 5, 7, 9): March 5th
 * - Ends in EVEN (0, 2, 4, 6, 8): April 5th
 * 
 * @param licensePlate The license plate string (e.g., "188 TU 8269")
 * @param baseDate The date from which to calculate the *next* deadline (default: today)
 * @returns A Date object representing the next deadline
 */
export function calculateNextVignetteDate(licensePlate: string, baseDate: Date = new Date()): Date {
    // 1. Extract the last digit from the license plate
    // Remove all non-digit characters, then take the last one
    const digitsOnly = licensePlate.replace(/\D/g, '');
    let lastDigit = 1; // Default to ODD if plate format is invalid or has no numbers

    if (digitsOnly.length > 0) {
        lastDigit = parseInt(digitsOnly.slice(-1), 10);
    }

    const isEven = lastDigit % 2 === 0;

    // 2. Determine target month and day
    const targetMonth = isEven ? 3 : 2; // 0-indexed (2 = March, 3 = April)
    const targetDay = 5;

    // 3. Construct the deadline for the current year of the baseDate
    const currentYearDeadline = new Date(baseDate.getFullYear(), targetMonth, targetDay);

    // 4. If the baseDate is already past this year's deadline, move to next year
    if (baseDate > currentYearDeadline) {
        currentYearDeadline.setFullYear(currentYearDeadline.getFullYear() + 1);
    }

    return currentYearDeadline;
}
