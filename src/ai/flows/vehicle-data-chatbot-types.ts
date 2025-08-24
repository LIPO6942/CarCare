/**
 * @fileOverview This file contains the types and Zod schemas for the vehicle data chatbot.
 * It is separated from the flow logic to comply with "use server" module constraints.
 */

import { z } from 'genkit';
import type { Vehicle } from '@/lib/types';


export const answerVehicleQuestionInputSchema = z.object({
  userId: z.string(),
  vehicle: z.custom<Vehicle>(),
  history: z.array(z.object({
    role: z.enum(['user', 'model']),
    content: z.string(),
  })),
  question: z.string(),
});
export type answerVehicleQuestionInput = z.infer<typeof answerVehicleQuestionInputSchema>;

export const answerVehicleQuestionOutputSchema = z.object({
  answer: z.string(),
});
export type answerVehicleQuestionOutput = z.infer<typeof answerVehicleQuestionOutputSchema>;
