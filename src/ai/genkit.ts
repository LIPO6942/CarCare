import {genkit, Plugin} from 'genkit';
import {googleAI, GoogleAIPlugin} from '@genkit-ai/googleai';

// Déclarez explicitement que googleAI() retourne un Plugin<GoogleAIPlugin>
const googleAIPlugin: Plugin<GoogleAIPlugin> = googleAI();

export const ai = genkit({
  plugins: [googleAIPlugin],
});
