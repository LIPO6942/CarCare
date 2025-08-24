'use server';

/**
 * @fileOverview A chatbot flow that can answer questions about a user's vehicle data.
 * It manually fetches all vehicle data and injects it into the prompt context.
 */

import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/googleai';
import type { answerVehicleQuestionInput, answerVehicleQuestionOutput } from './vehicle-data-chatbot-types';
import { answerVehicleQuestionInputSchema, answerVehicleQuestionOutputSchema } from './vehicle-data-chatbot-types';
import { getVehicleData } from '@/ai/services/vehicle-data-service';
import { getVehicleById } from '@/lib/data';


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
        const { vehicleId, history, question, userId } = input;
        
        const vehicle = await getVehicleById(vehicleId);

        if (!vehicle) {
            return {
                answer: "Je n'ai pas pu trouver les informations pour le véhicule sélectionné. Veuillez réessayer."
            };
        }

        const vehicleData = await getVehicleData(vehicle.id, userId);

        const llmResponse = await ai.generate({
            model: googleAI.model('gemini-1.5-flash-latest'),
            system: `You are an expert automotive data analyst called "CarCare Copilot".
Your role is to answer questions about a user's vehicle based on the data provided to you.
- You will be provided with the complete data for the vehicle (repairs, maintenance, fuel logs) as part of the user's question.
- You MUST use this data to answer the user's question. Do not make up information. If the data provided is not sufficient to answer, state that you don't have enough information in a helpful way.
- Respond in clear, concise French.
- Today's date is ${new Date().toLocaleDateString('fr-FR')}.`,
            messages: [
                // Spread the existing conversation history
                ...history,
                // Add the user's new question, but prepend it with the vehicle data context
                { 
                    role: 'user', 
                    content: [
                        { text: `Here is all the data for the ${vehicle.brand} ${vehicle.model} (${vehicle.year}). Use it to answer my question:\n\n${JSON.stringify(vehicleData, null, 2)}\n\nQuestion: ${question}` }
                    ] 
                }
            ],
        });
        
        const answerText = llmResponse.text;

        return {
            answer: answerText ?? "Je n'ai pas pu générer de réponse. Veuillez réessayer."
        };
    }
);
