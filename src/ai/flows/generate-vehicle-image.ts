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
    const {media} = await ai.generate({
      model: 'googleai/gemini-2.0-flash-preview-image-generation',
      prompt: `Generate a photorealistic image of a ${brand} ${model} car, side view, in a clean, studio-like environment with a neutral background.`,
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    });

    if (!media?.url) {
      // Fallback to a placeholder if image generation fails
      return 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3NDE5ODJ8MHwxfHNlYXJjaHw0fHxDYXJ8ZW58MHx8fHwxNzUyMTk2NzAyfDA&ixlib=rb-4.1.0&q=80&w=1080';
    }

    return media.url;
  }
);
