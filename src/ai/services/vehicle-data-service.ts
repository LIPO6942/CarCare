/**
 * @fileOverview This service provides a centralized function for fetching all data
 * related to a specific vehicle from Firestore.
 */
'use server';

import { getRepairsForVehicle, getMaintenanceForVehicle, getFuelLogsForVehicle } from '@/lib/data';

/**
 * Fetches all repairs, maintenance, and fuel logs for a given vehicle ID and user ID.
 * @param vehicleId The ID of the vehicle to fetch data for.
 * @param userId The ID of the user who owns the vehicle.
 * @returns An object containing arrays of all vehicle data.
 */
export async function getVehicleData(vehicleId: string, userId: string) {
    const [repairs, maintenance, fuelLogs] = await Promise.all([
        getRepairsForVehicle(vehicleId, userId),
        getMaintenanceForVehicle(vehicleId, userId),
        getFuelLogsForVehicle(vehicleId, userId),
    ]);

    return {
        repairs,
        maintenance,
        fuelLogs,
    };
}
