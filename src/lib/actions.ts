
'use server';

import { z } from 'zod';
import { addVehicle, addRepair, deleteVehicleById } from './data';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { generateVehicleImage } from '@/ai/flows/generate-vehicle-image';
import { storage } from './firebase';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { v4 as uuidv4 } from 'uuid';

const VehicleSchema = z.object({
  brand: z.string().min(1, 'La marque est requise.'),
  model: z.string().min(1, 'Le modèle est requis.'),
  year: z.coerce.number().min(1900, 'Année invalide.').max(new Date().getFullYear() + 1, 'Année invalide.'),
  licensePlate: z.string().min(1, 'La plaque d\'immatriculation est requise.'),
  fuelType: z.enum(['Essence', 'Diesel', 'Électrique', 'Hybride']),
});

export async function createVehicle(formData: FormData) {
  const validatedFields = VehicleSchema.safeParse({
    brand: formData.get('brand'),
    model: formData.get('model'),
    year: formData.get('year'),
    licensePlate: formData.get('licensePlate'),
    fuelType: formData.get('fuelType'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Champs manquants. Impossible de créer le véhicule.',
    };
  }
  
  let imageUrl = 'https://images.unsplash.com/photo-1553949345-eb786bb3f7ba?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3NDE5ODJ8MHwxfHNlYXJjaHwxfHxDYXIlMjBzaWxob3VldHRlfGVufDB8fHx8MTc1MTM5NjAyOHww&ixlib=rb-4.1.0&q=80&w=1080';
  let imagePath = '';

  // Try to generate and upload an image, but don't fail the whole process if it errors out.
  try {
    const imageDataUri = await generateVehicleImage({
        brand: validatedFields.data.brand,
        model: validatedFields.data.model,
    });
    
    if (imageDataUri.startsWith('data:image')) {
        const path = `vehicle-images/${uuidv4()}.png`;
        const storageRef = ref(storage, path);
        await uploadString(storageRef, imageDataUri, 'data_url');
        imageUrl = await getDownloadURL(storageRef);
        imagePath = path; // Only set imagePath on successful upload
    } else {
        console.warn("AI flow returned a fallback URL, not a data URI.", imageDataUri);
        imageUrl = imageDataUri; 
    }
  } catch (error) {
    // Log the error for debugging but allow vehicle creation to proceed with a placeholder.
    console.error(
        "Erreur lors de la génération ou du téléversement de l'image. " +
        "Le véhicule sera créé avec une image par défaut. " +
        "Veuillez vérifier la configuration de Firebase Storage et les règles de sécurité. Erreur originale:", 
        error
    );
  }

  // Add vehicle to Firestore, regardless of image generation success.
  try {
      await addVehicle({ ...validatedFields.data, imageUrl, imagePath });
  } catch (error) {
      console.error("Firebase Error in createVehicle (addVehicle call):", error);
      if (error instanceof Error) {
        if (String(error).includes('firestore/permission-denied') || String(error).includes('Permission denied')) {
             return { message: 'Permission Refusée par Firestore. Veuillez vérifier que vos règles de sécurité pour Firestore autorisent l\'écriture (write).' };
        }
      }
      return { message: 'Erreur de la base de données: Impossible de créer le véhicule. Consultez la console du terminal pour plus de détails.' };
  }

  revalidatePath('/');
  redirect('/');
}

export async function deleteVehicle(vehicleId: string) {
  if (!vehicleId) {
    return { message: 'ID du véhicule manquant.' };
  }
  
  try {
    await deleteVehicleById(vehicleId);
    revalidatePath('/');
  } catch (error) {
    console.error("Firebase Error in deleteVehicle:", error);
    if (error instanceof Error && (String(error).includes('storage/unauthorized') || String(error).includes('permission-denied'))) {
        return { message: 'Permission Refusée: L\'application n\'a pas la permission de supprimer l\'image du Storage. Veuillez vérifier vos règles de sécurité.' };
    }
    return { message: 'Erreur de la base de données: Impossible de supprimer le véhicule. Consultez la console du terminal pour plus de détails.' };
  }
}

const RepairSchema = z.object({
  vehicleId: z.string(),
  date: z.string().min(1, 'La date est requise.'),
  mileage: z.coerce.number().min(0, 'Le kilométrage doit être positif.'),
  description: z.string().min(1, 'La description est requise.'),
  category: z.string().min(1, 'La catégorie est requise.'),
  cost: z.coerce.number().min(0, 'Le coût doit être positif.'),
});

export async function createRepair(formData: FormData) {
    const validatedFields = RepairSchema.safeParse(Object.fromEntries(formData.entries()));

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Champs manquants. Impossible d\'ajouter la réparation.',
        };
    }

    try {
        await addRepair(validatedFields.data);
    } catch (error) {
        console.error("Firebase Error in createRepair:", error);
        return { message: 'Erreur de la base de données: Impossible d\'ajouter la réparation.' };
    }

    revalidatePath(`/vehicles/${validatedFields.data.vehicleId}`);
}
