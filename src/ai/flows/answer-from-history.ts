'use server';
export const runtime = 'nodejs';

/**
 * @fileOverview A simple Genkit flow to answer questions based on provided vehicle data.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

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
- ALL CURRENCY VALUES MUST BE IN TND (Tunisian Dinar).
- Today's date is ${new Date().toLocaleDateString('fr-FR')}.`;

    const messages = [
        ...history,
        {
          role: 'user',
          content: [{ text: `Here is all the data for the vehicle. Use it to answer my question:\n\n${vehicleDataJson}\n\nQuestion: ${question}` }],
        },
    ];
    
    try {
        // Use a minimal adapter: when model contains 'openai/groq', route via fetch
        let answer: string | undefined;
        try {
          const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.GROQ_API_KEY ?? ''}`,
            },
            body: JSON.stringify({
              model: 'llama-3.1-70b-versatile',
              messages: [
                { role: 'system', content: systemPrompt },
                ...messages.map((m: any) => ({
                  role: m.role === 'model' ? 'assistant' : m.role,
                  content: m.content?.map((c: any) => c.text).filter(Boolean).join('\n') ?? '',
                })),
              ],
              temperature: 0.2,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            answer = data.choices?.[0]?.message?.content;
          } else {
            const errText = await res.text();
            throw new Error(`Groq API error ${res.status}: ${errText}`);
          }
        } catch (e) {
          console.error('Groq call failed, falling back to Genkit generate if configured:', e);
          const llmResponse = await ai.generate({ model: 'openai/groq-llama-3.1-70b', system: systemPrompt, messages });
          answer = llmResponse.text;
        }
        
        return {
          answer: answer ?? "Je n'ai pas pu générer de réponse. Veuillez réessayer.",
        };
    } catch (error: any) {
        console.error("AI Error in answerFromHistoryFlow:", error);
        
        const errorMessage = error.message || String(error);
        if (errorMessage.includes('429') || errorMessage.toLowerCase().includes('quota')) {
             return {
                answer: "Désolé, la limite de requêtes gratuites pour l'assistant IA a été atteinte pour aujourd'hui. Veuillez réessayer demain."
             }
        }
        
        return {
            answer: "Une erreur est survenue en contactant l'assistant IA. Veuillez réessayer."
        }
    }
  }
);
