'use server';

/**
 * @fileOverview This file contains the Genkit flow for categorizing car repairs.
 *
 * - categorizeRepair - An async function that categorizes a car repair based on user input.
 * - CategorizeRepairInput - The input type for the categorizeRepair function.
 * - CategorizeRepairOutput - The output type for the categorizeRepair function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

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

const categorizeRepairPrompt = ai.definePrompt({
  name: 'categorizeRepairPrompt',
  input: {schema: CategorizeRepairInputSchema},
  output: {schema: CategorizeRepairOutputSchema},
  prompt: `You are an expert automotive technician. Please categorize the following car repair details into one of the following categories: Moteur, Filtres, Bougies, Courroie de distribution, Freins, Électrique, Suspension, Carrosserie, Intérieur, Échappement, Transmission, Pneus, Batterie, Climatisation, Autre. Only respond with the category. 

Repair Details: {{{repairDetails}}}`,
});

const categorizeRepairFlow = ai.defineFlow(
  {
    name: 'categorizeRepairFlow',
    inputSchema: CategorizeRepairInputSchema,
    outputSchema: CategorizeRepairOutputSchema,
  },
  async input => {
    try {
      const {output} = await categorizeRepairPrompt(input);
      return output!;
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
