'use server';

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
        // Call Groq Chat Completions with graceful model fallback
        let answer: string | undefined;
        const apiKey = process.env.GROQ_API_KEY ?? '';
        const tryModels = [
          'llama-3.1-8b-instant',
          'llama3-8b-8192',
          'llama3-70b-8192',
          'mixtral-8x7b-32768',
        ];
        for (const model of tryModels) {
          try {
            const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model,
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
              break;
            } else {
              const errText = await res.text();
              console.error(`Groq API error ${res.status} for model ${model}:`, errText);
              // try next model if available
            }
          } catch (err) {
            console.error(`Groq request failed for model ${model}:`, err);
            // try next model if available
          }
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
