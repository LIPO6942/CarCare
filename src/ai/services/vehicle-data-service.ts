/**
 * @fileOverview This service provides a centralized function for fetching all data
 * related to a specific vehicle from Firestore.
 */
'use server';

import { getRepairsForVehicle, getMaintenanceForVehicle, getFuelLogsForVehicle } from '@/lib/data';

/**
 * Fetches all repairs, maintenance, and fuel logs for a given vehicle ID.
 * @param vehicleId The ID of the vehicle to fetch data for.
 * @returns An object containing arrays of all vehicle data.
 */
export async function getVehicleData(vehicleId: string) {
    const [repairs, maintenance, fuelLogs] = await Promise.all([
        getRepairsForVehicle(vehicleId),
        getMaintenanceForVehicle(vehicleId),
        getFuelLogsForVehicle(vehicleId),
    ]);

    return {
        repairs,
        maintenance,
        fuelLogs,
    };
}
