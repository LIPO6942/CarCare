import { genkit } from 'genkit';
import { config } from 'dotenv';

config();

// If a GROQ_API_KEY is provided, map it to the OpenAI-compatible env vars
// and default the base URL to Groq's OpenAI-compatible endpoint. This avoids
// requiring a credit card while keeping the OpenAI plugin working seamlessly.
if (process.env.GROQ_API_KEY && !process.env.OPENAI_API_KEY) {
  process.env.OPENAI_API_KEY = process.env.GROQ_API_KEY;
}
if (!process.env.OPENAI_BASE_URL && process.env.GROQ_API_KEY) {
  process.env.OPENAI_BASE_URL = 'https://api.groq.com/openai/v1';
}

export const ai = genkit({
  plugins: [],
  logLevel: 'debug',
  enableTracing: true,
});
