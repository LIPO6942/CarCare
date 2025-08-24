'use server';

/**
 * @fileOverview A chatbot flow that can answer questions about a user's vehicle data.
 *
 * - answerVehicleQuestion - The main function that answers a user's question about their vehicle.
 */

import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/googleai';
import { z } from 'genkit';
import { getRepairsForVehicle, getMaintenanceForVehicle, getFuelLogsForVehicle } from '@/lib/data';
import type { Repair, Maintenance, FuelLog, Vehicle } from '@/lib/types';
import type { answerVehicleQuestionInput, answerVehicleQuestionOutput } from './vehicle-data-chatbot-types';
import { answerVehicleQuestionInputSchema, answerVehicleQuestionOutputSchema } from './vehicle-data-chatbot-types';


// Define tools for the AI to use
const getRepairsTool = ai.defineTool(
    {
        name: 'getRepairHistory',
        description: 'Obtient l\'historique des réparations (pannes, accidents, remplacements de pièces) pour le véhicule de l\'utilisateur.',
        inputSchema: z.object({}), // No input needed, it uses the flow's context
        outputSchema: z.array(z.custom<Repair>()),
    },
    async (input, context) => {
        const vehicleId = (context as any)?.flow.input.vehicle?.id;
        if (!vehicleId) return [];
        return await getRepairsForVehicle(vehicleId, '');
    }
);

const getMaintenanceTool = ai.defineTool(
    {
        name: 'getMaintenanceHistory',
        description: 'Obtient l\'historique de l\'entretien pour un véhicule. Cela inclut les paiements (assurance, vignette), les vidanges, et les visites techniques. Utilisez cet outil pour les questions sur les coûts et les dates d\'échéance.',
        inputSchema: z.object({}), // No input needed
        outputSchema: z.array(z.custom<Maintenance>()),
    },
    async (input, context) => {
        const vehicleId = (context as any)?.flow.input.vehicle?.id;
        if (!vehicleId) return [];
        return await getMaintenanceForVehicle(vehicleId, '');
    }
);

const getFuelLogsTool = ai.defineTool(
    {
        name: 'getFuelLogHistory',
        description: 'Obtient l\'historique des pleins de carburant pour un véhicule spécifique, y compris les coûts, les quantités et les dates. Utilisez cet outil pour les questions sur la consommation et les dépenses de carburant.',
        inputSchema: z.object({}), // No input needed
        outputSchema: z.array(z.custom<FuelLog>()),
    },
    async (input, context) => {
        const vehicleId = (context as any)?.flow.input.vehicle?.id;
        if (!vehicleId) return [];
        return await getFuelLogsForVehicle(vehicleId, '');
    }
);

const tools = [getRepairsTool, getMaintenanceTool, getFuelLogsTool];


const answerVehicleQuestionFlow = ai.defineFlow(
    {
        name: 'answerVehicleQuestionFlow',
        inputSchema: answerVehicleQuestionInputSchema,
        outputSchema: answerVehicleQuestionOutputSchema,
    },
    async (input: answerVehicleQuestionInput): Promise<answerVehicleQuestionOutput> => {
        const { vehicle, history, question } = input;
        
        const messages = [
            {
                role: 'system' as const,
                content: [{
                    text: `You are an expert automotive data analyst called "CarCare Copilot". Your role is to answer questions about a user's vehicle based on their data.
- The user is asking about their ${vehicle.brand} ${vehicle.model} (${vehicle.year}) with ID: ${vehicle.id}.
- To answer the question, you MUST use the provided tools to fetch the relevant data. Do not ask the user for the data, use the tools.
- If you don't have enough information from the tools, ask the user to add more data to their logs. For example, if they ask about insurance but the maintenance log is empty, tell them to add their insurance payment history.
- Base your calculations and answers *only* on the data provided by the tools.
- Respond in clear, concise French.
- Today's date is ${new Date().toLocaleDateString('fr-FR')}.`
                }]
            },
            ...history.map(h => ({ role: h.role as 'user' | 'model', content: [{ text: h.content }] })),
            {role: 'user' as const, content: [{text: question}]},
        ];

        const llmResponse = await ai.generate({
            model: googleAI.model('gemini-1.5-flash-latest'),
            messages: messages,
            tools: tools,
            context: { vehicle: vehicle }
        });
        
        const answerText = llmResponse.text;

        return {
            answer: answerText ?? "Je n'ai pas pu générer de réponse. Veuillez réessayer."
        };
    }
);


export async function answerVehicleQuestion(input: answerVehicleQuestionInput): Promise<answerVehicleQuestionOutput> {
  return answerVehicleQuestionFlow(input);
}
