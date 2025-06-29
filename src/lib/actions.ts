'use server';

import { createSampleDataForUser } from './data';
import { revalidatePath } from 'next/cache';

// NOTE: Most actions have been moved to client components to correctly handle
// Firebase client-side authentication. Server Actions were causing permission
// issues because the user's auth state was not available on the server for the
// Firebase Client SDK.

export async function addSampleData(userId: string) {
  if (!userId) {
    return { message: 'Utilisateur non authentifié.' };
  }
  try {
    await createSampleDataForUser(userId);
  } catch (error) {
    console.error("Firebase Error in addSampleData:", error);
    if ((error as any)?.code === 'permission-denied') {
        return { message: "Erreur de permission. Impossible d'ajouter les données d'exemple." };
    }
    return { message: 'Erreur de la base de données: Impossible d\'ajouter les données d\'exemple.' };
  }
  revalidatePath('/');
}
