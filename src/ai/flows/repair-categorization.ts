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
      'The categorized type of repair (e.g., engine, brakes, electrical, suspension, body, interior, exhaust, transmission, or other).'
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
  prompt: `You are an expert automotive technician. Please categorize the following car repair details into one of the following categories: engine, brakes, electrical, suspension, body, interior, exhaust, transmission, or other. Only respond with the category. 

Repair Details: {{{repairDetails}}}`,
});

const categorizeRepairFlow = ai.defineFlow(
  {
    name: 'categorizeRepairFlow',
    inputSchema: CategorizeRepairInputSchema,
    outputSchema: CategorizeRepairOutputSchema,
  },
  async input => {
    const {output} = await categorizeRepairPrompt(input);
    return output!;
  }
);
