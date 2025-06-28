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
  issueDescription: z.string().describe('A description of the issue the user is experiencing with their car.'),
});
export type SuggestMaintenanceTasksInput = z.infer<typeof SuggestMaintenanceTasksInputSchema>;

const SuggestMaintenanceTasksOutputSchema = z.object({
  suggestedTasks: z.array(z.string()).describe('A list of potential maintenance tasks or repairs that might be needed.'),
});
export type SuggestMaintenanceTasksOutput = z.infer<typeof SuggestMaintenanceTasksOutputSchema>;

export async function suggestMaintenanceTasks(input: SuggestMaintenanceTasksInput): Promise<SuggestMaintenanceTasksOutput> {
  return suggestMaintenanceTasksFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestMaintenanceTasksPrompt',
  input: {schema: SuggestMaintenanceTasksInputSchema},
  output: {schema: SuggestMaintenanceTasksOutputSchema},
  prompt: `You are an expert mechanic. A user will describe an issue they are experiencing with their car.
Based on the description, suggest a list of potential maintenance tasks or repairs that might be needed. Return the tasks as a numbered list.

Description: {{{issueDescription}}}`,
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
