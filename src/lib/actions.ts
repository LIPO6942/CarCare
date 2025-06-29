'use server';

import { z } from 'zod';
import { addVehicle, addRepair, deleteVehicleById, addMaintenance, addFuelLog, createSampleDataForUser } from './data';
import { revalidatePath } from 'next/cache';
import { storage } from './firebase';
import { ref, uploadString, getDownloadURL, deleteObject } from 'firebase/storage';

const VehicleSchema = z.object({
  userId: z.string().min(1, "L'identifiant utilisateur est manquant."),
  brand: z.string().min(1, 'La marque est requise.'),
  model: z.string().min(1, 'Le modèle est requis.'),
  year: z.coerce.number().min(1900, 'Année invalide.').max(new Date().getFullYear() + 1, 'Année invalide.'),
  licensePlate: z.string().min(1, 'La plaque d\'immatriculation est requise.'),
  fuelType: z.enum(['Essence', 'Diesel', 'Électrique', 'Hybride']),
});

export async function createVehicle(formData: FormData) {
  const validatedFields = VehicleSchema.safeParse(Object.fromEntries(formData.entries()));

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Champs manquants. Impossible de créer le véhicule.',
    };
  }

  const { userId, ...vehicleData } = validatedFields.data;

  try {
      const brandDomain = vehicleData.brand.toLowerCase().replace(/ /g, '') + '.com';
      const logoUrl = `https://logo.clearbit.com/${brandDomain}`;

      await addVehicle({ ...vehicleData, imageUrl: logoUrl }, userId);
      
  } catch (error) {
      console.error("Firebase Error in createVehicle (addVehicle call):", error);
      if ((error as any)?.code === 'permission-denied') {
        return { message: "Erreur de permission lors de la création du véhicule. Veuillez vérifier que vos règles de sécurité Firestore sont correctement configurées et publiées." };
      }
      return { message: 'Erreur de la base de données: Impossible de créer le véhicule.' };
  }

  revalidatePath('/');
}

export async function deleteVehicle(vehicleId: string, userId: string) {
  if (!vehicleId) {
    return { message: 'ID du véhicule manquant.' };
  }
  if (!userId) {
    return { message: 'ID utilisateur manquant.' };
  }
  
  try {
    await deleteVehicleById(vehicleId);
    revalidatePath('/');
  } catch (error) {
    console.error("Firebase Error in deleteVehicle:", error);
    if ((error as any)?.code === 'permission-denied' || (error as Error).message.includes('Permission denied')) {
        return { message: "Erreur de permission lors de la suppression. Veuillez vérifier vos règles de sécurité Firestore." };
    }
    return { message: 'Erreur de la base de données: Impossible de supprimer le véhicule.' };
  }
}

const RepairSchema = z.object({
  userId: z.string().min(1, "L'identifiant utilisateur est manquant."),
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
    
    const { userId, ...repairData } = validatedFields.data;

    try {
        await addRepair(repairData, userId);
    } catch (error) {
        console.error("Firebase Error in createRepair:", error);
        if ((error as any)?.code === 'permission-denied') {
            return { message: "Erreur de permission. Impossible d'ajouter la réparation." };
        }
        return { message: 'Erreur de la base de données: Impossible d\'ajouter la réparation.' };
    }

    revalidatePath(`/`);
}

const MaintenanceSchema = z.object({
  userId: z.string().min(1, "L'identifiant utilisateur est manquant."),
  vehicleId: z.string(),
  date: z.string().min(1, 'La date est requise.'),
  mileage: z.coerce.number().min(0, 'Le kilométrage doit être positif.'),
  task: z.string().min(1, 'La tâche est requise.'),
  cost: z.coerce.number().min(0, 'Le coût doit être positif.'),
  nextDueDate: z.string().optional(),
  nextDueMileage: z.coerce.number().optional(),
});

export async function createMaintenance(formData: FormData) {
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
    
    const { userId, ...maintenanceData } = validatedFields.data;

    try {
        const dataToSave = {
            ...maintenanceData,
            ...(maintenanceData.nextDueMileage && { nextDueMileage: Number(maintenanceData.nextDueMileage) }),
        };
        await addMaintenance(dataToSave, userId);
    } catch (error) {
        console.error("Firebase Error in createMaintenance:", error);
        if ((error as any)?.code === 'permission-denied') {
            return { message: "Erreur de permission. Impossible d'ajouter l'entretien." };
        }
        return { message: 'Erreur de la base de données: Impossible d\'ajouter l\'entretien.' };
    }

    revalidatePath(`/`);
}

const FuelLogSchema = z.object({
    userId: z.string().min(1, "L'identifiant utilisateur est manquant."),
    vehicleId: z.string(),
    date: z.string().min(1, 'La date est requise.'),
    mileage: z.coerce.number().min(0, 'Le kilométrage doit être positif.'),
    quantity: z.coerce.number().gt(0, 'La quantité doit être supérieure à 0.'),
    pricePerLiter: z.coerce.number().gt(0, 'Le prix par litre doit être supérieur à 0.'),
    totalCost: z.coerce.number().min(0, 'Le coût total doit être positif.'),
});

export async function createFuelLog(formData: FormData) {
    const validatedFields = FuelLogSchema.safeParse(Object.fromEntries(formData.entries()));

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Champs manquants. Impossible d\'ajouter le plein.',
        };
    }
    
    const { userId, ...fuelLogData } = validatedFields.data;

    try {
        await addFuelLog(fuelLogData, userId);
    } catch (error) {
        console.error("Firebase Error in createFuelLog:", error);
        if ((error as any)?.code === 'permission-denied') {
            return { message: "Erreur de permission. Impossible d'ajouter le plein." };
        }
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
    if ((error as any)?.code === 'permission-denied') {
        return { message: "Erreur de permission. Impossible d'ajouter les données d'exemple." };
    }
    return { message: 'Erreur de la base de données: Impossible d\'ajouter les données d\'exemple.' };
  }
  revalidatePath('/');
}
