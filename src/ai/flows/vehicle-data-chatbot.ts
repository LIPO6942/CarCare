'use server';

/**
 * @fileOverview A chatbot flow that can answer questions about a user's vehicle data.
 * It uses a dedicated tool to fetch all vehicle data at once.
 */

import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/googleai';
import type { answerVehicleQuestionInput, answerVehicleQuestionOutput } from './vehicle-data-chatbot-types';
import { answerVehicleQuestionInputSchema, answerVehicleQuestionOutputSchema } from './vehicle-data-chatbot-types';
import { getVehicleDataTool } from '@/ai/tools/get-vehicle-data-tool';

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
        
        const messages = [
            {
                role: 'system' as const,
                content: [{
                    text: `You are an expert automotive data analyst called "CarCare Copilot". Your role is to answer questions about a user's vehicle based on their data.
- The user is asking about their ${vehicle.brand} ${vehicle.model} (${vehicle.year}).
- You MUST use the 'getVehicleData' tool to retrieve all the vehicle's data (repairs, maintenance, fuel logs) before answering. This tool requires the 'vehicleId'.
- You MUST use this provided vehicleId: '${vehicle.id}'.
- If you don't have enough information from the tool's result, ask the user to add more data to their logs. For example, if they ask about insurance but the maintenance log is empty, tell them to add their insurance payment history.
- Base your calculations and answers *only* on the data provided by the tool. Do not make up information.
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
            tools: [getVehicleDataTool],
        });
        
        const answerText = llmResponse.text;

        return {
            answer: answerText ?? "Je n'ai pas pu générer de réponse. Veuillez réessayer."
        };
    }
);
