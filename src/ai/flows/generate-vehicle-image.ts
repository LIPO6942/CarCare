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
    const seed = Date.now();
    const basePrompt = `Photorealistic ${brand} ${model} car, side view, clean studio, neutral background, high detail, 8k, realistic lighting, no text`;

    // 1) Try Pollinations (free, no key) and proxy result as data URL
    try {
      const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(basePrompt)}?width=640&height=400&nologo=true&seed=${seed}`;
      const res = await fetch(pollinationsUrl, { headers: { 'Accept': 'image/*' } });
      if (res.ok && (res.headers.get('content-type') || '').startsWith('image/')) {
        const arrayBuffer = await res.arrayBuffer();
        if (arrayBuffer.byteLength > 0) {
          const mime = res.headers.get('content-type') || 'image/png';
          const base64 = Buffer.from(arrayBuffer).toString('base64');
          return `data:${mime};base64,${base64}`;
        }
      } else {
        const errText = await res.text().catch(() => '');
        console.error('Pollinations returned non-image response:', res.status, errText);
      }
    } catch (e) {
      console.error('Pollinations request failed:', e);
    }

    // 2) Try Hugging Face (requires free token, no card)
    try {
      const hfToken = process.env.HUGGINGFACE_API_KEY ?? process.env.HF_API_KEY ?? '';
      if (hfToken) {
        const hfModels = [
          'black-forest-labs/FLUX.1-dev',
          'stabilityai/sd-turbo',
          'runwayml/stable-diffusion-v1-5',
        ];
        const payload = (modelId: string) => ({
          inputs: basePrompt,
          parameters: {
            negative_prompt: 'text, watermark, logo, people, blurry',
            width: 640,
            height: 400,
            num_inference_steps: modelId.includes('sd-turbo') ? 4 : 20,
            guidance_scale: 3.5,
            generator: seed,
          },
        });
        for (const modelId of hfModels) {
          try {
            const res = await fetch(`https://api-inference.huggingface.co/models/${modelId}`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${hfToken}`,
                'Content-Type': 'application/json',
                'Accept': 'image/png',
              },
              body: JSON.stringify(payload(modelId)),
            });
            if (res.ok && (res.headers.get('content-type') || '').startsWith('image/')) {
              const arrayBuffer = await res.arrayBuffer();
              if (arrayBuffer.byteLength > 0) {
                const mime = res.headers.get('content-type') || 'image/png';
                const base64 = Buffer.from(arrayBuffer).toString('base64');
                return `data:${mime};base64,${base64}`;
              }
            } else {
              const errText = await res.text().catch(() => '');
              console.error(`HF image gen error ${res.status} for ${modelId}:`, errText);
            }
          } catch (e) {
            console.error(`HF image gen network error for ${modelId}:`, e);
          }
        }
      }
    } catch (e) {
      console.error('HF image generation fallback failed:', e);
    }

    // Fallback to a placeholder if HF token missing or generation failed
    const text = encodeURIComponent(`${brand} ${model}`);
    return `https://placehold.co/600x400/png?text=${text}`;
  }
);
