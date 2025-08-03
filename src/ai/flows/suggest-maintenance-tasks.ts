// This file is machine-generated - edit at your own risk!

'use server';

/**
 * @fileOverview An AI agent that suggests potential maintenance tasks or repairs based on a user-provided description of a car issue.
 *
 * - suggestMaintenanceTasks - A function that handles the suggestion of maintenance tasks.
 * - SuggestMaintenanceTasksInput - The input type for the suggestMaintenanceTasks function.
 * - SuggestMaintenanceTasksOutput - The return type for the suggestMaintenanceTasks function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestMaintenanceTasksInputSchema = z.object({
  brand: z.string().describe("La marque de la voiture."),
  model: z.string().describe("Le modèle de la voiture."),
  issueDescription: z.string().describe('Une description du problème que l\'utilisateur rencontre avec sa voiture.'),
});
export type SuggestMaintenanceTasksInput = z.infer<typeof SuggestMaintenanceTasksInputSchema>;

const SuggestMaintenanceTasksOutputSchema = z.object({
  suggestedTasks: z.array(z.string()).describe('Une liste de tâches d\'entretien ou de réparations potentielles qui pourraient être nécessaires.'),
});
export type SuggestMaintenanceTasksOutput = z.infer<typeof SuggestMaintenanceTasksOutputSchema>;

export async function suggestMaintenanceTasks(input: SuggestMaintenanceTasksInput): Promise<SuggestMaintenanceTasksOutput> {
  return suggestMaintenanceTasksFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestMaintenanceTasksPrompt',
  input: {schema: SuggestMaintenanceTasksInputSchema},
  output: {schema: SuggestMaintenanceTasksOutputSchema},
  prompt: `Vous êtes un mécanicien expert. Un utilisateur décrira un problème qu'il rencontre avec sa voiture.
En vous basant sur la description et les informations du véhicule, suggérez une liste de tâches d'entretien ou de réparations potentielles qui pourraient être nécessaires. Prenez en compte la marque et le modèle pour des diagnostics plus spécifiques si possible.
La réponse doit être exclusivement en français. Retournez les tâches sous forme de liste.

Véhicule: {{{brand}}} {{{model}}}
Description du problème: {{{issueDescription}}}`,
});

const suggestMaintenanceTasksFlow = ai.defineFlow(
  {
    name: 'suggestMaintenanceTasksFlow',
    inputSchema: SuggestMaintenanceTasksInputSchema,
    outputSchema: SuggestMaintenanceTasksOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
