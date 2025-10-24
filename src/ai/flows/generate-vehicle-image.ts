'use server';
/**
 * @fileOverview Vehicle image generation replacement using a free, keyless service.
 * Returns a placeholder image with the vehicle's brand and model text overlay.
 */

import { ai } from '@/ai/genkit';
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
    const hfToken = process.env.HUGGINGFACE_API_KEY ?? process.env.HF_API_KEY ?? '';
    const prompt = `Photorealistic side view of a ${brand} ${model} car in a clean studio, neutral background, high detail`;
    const models = [
      'stabilityai/sd-turbo',
      'runwayml/stable-diffusion-v1-5',
    ];

    if (hfToken) {
      for (const m of models) {
        try {
          const res = await fetch(`https://api-inference.huggingface.co/models/${m}`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${hfToken}`,
              'Content-Type': 'application/json',
              'Accept': 'image/png',
            },
            body: JSON.stringify({
              inputs: prompt,
              parameters: {
                negative_prompt: 'text, watermark, logo, people, blurry',
                width: 640,
                height: 400,
                num_inference_steps: m.includes('sd-turbo') ? 4 : 20,
                guidance_scale: 3.5,
              },
            }),
          });
          if (res.ok) {
            const arrayBuffer = await res.arrayBuffer();
            if (arrayBuffer.byteLength > 0) {
              const base64 = Buffer.from(arrayBuffer).toString('base64');
              return `data:image/png;base64,${base64}`;
            }
          } else {
            const err = await res.text();
            console.error(`HF image gen error ${res.status} for ${m}:`, err);
          }
        } catch (e) {
          console.error(`HF image gen network error for ${m}:`, e);
        }
      }
    }

    // Fallback to a placeholder if HF token missing or generation failed
    const text = encodeURIComponent(`${brand} ${model}`);
    return `https://placehold.co/600x400/png?text=${text}`;
  }
);
