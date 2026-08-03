'use server';
/**
 * @fileOverview Vehicle image generation replacement using free, keyless AI & search services.
 * Returns a photorealistic image or SVG vector preview of the vehicle.
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

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
};

async function fetchAsDataUrl(url: string, customHeaders: Record<string, string> = {}, timeoutMs = 15000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      headers: { ...DEFAULT_HEADERS, ...customHeaders },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    
    if (res.ok && (res.headers.get('content-type') || '').startsWith('image/')) {
      const arrayBuffer = await res.arrayBuffer();
      if (arrayBuffer.byteLength > 1000) {
        const mime = res.headers.get('content-type') || 'image/jpeg';
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        return `data:${mime};base64,${base64}`;
      }
    }
  } catch (e) {
    // Ignore fetch errors to try fallback
  }
  return null;
}

async function fetchWikimediaCarPhoto(brand: string, model: string): Promise<string | null> {
  try {
    const query = encodeURIComponent(`${brand} ${model}`);
    const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${query}&gsrnamespace=6&prop=imageinfo&iiprop=url|mime&iiurlwidth=800&format=json&origin=*`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(searchUrl, { 
      headers: DEFAULT_HEADERS,
      signal: controller.signal 
    });
    clearTimeout(timeoutId);
    
    if (res.ok) {
      const data = await res.json();
      const pages = data?.query?.pages;
      if (pages) {
        for (const pageId of Object.keys(pages)) {
          const imageinfo = pages[pageId]?.imageinfo?.[0];
          if (imageinfo && (imageinfo.mime?.startsWith('image/jpeg') || imageinfo.mime?.startsWith('image/png') || imageinfo.mime?.startsWith('image/webp'))) {
            const imageUrl = imageinfo.thumburl || imageinfo.url;
            const dataUrl = await fetchAsDataUrl(imageUrl, {}, 10000);
            if (dataUrl) return dataUrl;
          }
        }
      }
    }
  } catch (e) {
    console.error('Wikimedia photo search failed:', e);
  }
  return null;
}

function createSvgVehicleCard(brand: string, model: string): string {
  const cleanBrand = brand || 'Véhicule';
  const cleanModel = model || 'CarCare Pro';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0f172a"/>
        <stop offset="50%" stop-color="#1e293b"/>
        <stop offset="100%" stop-color="#0f172a"/>
      </linearGradient>
      <linearGradient id="carGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#3b82f6"/>
        <stop offset="100%" stop-color="#1d4ed8"/>
      </linearGradient>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="12" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>
    <rect width="800" height="500" rx="16" fill="url(#bg)"/>
    <g transform="translate(150, 120)">
      <path d="M 50 140 C 90 140, 110 80, 180 70 L 320 70 C 370 70, 420 100, 450 140 L 480 140 C 495 140, 500 155, 490 170 L 470 190 C 460 200, 40 200, 30 190 L 10 170 C 0 155, 5 140, 20 140 Z" fill="url(#carGrad)" opacity="0.9" filter="url(#glow)"/>
      <path d="M 175 75 L 315 75 C 350 75, 380 95, 400 120 L 130 120 C 150 95, 160 75, 175 75 Z" fill="#93c5fd" opacity="0.45"/>
      <circle cx="120" cy="190" r="35" fill="#0f172a" stroke="#60a5fa" stroke-width="6"/>
      <circle cx="120" cy="190" r="14" fill="#94a3b8"/>
      <circle cx="380" cy="190" r="35" fill="#0f172a" stroke="#60a5fa" stroke-width="6"/>
      <circle cx="380" cy="190" r="14" fill="#94a3b8"/>
    </g>
    <text x="400" y="380" text-anchor="middle" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="34" font-weight="700" letter-spacing="1.5">${cleanBrand.toUpperCase()}</text>
    <text x="400" y="420" text-anchor="middle" fill="#60a5fa" font-family="system-ui, -apple-system, sans-serif" font-size="24" font-weight="500">${cleanModel}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
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

    // 1) Try Pollinations AI with User-Agent & Accept headers
    try {
      const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(basePrompt)}?width=1024&height=768&nologo=true&seed=${seed}&model=flux`;
      const dataUrl = await fetchAsDataUrl(pollinationsUrl, {}, 25000);
      if (dataUrl) return dataUrl;
    } catch (e) {
      console.error('Pollinations AI attempt 1 failed:', e);
    }

    // 2) Try Wikimedia Commons Real Car Photo Search
    try {
      const wikiPhoto = await fetchWikimediaCarPhoto(brand, model);
      if (wikiPhoto) return wikiPhoto;
    } catch (e) {
      console.error('Wikimedia fallback failed:', e);
    }

    // 3) Try Hugging Face API if key is present
    try {
      const hfToken = process.env.HUGGINGFACE_API_KEY ?? process.env.HF_API_KEY ?? '';
      if (hfToken) {
        const hfModels = [
          'stabilityai/stable-diffusion-xl-base-1.0',
          'black-forest-labs/FLUX.1-schnell',
        ];
        for (const modelId of hfModels) {
          const dataUrl = await fetchAsDataUrl(
            `https://router.huggingface.co/hf-inference/models/${modelId}`,
            {
              'Authorization': `Bearer ${hfToken}`,
              'Content-Type': 'application/json',
            },
            30000
          );
          if (dataUrl) return dataUrl;
        }
      }
    } catch (e) {
      console.error('HF image generation failed:', e);
    }

    // 4) Try Alternative Pollinations Prompt
    try {
      const altPrompt = encodeURIComponent(`${brand} ${model} automobile car photo`);
      const alternativeUrl = `https://image.pollinations.ai/prompt/${altPrompt}?width=800&height=600&seed=${seed}&nologo=true`;
      const dataUrl = await fetchAsDataUrl(alternativeUrl, {}, 20000);
      if (dataUrl) return dataUrl;
    } catch (e) {
      console.error('Alternative Pollinations failed:', e);
    }

    // 5) Fallback to custom SVG Vehicle Card
    return createSvgVehicleCard(brand, model);
  }
);

