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

export const getVehicleDataTool = ai.defineTool(
    {
        name: 'getVehicleData',
        description: "Obtient un résumé complet de toutes les données d'un véhicule, y compris l'historique des réparations, de l'entretien et des pleins de carburant.",
        inputSchema: GetVehicleDataInputSchema,
        outputSchema: GetVehicleDataOutputSchema,
    },
    async ({ vehicleId }) => {
        return await getVehicleData(vehicleId);
    }
);
