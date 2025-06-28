'use server';

import { z } from 'zod';
import { addVehicle, addRepair, deleteVehicleById } from './data';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

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
  
  try {
    await addVehicle(validatedFields.data);
  } catch (error) {
    console.error("Firebase Error in createVehicle:", error);
    return { message: 'Erreur de la base de données: Impossible de créer le véhicule.' };
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
  } catch (error) {
    console.error("Firebase Error in deleteVehicle:", error);
    return { message: 'Erreur de la base de données: Impossible de supprimer le véhicule.' };
  }

  revalidatePath('/');
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
