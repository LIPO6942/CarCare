'use server';
export const runtime = 'nodejs';

/**
 * @fileOverview This file contains the Genkit flow for categorizing car repairs.
 *
 * - categorizeRepair - An async function that categorizes a car repair based on user input.
 * - CategorizeRepairInput - The input type for the categorizeRepair function.
 * - CategorizeRepairOutput - The output type for the categorizeRepair function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const CategorizeRepairInputSchema = z.object({
  repairDetails: z
    .string()
    .describe('Detailed description of the car repair or maintenance task.'),
});
export type CategorizeRepairInput = z.infer<typeof CategorizeRepairInputSchema>;

const CategorizeRepairOutputSchema = z.object({
  category: z
    .string()
    .describe(
      'The categorized type of repair (e.g., Moteur, Filtres, Bougies, Courroie de distribution, Freins, Électrique, Suspension, Carrosserie, Intérieur, Échappement, Transmission, Pneus, Batterie, Climatisation, Autre).'
    ),
});
export type CategorizeRepairOutput = z.infer<typeof CategorizeRepairOutputSchema>;

export async function categorizeRepair(input: CategorizeRepairInput): Promise<CategorizeRepairOutput> {
  return categorizeRepairFlow(input);
}

// We call Groq's OpenAI-compatible API directly in the flow

const categorizeRepairFlow = ai.defineFlow(
  {
    name: 'categorizeRepairFlow',
    inputSchema: CategorizeRepairInputSchema,
    outputSchema: CategorizeRepairOutputSchema,
  },
  async ({ repairDetails }) => {
    const apiKey = process.env.GROQ_API_KEY ?? '';
    if (!apiKey) {
      throw new Error("Clé API GROQ manquante. Définissez GROQ_API_KEY dans l'environnement.");
    }
    const system = 'Vous êtes un technicien automobile expert. Répondez uniquement par l\'une des catégories: Moteur, Filtres, Bougies, Courroie de distribution, Freins, Électrique, Suspension, Carrosserie, Intérieur, Échappement, Transmission, Pneus, Batterie, Climatisation, Autre.';
    const user = `Repair Details: ${repairDetails}`;
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.1-70b-versatile',
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: 0,
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Groq API error ${res.status}: ${errText}`);
      }
      const data = await res.json();
      const content: string = data.choices?.[0]?.message?.content ?? '';
      const category = content.trim().split(/\r?\n/)[0];
      return { category };
    } catch (error: any) {
      console.error("AI Error in categorizeRepairFlow:", error);
      const errorMessage = error.message || String(error);
      if (errorMessage.includes('429') || errorMessage.toLowerCase().includes('quota')) {
        throw new Error("La limite de requêtes gratuites pour l'assistant IA a été atteinte pour aujourd'hui.");
      }
      throw new Error("Une erreur est survenue lors de la communication avec l'assistant IA.");
    }
  }
);
