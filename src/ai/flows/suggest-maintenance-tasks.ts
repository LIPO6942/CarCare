'use server';
export const runtime = 'nodejs';
// This file is machine-generated - edit at your own risk!

/**
 * @fileOverview An AI agent that suggests potential maintenance tasks or repairs based on a user-provided description of a car issue.
 *
 * - suggestMaintenanceTasks - A function that handles the suggestion of maintenance tasks.
 * - SuggestMaintenanceTasksInput - The input type for the suggestMaintenanceTasks function.
 * - SuggestMaintenanceTasksOutput - The return type for the suggestMaintenanceTasks function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

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

// Removed provider-specific prompt; we call Groq directly in the flow

const suggestMaintenanceTasksFlow = ai.defineFlow(
  {
    name: 'suggestMaintenanceTasksFlow',
    inputSchema: SuggestMaintenanceTasksInputSchema,
    outputSchema: SuggestMaintenanceTasksOutputSchema,
  },
  async ({ brand, model, issueDescription }) => {
    const apiKey = process.env.GROQ_API_KEY ?? '';
    if (!apiKey) {
      throw new Error("Clé API GROQ manquante. Définissez GROQ_API_KEY dans l'environnement.");
    }
    const system = [
      "Vous êtes un mécanicien expert.",
      "En vous basant sur la description et les informations du véhicule, suggérez une liste de tâches d'entretien ou de réparations potentielles.",
      "La réponse doit être exclusivement en français.",
      "Retournez les tâches sous forme de liste (une par ligne), sans autre texte.",
    ].join(' ');
    const user = `Véhicule: ${brand} ${model}\nDescription du problème: ${issueDescription}`;
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
          temperature: 0.2,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Groq API error ${res.status}: ${errText}`);
      }
      const data = await res.json();
      const content: string = data.choices?.[0]?.message?.content ?? '';
      const suggestedTasks = content
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => line.replace(/^[-*\d.\s]+/, '').trim())
        .filter(Boolean);

      return { suggestedTasks };
    } catch (error: any) {
      console.error("AI Error in suggestMaintenanceTasksFlow:", error);
      const errorMessage = error.message || String(error);
      if (errorMessage.includes('429') || errorMessage.toLowerCase().includes('quota')) {
        throw new Error("La limite de requêtes gratuites pour l'assistant IA a été atteinte pour aujourd'hui. Veuillez réessayer demain.");
      }
      throw new Error("Une erreur est survenue lors de la communication avec l'assistant IA.");
    }
  }
);
