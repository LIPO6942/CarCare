'use server';

/**
 * @fileOverview A simple Genkit flow to answer questions based on provided vehicle data.
 */

import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/googleai';
import { z } from 'genkit';
import type { Part } from '@genkit-ai/googleai';

// Define the schema for chat history messages
const HistorySchema = z.array(z.object({
  role: z.enum(['user', 'model']),
  content: z.array(z.object({ text: z.string() })),
}));

// Define the input schema for the flow
const AnswerFromHistoryInputSchema = z.object({
  history: HistorySchema,
  question: z.string(),
  vehicleDataJson: z.string().describe("A JSON string containing all data for the vehicle."),
});

// Define the output schema for the flow
const AnswerFromHistoryOutputSchema = z.object({
  answer: z.string(),
});

export type AnswerFromHistoryInput = z.infer<typeof AnswerFromHistoryInputSchema>;
export type AnswerFromHistoryOutput = z.infer<typeof AnswerFromHistoryOutputSchema>;

export async function answerFromHistory(input: AnswerFromHistoryInput): Promise<AnswerFromHistoryOutput> {
  return answerFromHistoryFlow(input);
}

const answerFromHistoryFlow = ai.defineFlow(
  {
    name: 'answerFromHistoryFlow',
    inputSchema: AnswerFromHistoryInputSchema,
    outputSchema: AnswerFromHistoryOutputSchema,
  },
  async ({ history, question, vehicleDataJson }) => {

    const systemPrompt = `You are an expert automotive data analyst called "CarCare Copilot".
Your role is to answer questions about a user's vehicle based *only* on the data provided to you in the prompt.
- You will be provided with the complete data for the vehicle (repairs, maintenance, fuel logs) as a JSON string.
- You MUST use this data to answer the user's question. Do not make up information.
- If the data provided is not sufficient to answer, state that you don't have enough information in a helpful way.
- Respond in clear, concise French.
- Today's date is ${new Date().toLocaleDateString('fr-FR')}.`;

    const messages: Part[] = [
        ...history,
        {
          role: 'user',
          content: [{ text: `Here is all the data for the vehicle. Use it to answer my question:\n\n${vehicleDataJson}\n\nQuestion: ${question}` }],
        },
    ];

    const llmResponse = await ai.generate({
      model: googleAI.model('gemini-1.5-flash-latest'),
      system: systemPrompt,
      messages: messages,
    });

    const answer = llmResponse.text;

    return {
      answer: answer ?? "Je n'ai pas pu générer de réponse. Veuillez réessayer.",
    };
  }
);
