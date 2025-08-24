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
import type { Tool } from 'genkit/action';

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
        const { vehicle, history, question } = input;
        
        const messages = [
            {
                role: 'system' as const,
                content: [{
                    text: `You are an expert automotive data analyst called "CarCare Copilot". Your role is to answer questions about a user's vehicle based on their data.
- The user is asking about their ${vehicle.brand} ${vehicle.model} (${vehicle.year}).
- You MUST use the tools provided to you to answer the user's question.
- Do not make up information. If the data from the tool is not sufficient, ask the user to add more data to their vehicle logs.
- Respond in clear, concise French.
- Today's date is ${new Date().toLocaleDateString('fr-FR')}.`
                }]
            },
            ...history.map(h => ({ role: h.role as 'user' | 'model', content: [{ text: h.content }] })),
            {role: 'user' as const, content: [{text: question}]},
        ];

        // Call the tool manually within the flow and provide its output to the model.
        // This is a more robust pattern than relying on the model to call the tool with the right parameters.
        const toolResult = await getVehicleDataTool({ vehicleId: vehicle.id });
        
        messages.push({
            role: 'user', // This is a "tool" role in some models, but 'user' works to provide context.
            content: [
                {
                    text: `Here is the data for the vehicle. Use it to answer my question:\n${JSON.stringify(toolResult)}`
                }
            ]
        });

        const llmResponse = await ai.generate({
            model: googleAI.model('gemini-1.5-flash-latest'),
            messages: messages,
            // We no longer need to provide the tool to the model, as we are calling it ourselves.
        });
        
        const answerText = llmResponse.text;

        return {
            answer: answerText ?? "Je n'ai pas pu générer de réponse. Veuillez réessayer."
        };
    }
);
