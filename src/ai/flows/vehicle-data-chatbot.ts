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
import type { Repair, Maintenance, FuelLog } from '@/lib/types';
import type { answerVehicleQuestionInput, answerVehicleQuestionOutput } from './vehicle-data-chatbot-types';
import { answerVehicleQuestionInputSchema, answerVehicleQuestionOutputSchema } from './vehicle-data-chatbot-types';


export async function answerVehicleQuestion(input: answerVehicleQuestionInput): Promise<answerVehicleQuestionOutput> {
    return answerVehicleQuestionFlow(input);
}


const answerVehicleQuestionFlow = ai.defineFlow(
    {
        name: 'answerVehicleQuestionFlow',
        inputSchema: answerVehicleQuestionInputSchema,
        outputSchema: answerVehicleQuestionOutputSchema,
    },
    async (input) => {
        const { vehicle, history, question, userId } = input;
        
        // Define tools inside the flow to capture vehicleId and userId from the input scope.
        const getRepairsTool = ai.defineTool(
            {
                name: 'getRepairHistory',
                description: 'Obtient l\'historique des réparations (pannes, accidents, remplacements de pièces) pour le véhicule de l\'utilisateur.',
                inputSchema: z.object({}),
                outputSchema: z.array(z.custom<Repair>()),
            },
            async () => {
                return await getRepairsForVehicle(vehicle.id, userId);
            }
        );

        const getMaintenanceTool = ai.defineTool(
            {
                name: 'getMaintenanceHistory',
                description: 'Obtient l\'historique de l\'entretien pour un véhicule. Cela inclut les paiements (assurance, vignette), les vidanges, et les visites techniques. Utilisez cet outil pour les questions sur les coûts et les dates d\'échéance.',
                inputSchema: z.object({}),
                outputSchema: z.array(z.custom<Maintenance>()),
            },
            async () => {
                return await getMaintenanceForVehicle(vehicle.id, userId);
            }
        );

        const getFuelLogsTool = ai.defineTool(
            {
                name: 'getFuelLogHistory',
                description: 'Obtient l\'historique des pleins de carburant pour un véhicule spécifique, y compris les coûts, les quantités et les dates. Utilisez cet outil pour les questions sur la consommation et les dépenses de carburant.',
                inputSchema: z.object({}),
                outputSchema: z.array(z.custom<FuelLog>()),
            },
            async () => {
                return await getFuelLogsForVehicle(vehicle.id, userId);
            }
        );

        const tools = [getRepairsTool, getMaintenanceTool, getFuelLogsTool];
        
        const messages = [
            {
                role: 'system' as const,
                content: [{
                    text: `You are an expert automotive data analyst called "CarCare Copilot". Your role is to answer questions about a user's vehicle based on their data.
- The user is asking about their ${vehicle.brand} ${vehicle.model} (${vehicle.year}).
- You have access to tools that can retrieve the vehicle's repair, maintenance, and fuel history. You MUST use these tools to answer the user's question. Call the tool without any parameters.
- If you don't have enough information from the tools, ask the user to add more data to their logs. For example, if they ask about insurance but the maintenance log is empty, tell them to add their insurance payment history.
- Base your calculations and answers *only* on the data provided by the tools. Do not make up information.
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
        });
        
        const answerText = llmResponse.text;

        return {
            answer: answerText ?? "Je n'ai pas pu générer de réponse. Veuillez réessayer."
        };
    }
);
