import { config } from 'dotenv';
config();

import '@/ai/flows/suggest-maintenance-tasks.ts';
import '@/ai/flows/repair-categorization.ts';
import '@/ai/flows/generate-vehicle-image.ts';
