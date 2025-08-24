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
- You have been provided with the complete data for the vehicle (repairs, maintenance, fuel logs) directly in the conversation history. You MUST use this data to answer the user's question.
- Do not make up information. If the data provided is not sufficient to answer, state that you don't have enough information in a helpful way.
- Respond in clear, concise French.
- Today's date is ${new Date().toLocaleDateString('fr-FR')}.`
                }]
            },
            ...history.map(h => ({ role: h.role as 'user' | 'model', content: [{ text: h.content }] })),
        ];
        
        // Fetch all vehicle data using the service, passing the userId correctly.
        const vehicleData = await getVehicleData(vehicle.id, userId);
        
        // Inject the fetched data directly into the message history for the model to use.
        messages.push({
            role: 'user', // This is a "tool" role in some models, but 'user' works to provide context.
            content: [
                {
                    text: `Here is all the data for the vehicle. Use it to answer my next question:\n${JSON.stringify(vehicleData)}`
                }
            ]
        });

        // Add the user's actual question last.
        messages.push({role: 'user' as const, content: [{text: question}]});


        const llmResponse = await ai.generate({
            model: googleAI.model('gemini-1.5-flash-latest'),
            messages: messages,
        });
        
        const answerText = llmResponse.text;

        return {
            answer: answerText ?? "Je n'ai pas pu générer de réponse. Veuillez réessayer."
        };
    }
);
