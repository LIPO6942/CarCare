'use server';

/**
 * @fileOverview A chatbot flow that can answer questions about a user's vehicle data.
 *
 * - answerVehicleQuestion - The main function that answers a user's question about their vehicle.
 */

import { ai } from '@/ai/genkit';
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
        inputSchema: z.object({ vehicleId: z.string() }),
        outputSchema: z.array(z.custom<Repair>()),
    },
    async ({ vehicleId }) => {
        // This is a placeholder for getting the current user's ID.
        // In a real scenario, you'd get this from the session.
        const userId = 'placeholder-user-id'; // This will be replaced by the real user ID in the flow
        return await getAllUserRepairs(userId);
    }
);

const getMaintenanceTool = ai.defineTool(
    {
        name: 'getMaintenanceHistory',
        description: 'Get the maintenance history for the specified vehicle.',
        inputSchema: z.object({ vehicleId: z.string() }),
        outputSchema: z.array(z.custom<Maintenance>()),
    },
    async ({ vehicleId }) => {
        const userId = 'placeholder-user-id'; // This will be replaced by the real user ID in the flow
        return await getAllUserMaintenance(userId);
    }
);

const getFuelLogsTool = ai.defineTool(
    {
        name: 'getFuelLogHistory',
        description: 'Get the fuel log history for the specified vehicle.',
        inputSchema: z.object({ vehicleId: z.string() }),
        outputSchema: z.array(z.custom<FuelLog>()),
    },
    async ({ vehicleId }) => {
        const userId = 'placeholder-user-id'; // This will be replaced by the real user ID in the flow
        return await getAllUserFuelLogs(userId);
    }
);


const vehicleDataChatbotPrompt = ai.definePrompt({
    name: 'vehicleDataChatbotPrompt',
    tools: [getRepairsTool, getMaintenanceTool, getFuelLogsTool],
    system: `You are an expert automotive data analyst called "CarCare Copilot". Your role is to answer questions about a user's vehicle based on their data.
- The user's vehicle is a {{vehicle.brand}} {{vehicle.model}} ({{vehicle.year}}).
- Use the provided tools to fetch repair history, maintenance logs, and fuel logs.
- When you use a tool, you are fetching data for ALL of the user's vehicles. You must filter this data down to the vehicle ID: {{vehicle.id}}.
- You MUST use the provided tools to answer questions. Do not make up information.
- If you don't have enough information from the tools, ask the user to add more data to their logs.
- Base your calculations on the data provided. For mileage-based questions, find the most recent event (repair, maintenance, or fuel log) to determine the current mileage.
- Respond in clear, concise French.
- Today's date is ${new Date().toLocaleDateString('fr-FR')}.`,
});


export const answerVehicleQuestion = ai.defineFlow(
    {
        name: 'answerVehicleQuestionFlow',
        inputSchema: answerVehicleQuestionInputSchema,
        outputSchema: answerVehicleQuestionOutputSchema,
    },
    async (input: answerVehicleQuestionInput): Promise<answerVehicleQuestionOutput> => {
        const { userId, vehicle, history, question } = input;
        
        // Construct the full chat history including the system prompt and the new question
        const messages: any[] = [
             ...history.map(h => ({
                role: h.role,
                content: [{ text: h.content }]
            })),
            { role: 'user', content: [{ text: question }] }
        ];

        // Replace the placeholder userId in the tools with the actual userId
        const tools = {
            getRepairHistory: (args: any) => getAllUserRepairs(userId).then(data => data.filter(d => d.vehicleId === vehicle.id)),
            getMaintenanceHistory: (args: any) => getAllUserMaintenance(userId).then(data => data.filter(d => d.vehicleId === vehicle.id)),
            getFuelLogHistory: (args: any) => getAllUserFuelLogs(userId).then(data => data.filter(d => d.vehicleId === vehicle.id)),
        };

        const llmResponse = await vehicleDataChatbotPrompt({
            history: messages,
            vehicle: vehicle,
        }, {
            tools: tools,
            toolChoice: 'auto',
        });
        
        const answerText = llmResponse.text();

        return {
            answer: answerText ?? "Je n'ai pas pu générer de réponse. Veuillez réessayer."
        };
    }
);
