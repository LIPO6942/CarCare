import { db, storage } from './firebase';
import {
  collection,
  getDocs,
  getDoc,
  doc,
  addDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import type { Vehicle, Repair, Maintenance, FuelLog, Deadline } from './types';

function docToType<T>(document: any): T {
    const data = document.data();
    // Convert Firestore Timestamps to ISO strings for any 'date' or 'due' fields.
    // This makes them JSON-serializable and usable by `new Date()`.
    for (const key in data) {
        if (data[key] instanceof Timestamp) {
            data[key] = data[key].toDate().toISOString();
        }
    }
    return {
        id: document.id,
        ...data,
    } as T;
}

export async function getVehicles(userId: string): Promise<Vehicle[]> {
  try {
    const vehiclesCol = collection(db, 'vehicles');
    const q = query(vehiclesCol, where('userId', '==', userId));
    const vehicleSnapshot = await getDocs(q);
    const vehicleList = vehicleSnapshot.docs.map(d => docToType<Vehicle>(d));
    // Trier côté client pour éviter d'avoir besoin d'un index composite sur Firestore
    vehicleList.sort((a, b) => (a.brand || '').localeCompare(b.brand || ''));
    return vehicleList;
  } catch (error) {
    console.error("Firebase error fetching vehicles for user. Returning empty array.", error);
    return [];
  }
}

export async function getVehicleById(id: string): Promise<Vehicle | undefined> {
  try {
    const vehicleRef = doc(db, 'vehicles', id);
    const vehicleSnap = await getDoc(vehicleRef);
    if (vehicleSnap.exists()) {
      return docToType<Vehicle>(vehicleSnap);
    }
    return undefined;
  } catch (error) {
    console.error(`Firebase error fetching vehicle ${id}.`, error);
    return undefined;
  }
}

export async function addVehicle(vehicleData: Omit<Vehicle, 'id' | 'userId'>, userId: string): Promise<Vehicle> {
    const docRef = await addDoc(collection(db, 'vehicles'), { ...vehicleData, userId });
    return {
        id: docRef.id,
        userId,
        ...vehicleData,
    };
}


export async function deleteVehicleById(id: string): Promise<void> {
  const vehicleRef = doc(db, 'vehicles', id);
  // Pour le débogage, nous ne supprimons que le document de la base de données pour isoler les erreurs de permission.
  // La suppression de l'image du stockage est temporairement désactivée.
  await deleteDoc(vehicleRef);
}

async function getSubCollectionForVehicle<T>(vehicleId: string, userId: string, collectionName: string, dateField: string = 'date', sortOrder: 'asc' | 'desc' = 'desc'): Promise<T[]> {
    try {
        const colRef = collection(db, collectionName);
        const q = query(colRef, where('vehicleId', '==', vehicleId), where('userId', '==', userId));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(d => docToType<T>(d));

        data.sort((a: any, b: any) => {
            const dateA = a[dateField] ? new Date(a[dateField]).getTime() : 0;
            const dateB = b[dateField] ? new Date(b[dateField]).getTime() : 0;

            const validA = isNaN(dateA) ? 0 : dateA;
            const validB = isNaN(dateB) ? 0 : dateB;

            return sortOrder === 'desc' ? validB - validA : validA - validB;
        });
        return data;

    } catch (error) {
        console.error(`Firebase error fetching ${collectionName} for ${vehicleId}. Returning empty array.`, error);
        return [];
    }
}

export async function getRepairsForVehicle(vehicleId: string, userId: string): Promise<Repair[]> {
  return getSubCollectionForVehicle<Repair>(vehicleId, userId, 'repairs');
}

export async function getMaintenanceForVehicle(vehicleId: string, userId: string): Promise<Maintenance[]> {
    return getSubCollectionForVehicle<Maintenance>(vehicleId, userId, 'maintenance');
}

export async function getFuelLogsForVehicle(vehicleId: string, userId: string): Promise<FuelLog[]> {
    return getSubCollectionForVehicle<FuelLog>(vehicleId, userId, 'fuelLogs');
}

export async function getDeadlinesForVehicle(vehicleId: string, userId: string): Promise<Deadline[]> {
    return getSubCollectionForVehicle<Deadline>(vehicleId, userId, 'deadlines', 'date', 'asc');
}

async function getAllFromUserCollection<T>(userId: string, collectionName: string): Promise<T[]> {
    try {
        const colRef = collection(db, collectionName);
        const q = query(colRef, where('userId', '==', userId));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(d => docToType<T>(d));
    } catch (error) {
        console.error(`Firebase error fetching all ${collectionName} for user. Returning empty array.`, error);
        return [];
    }
}

export async function getAllUserRepairs(userId: string): Promise<Repair[]> {
    return getAllFromUserCollection<Repair>(userId, 'repairs');
}

export async function getAllUserFuelLogs(userId: string): Promise<FuelLog[]> {
    return getAllFromUserCollection<FuelLog>(userId, 'fuelLogs');
}

export async function getAllUserDeadlines(userId: string): Promise<Deadline[]> {
    return getAllFromUserCollection<Deadline>(userId, 'deadlines');
}


export async function addRepair(repairData: Omit<Repair, 'id' | 'userId'>, userId: string): Promise<Repair> {
    const docRef = await addDoc(collection(db, 'repairs'), { ...repairData, userId });
    return {
        id: docRef.id,
        userId,
        ...repairData,
    };
}

export async function addMaintenance(maintenanceData: Omit<Maintenance, 'id' | 'userId'>, userId: string): Promise<Maintenance> {
    const docRef = await addDoc(collection(db, 'maintenance'), { ...maintenanceData, userId });
    return {
        id: docRef.id,
        userId,
        ...maintenanceData,
    };
}

export async function addFuelLog(fuelLogData: Omit<FuelLog, 'id' | 'userId'>, userId: string): Promise<FuelLog> {
    const docRef = await addDoc(collection(db, 'fuelLogs'), { ...fuelLogData, userId });
    return {
        id: docRef.id,
        userId,
        ...fuelLogData,
    };
}

export async function createSampleDataForUser(userId: string): Promise<void> {
  const brand = 'Peugeot';
  const model = '308';
  const brandDomain = brand.toLowerCase().replace(/ /g, '') + '.com';
  const logoUrl = `https://logo.clearbit.com/${brandDomain}`;

  const vehicleData = {
    brand,
    model,
    year: 2021,
    licensePlate: 'XX-123-YY',
    fuelType: 'Essence' as const,
    imageUrl: logoUrl,
  };
  const vehicle = await addVehicle(vehicleData, userId);

  const now = new Date();
  const nextYear = new Date(now);
  nextYear.setFullYear(now.getFullYear() + 1);
  const nextMonth = new Date(now);
  nextMonth.setMonth(now.getMonth() + 1);
  const oneMonthAgo = new Date(now);
  oneMonthAgo.setMonth(now.getMonth() - 1);
  const oneWeekAgo = new Date(now);
  oneWeekAgo.setDate(now.getDate() - 7);
  
  await addDoc(collection(db, 'deadlines'), {
    userId,
    vehicleId: vehicle.id,
    name: 'Contrôle Technique',
    date: nextYear.toISOString().split('T')[0],
  });
  
  await addDoc(collection(db, 'deadlines'), {
    userId,
    vehicleId: vehicle.id,
    name: 'Assurance',
    date: nextMonth.toISOString().split('T')[0],
  });

  await addRepair({
    vehicleId: vehicle.id,
    date: oneMonthAgo.toISOString().split('T')[0],
    mileage: 15000,
    description: 'Changement des plaquettes de frein avant',
    category: 'Freins',
    cost: 150,
  }, userId);
  
  await addFuelLog({
      vehicleId: vehicle.id,
      date: oneWeekAgo.toISOString().split('T')[0],
      mileage: 15600,
      quantity: 45,
      pricePerLiter: 2.50,
      totalCost: 112.50,
  }, userId);
}
