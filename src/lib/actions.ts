'use server';

import { z } from 'zod';
import { addVehicle, addRepair, deleteVehicleById, addMaintenance, addFuelLog, createSampleDataForUser } from './data';
import { revalidatePath } from 'next/cache';
import { storage } from './firebase';
import { ref, uploadString, getDownloadURL, deleteObject } from 'firebase/storage';

const VehicleSchema = z.object({
  brand: z.string().min(1, 'La marque est requise.'),
  model: z.string().min(1, 'Le modèle est requis.'),
  year: z.coerce.number().min(1900, 'Année invalide.').max(new Date().getFullYear() + 1, 'Année invalide.'),
  licensePlate: z.string().min(1, 'La plaque d\'immatriculation est requise.'),
  fuelType: z.enum(['Essence', 'Diesel', 'Électrique', 'Hybride']),
});

export async function createVehicle(userId: string, formData: FormData) {
  if (!userId) {
     return { message: 'Utilisateur non authentifié.' };
  }

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
      const brandDomain = validatedFields.data.brand.toLowerCase().replace(/ /g, '') + '.com';
      const logoUrl = `https://logo.clearbit.com/${brandDomain}`;

      await addVehicle({ ...validatedFields.data, imageUrl: logoUrl }, userId);
      
  } catch (error) {
      console.error("Firebase Error in createVehicle (addVehicle call):", error);
      return { message: 'Erreur de la base de données: Impossible de créer le véhicule. Consultez la console pour plus de détails.' };
  }

  revalidatePath('/');
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
    return { message: 'Erreur de la base de données: Impossible de supprimer le véhicule.' };
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

export async function createRepair(userId: string, formData: FormData) {
     if (!userId) {
        return { message: 'Utilisateur non authentifié.' };
    }
    const validatedFields = RepairSchema.safeParse(Object.fromEntries(formData.entries()));

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Champs manquants. Impossible d\'ajouter la réparation.',
        };
    }

    try {
        await addRepair(validatedFields.data, userId);
    } catch (error) {
        console.error("Firebase Error in createRepair:", error);
        return { message: 'Erreur de la base de données: Impossible d\'ajouter la réparation.' };
    }

    revalidatePath(`/`);
}

const MaintenanceSchema = z.object({
  vehicleId: z.string(),
  date: z.string().min(1, 'La date est requise.'),
  mileage: z.coerce.number().min(0, 'Le kilométrage doit être positif.'),
  task: z.string().min(1, 'La tâche est requise.'),
  cost: z.coerce.number().min(0, 'Le coût doit être positif.'),
  nextDueDate: z.string().optional(),
  nextDueMileage: z.coerce.number().optional(),
});

export async function createMaintenance(userId: string, formData: FormData) {
     if (!userId) {
        return { message: 'Utilisateur non authentifié.' };
    }
    
    const rawData = Object.fromEntries(formData.entries());
    if (rawData.nextDueDate === '') delete rawData.nextDueDate;
    if (rawData.nextDueMileage === '') delete rawData.nextDueMileage;

    const validatedFields = MaintenanceSchema.safeParse(rawData);

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Champs manquants. Impossible d\'ajouter l\'entretien.',
        };
    }

    try {
        const dataToSave = {
            ...validatedFields.data,
            ...(validatedFields.data.nextDueMileage && { nextDueMileage: Number(validatedFields.data.nextDueMileage) }),
        };
        await addMaintenance(dataToSave, userId);
    } catch (error) {
        console.error("Firebase Error in createMaintenance:", error);
        return { message: 'Erreur de la base de données: Impossible d\'ajouter l\'entretien.' };
    }

    revalidatePath(`/`);
}

const FuelLogSchema = z.object({
    vehicleId: z.string(),
    date: z.string().min(1, 'La date est requise.'),
    mileage: z.coerce.number().min(0, 'Le kilométrage doit être positif.'),
    quantity: z.coerce.number().gt(0, 'La quantité doit être supérieure à 0.'),
    pricePerLiter: z.coerce.number().gt(0, 'Le prix par litre doit être supérieur à 0.'),
    totalCost: z.coerce.number().min(0, 'Le coût total doit être positif.'),
});

export async function createFuelLog(userId: string, formData: FormData) {
     if (!userId) {
        return { message: 'Utilisateur non authentifié.' };
    }
    const validatedFields = FuelLogSchema.safeParse(Object.fromEntries(formData.entries()));

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Champs manquants. Impossible d\'ajouter le plein.',
        };
    }

    try {
        await addFuelLog(validatedFields.data, userId);
    } catch (error) {
        console.error("Firebase Error in createFuelLog:", error);
        return { message: 'Erreur de la base de données: Impossible d\'ajouter le plein.' };
    }

    revalidatePath(`/`);
}

export async function addSampleData(userId: string) {
  if (!userId) {
    return { message: 'Utilisateur non authentifié.' };
  }
  try {
    await createSampleDataForUser(userId);
  } catch (error) {
    console.error("Firebase Error in addSampleData:", error);
    return { message: 'Erreur de la base de données: Impossible d\'ajouter les données d\'exemple.' };
  }
  revalidatePath('/');
}
