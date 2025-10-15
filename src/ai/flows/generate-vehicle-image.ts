'use server';
/**
 * @fileOverview An AI agent that generates an image of a vehicle.
 *
 * - generateVehicleImage - A function that generates an image of a vehicle based on brand and model.
 * - GenerateVehicleImageInput - The input type for the generateVehicleImage function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateVehicleImageInputSchema = z.object({
  brand: z.string().describe('The brand of the car.'),
  model: z.string().describe('The model of the car.'),
});
export type GenerateVehicleImageInput = z.infer<typeof GenerateVehicleImageInputSchema>;

export async function generateVehicleImage(
  input: GenerateVehicleImageInput
): Promise<string> {
  return generateVehicleImageFlow(input);
}

const generateVehicleImageFlow = ai.defineFlow(
  {
    name: 'generateVehicleImageFlow',
    inputSchema: GenerateVehicleImageInputSchema,
    outputSchema: z.string(),
  },
  async ({brand, model}) => {
    try {
      const {media} = await ai.generate({
        model: 'googleai/gemini-2.0-flash-preview-image-generation',
        prompt: `Generate a photorealistic image of a ${brand} ${model} car, side view, in a clean, studio-like environment with a neutral background.`,
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
      });

      if (!media?.url) {
        // Fallback to a placeholder if image generation fails
        throw new Error("Image generation returned no media URL.");
      }
      return media.url;
    } catch (error: any) {
      console.error("AI Error in generateVehicleImageFlow:", error);
      const errorMessage = error.message || String(error);
       if (errorMessage.includes('429') || errorMessage.toLowerCase().includes('quota')) {
          throw new Error("La limite de requêtes gratuites pour la génération d'images a été atteinte.");
      }
      // Fallback to a placeholder on any error
      return 'https://placehold.co/600x400.png';
    }
  }
);
