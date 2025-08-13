
import { db } from './firebase';
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
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import type { Vehicle, Repair, Maintenance, FuelLog, AiDiagnostic, FcmToken } from './types';
import { deleteLocalDocumentsForVehicle, deleteVehicleImage } from './local-db';

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
    const batch = writeBatch(db);
    const vehicleRef = doc(db, 'vehicles', id);
    
    // Delete associated local documents from IndexedDB
    await deleteLocalDocumentsForVehicle(id);
    await deleteVehicleImage(id);


    // Then, batch delete all Firestore documents
    const collectionsToDelete = ['repairs', 'maintenance', 'fuelLogs', 'aiDiagnostics'];
    for (const collectionName of collectionsToDelete) {
        const colRef = collection(db, collectionName);
        const q = query(colRef, where('vehicleId', '==', id));
        const snapshot = await getDocs(q);
        snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
    }

    batch.delete(vehicleRef);
    await batch.commit();
}

async function getSubCollectionForVehicle<T>(vehicleId: string, userId: string, collectionName: string, dateField: string = 'date', sortOrder: 'asc' | 'desc' = 'desc'): Promise<T[]> {
    try {
        const colRef = collection(db, collectionName);
        const q = query(colRef, where('vehicleId', '==', vehicleId), where('userId', '==', userId));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(d => docToType<T>(d));

        data.sort((a: any, b: any) => {
            try {
                const dateA = a[dateField] ? new Date(a[dateField]).getTime() : 0;
                const dateB = b[dateField] ? new Date(b[dateField]).getTime() : 0;
    
                const validA = isNaN(dateA) ? 0 : dateA;
                const validB = isNaN(dateB) ? 0 : dateB;
    
                return sortOrder === 'desc' ? validB - validA : validA - validB;
            } catch (e) {
                console.error(`Error sorting ${collectionName}. Invalid date found.`, {a, b});
                return 0; // Don't crash on invalid date during sort
            }
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

export async function getAllUserMaintenance(userId: string): Promise<Maintenance[]> {
    return getAllFromUserCollection<Maintenance>(userId, 'maintenance');
}

// --- Add Functions ---
export async function addRepair(repairData: Omit<Repair, 'id' | 'userId'>, userId: string): Promise<Repair> {
    const docRef = await addDoc(collection(db, 'repairs'), { ...repairData, userId });
    return { id: docRef.id, userId, ...repairData };
}

export async function addMaintenance(maintenanceData: Omit<Maintenance, 'id' | 'userId'>, userId: string): Promise<Maintenance> {
    const docRef = await addDoc(collection(db, 'maintenance'), { ...maintenanceData, userId });
    return { id: docRef.id, userId, ...maintenanceData };
}

export async function addFuelLog(fuelLogData: Omit<FuelLog, 'id' | 'userId'>, userId: string): Promise<FuelLog> {
    const docRef = await addDoc(collection(db, 'fuelLogs'), { ...fuelLogData, userId });
    return { id: docRef.id, userId, ...fuelLogData };
}

// --- Update Functions ---
export async function updateRepair(id: string, data: Partial<Omit<Repair, 'id' | 'userId' | 'vehicleId'>>): Promise<void> {
  await updateDoc(doc(db, 'repairs', id), data);
}

export async function updateMaintenance(id:string, data: Partial<Omit<Maintenance, 'id'|'userId'|'vehicleId'>>): Promise<void> {
    const docRef = doc(db, 'maintenance', id);
    // Firestore's updateDoc throws an error if a field is set to `undefined`.
    // We must clean the data object to remove any undefined values.
    const cleanData = Object.fromEntries(Object.entries(data).filter(([_, v]) => v !== undefined));
    await updateDoc(docRef, cleanData);
}

export async function updateFuelLog(id: string, data: Partial<Omit<FuelLog, 'id' | 'userId' | 'vehicleId'>>): Promise<void> {
    await updateDoc(doc(db, 'fuelLogs', id), data);
}


// --- Delete Functions ---
export async function deleteRepair(id: string): Promise<void> {
  await deleteDoc(doc(db, 'repairs', id));
}

export async function deleteMaintenance(id: string): Promise<void> {
  await deleteDoc(doc(db, 'maintenance', id));
}

export async function deleteFuelLog(id: string): Promise<void> {
  await deleteDoc(doc(db, 'fuelLogs', id));
}

// --- AI Diagnostics History ---
export async function addAiDiagnostic(diagnosticData: Omit<AiDiagnostic, 'id'>): Promise<AiDiagnostic> {
    const docRef = await addDoc(collection(db, 'aiDiagnostics'), diagnosticData);
    return { id: docRef.id, ...diagnosticData };
}

export async function getAiDiagnosticsForVehicle(vehicleId: string, userId: string): Promise<AiDiagnostic[]> {
    return getSubCollectionForVehicle<AiDiagnostic>(vehicleId, userId, 'aiDiagnostics', 'createdAt');
}

export async function deleteAiDiagnostic(id: string): Promise<void> {
    await deleteDoc(doc(db, 'aiDiagnostics', id));
}

// --- FCM Tokens ---
export async function saveFcmToken(tokenData: Omit<FcmToken, 'id' | 'createdAt'>): Promise<{isNew: boolean}> {
    const tokensRef = collection(db, 'fcmTokens');
    // Check if the token already exists for this user to avoid duplicates
    const q = query(tokensRef, where('userId', '==', tokenData.userId), where('token', '==', tokenData.token));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
        // If token doesn't exist, add it.
        await addDoc(tokensRef, { ...tokenData, createdAt: serverTimestamp() });
        return { isNew: true };
    }
    // If token exists, do nothing but report it's not new.
    return { isNew: false };
}


// --- Sample Data ---
export async function createSampleDataForUser(userId: string): Promise<void> {
  const brand = 'Peugeot';
  const model = '308';
  
  const vehicleData = {
    brand,
    model,
    year: 2021,
    licensePlate: 'XX-123-YY',
    fuelType: 'Essence' as const,
    fiscalPower: 6,
  };
  const vehicle = await addVehicle(vehicleData, userId);

  const now = new Date();
  const oneMonthAgo = new Date(now);
  oneMonthAgo.setMonth(now.getMonth() - 1);
  const oneWeekAgo = new Date(now);
  oneWeekAgo.setDate(now.getDate() - 7);
  
  const nextTechInspection = new Date(now);
  nextTechInspection.setFullYear(now.getFullYear() + 1);
  
  const nextInsurance = new Date(now);
  nextInsurance.setMonth(now.getMonth() + 6);
  
  const nextOilChange = new Date(now);
  nextOilChange.setMonth(now.getMonth() + 3);

  await addMaintenance({
    vehicleId: vehicle.id,
    date: oneMonthAgo.toISOString().split('T')[0],
    mileage: 15000,
    task: 'Visite technique',
    cost: 35,
    nextDueDate: nextTechInspection.toISOString().split('T')[0],
  }, userId);

  await addMaintenance({
    vehicleId: vehicle.id,
    date: oneMonthAgo.toISOString().split('T')[0],
    mileage: 15000,
    task: 'Paiement Assurance',
    cost: 600,
    nextDueDate: nextInsurance.toISOString().split('T')[0],
  }, userId);
  
  await addMaintenance({
    vehicleId: vehicle.id,
    date: oneMonthAgo.toISOString().split('T')[0],
    mileage: 15000,
    task: 'Vidange',
    cost: 120,
    nextDueDate: nextOilChange.toISOString().split('T')[0],
  }, userId);

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
