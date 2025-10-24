'use server';
export const runtime = 'nodejs';
/**
 * @fileOverview Vehicle image generation replacement using a free, keyless service.
 * Returns a placeholder image with the vehicle's brand and model text overlay.
 */

import { z } from 'genkit';

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
  async ({ brand, model }) => {
    const text = encodeURIComponent(`${brand} ${model}`);
    // Free, keyless placeholder image with overlay text
    return `https://placehold.co/600x400/png?text=${text}`;
  }
);
