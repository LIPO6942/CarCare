'use server';

/**
 * @fileOverview A chatbot flow that can answer questions about a user's vehicle data.
 *
 * - answerVehicleQuestion - The main function that answers a user's question about their vehicle.
 */

import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/googleai';
import { z } from 'genkit';
import { getAllUserRepairs, getAllUserMaintenance, getAllUserFuelLogs } from '@/lib/data';
import type { Repair, Maintenance, FuelLog, Vehicle } from '@/lib/types';
import type { answerVehicleQuestionInput, answerVehicleQuestionOutput } from './vehicle-data-chatbot-types';
import { answerVehicleQuestionInputSchema, answerVehicleQuestionOutputSchema } from './vehicle-data-chatbot-types';


// Define tools for the AI to use
const getRepairsTool = ai.defineTool(
    {
        name: 'getRepairHistory',
        description: 'Get the repair history for the specified vehicle.',
        inputSchema: z.object({ userId: z.string(), vehicleId: z.string() }),
        outputSchema: z.array(z.custom<Repair>()),
    },
    async ({ userId, vehicleId }) => {
        const allRepairs = await getAllUserRepairs(userId);
        return allRepairs.filter(r => r.vehicleId === vehicleId);
    }
);

const getMaintenanceTool = ai.defineTool(
    {
        name: 'getMaintenanceHistory',
        description: 'Get the maintenance history for the specified vehicle.',
        inputSchema: z.object({ userId: z.string(), vehicleId: z.string() }),
        outputSchema: z.array(z.custom<Maintenance>()),
    },
    async ({ userId, vehicleId }) => {
        const allMaintenance = await getAllUserMaintenance(userId);
        return allMaintenance.filter(m => m.vehicleId === vehicleId);
    }
);

const getFuelLogsTool = ai.defineTool(
    {
        name: 'getFuelLogHistory',
        description: 'Get the fuel log history for the specified vehicle.',
        inputSchema: z.object({ userId: z.string(), vehicleId: z.string() }),
        outputSchema: z.array(z.custom<FuelLog>()),
    },
    async ({ userId, vehicleId }) => {
        const allLogs = await getAllUserFuelLogs(userId);
        return allLogs.filter(l => l.vehicleId === vehicleId);
    }
);


const vehicleDataChatbotPrompt = ai.definePrompt({
    name: 'vehicleDataChatbotPrompt',
    model: googleAI.model('gemini-1.5-flash-latest'),
    tools: [getRepairsTool, getMaintenanceTool, getFuelLogsTool],
    system: `You are an expert automotive data analyst called "CarCare Copilot". Your role is to answer questions about a user's vehicle based on their data.
- The user's vehicle is a {{vehicle.brand}} {{vehicle.model}} ({{vehicle.year}}).
- Use the provided tools to fetch repair history, maintenance logs, and fuel logs.
- You MUST pass the user's ID and the vehicle's ID to the tools. The user ID is {{userId}} and the vehicle ID is {{vehicle.id}}.
- If you don't have enough information from the tools, ask the user to add more data to their logs.
- Base your calculations on the data provided. For mileage-based questions, find the most recent event (repair, maintenance, or fuel log) to determine the current mileage.
- Respond in clear, concise French.
- Today's date is ${new Date().toLocaleDateString('fr-FR')}.`,
});


const answerVehicleQuestionFlow = ai.defineFlow(
    {
        name: 'answerVehicleQuestionFlow',
        inputSchema: answerVehicleQuestionInputSchema,
        outputSchema: answerVehicleQuestionOutputSchema,
    },
    async (input: answerVehicleQuestionInput): Promise<answerVehicleQuestionOutput> => {
        const { userId, vehicle, history, question } = input;
        
        // Construct the full chat history including the system prompt and the new question
        const messages = [
            ...history,
            {role: 'user' as const, content: question},
        ];

        const llmResponse = await vehicleDataChatbotPrompt({
            history: messages.map(m => ({ role: m.role, content: [{ text: m.content }] })),
            vehicle: vehicle,
            userId: userId,
        });
        
        const answerText = llmResponse.text();

        return {
            answer: answerText ?? "Je n'ai pas pu générer de réponse. Veuillez réessayer."
        };
    }
);


export async function answerVehicleQuestion(input: answerVehicleQuestionInput): Promise<answerVehicleQuestionOutput> {
  return answerVehicleQuestionFlow(input);
}
