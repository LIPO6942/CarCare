/**
 * @fileOverview Defines a single, powerful tool for the vehicle data chatbot.
 * This tool fetches all relevant data (repairs, maintenance, fuel logs) for a vehicle.
 */
'use server';

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import type { Repair, Maintenance, FuelLog } from '@/lib/types';
import { getVehicleData } from '@/ai/services/vehicle-data-service';

const GetVehicleDataInputSchema = z.object({
    vehicleId: z.string(),
});

const GetVehicleDataOutputSchema = z.object({
    repairs: z.array(z.custom<Repair>()),
    maintenance: z.array(z.custom<Maintenance>()),
    fuelLogs: z.array(z.custom<FuelLog>()),
});


// This is now a simple async function, not a Genkit Tool defined with ai.defineTool.
// We will call it directly from our flow.
export async function getVehicleDataTool(input: { vehicleId: string }): Promise<{ repairs: Repair[], maintenance: Maintenance[], fuelLogs: FuelLog[] }> {
    return await getVehicleData(input.vehicleId);
}
