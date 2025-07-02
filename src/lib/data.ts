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
  updateDoc,
} from 'firebase/firestore';
import { ref, deleteObject, uploadBytes, getDownloadURL } from 'firebase/storage';
import type { Vehicle, Repair, Maintenance, FuelLog, Document } from './types';

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
    
    // First, delete associated files from Storage
    const docQuery = query(collection(db, 'documents'), where('vehicleId', '==', id));
    const docSnapshot = await getDocs(docQuery);
    for (const doc of docSnapshot.docs) {
        const data = doc.data() as Omit<Document, 'id'>;
        if (data.filePath) {
            const fileRef = ref(storage, data.filePath);
            // Don't block deletion if a single file fails to delete
            await deleteObject(fileRef).catch(err => console.error("Non-critical: could not delete storage file during vehicle deletion", err));
        }
    }

    // Then, batch delete all Firestore documents
    const collectionsToDelete = ['repairs', 'maintenance', 'fuelLogs', 'documents'];
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

export async function getDocumentsForVehicle(vehicleId: string, userId: string): Promise<Document[]> {
    return getSubCollectionForVehicle<Document>(vehicleId, userId, 'documents', 'createdAt');
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

export async function addDocument(
  vehicleId: string,
  userId: string,
  file: File,
  documentInfo: { name: string; type: Document['type'] }
): Promise<Document> {
  try {
    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '');
    const filePath = `documents/${userId}/${vehicleId}/${Date.now()}-${safeFileName}`;
    const fileRef = ref(storage, filePath);
    
    await uploadBytes(fileRef, file);
    const url = await getDownloadURL(fileRef);

    const docData = {
      userId,
      vehicleId,
      name: documentInfo.name,
      type: documentInfo.type,
      url,
      filePath,
      createdAt: new Date().toISOString(),
    };

    const docRef = await addDoc(collection(db, 'documents'), docData);
    return { id: docRef.id, ...docData };
  } catch (error: any) {
    console.error("Firebase Storage/Firestore Error in addDocument:", error);
    if (error.code === 'storage/unauthorized') {
      throw new Error("Erreur de permission. Veuillez vérifier la configuration de vos règles de sécurité Firebase Storage pour autoriser les écritures authentifiées.");
    }
    throw new Error("Une erreur réseau ou de configuration a empêché le téléversement.");
  }
}


// --- Update Functions ---
export async function updateRepair(id: string, data: Partial<Omit<Repair, 'id' | 'userId' | 'vehicleId'>>): Promise<void> {
  await updateDoc(doc(db, 'repairs', id), data);
}

export async function updateMaintenance(id:string, data: Partial<Omit<Maintenance, 'id'|'userId'|'vehicleId'>>): Promise<void> {
    await updateDoc(doc(db, 'maintenance', id), data);
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

export async function deleteDocument(docId: string, filePath: string): Promise<void> {
    const fileRef = ref(storage, filePath);
    try {
        await deleteObject(fileRef);
    } catch (error: any) {
        if (error.code !== 'storage/object-not-found') {
            console.error("Error deleting file from storage", error);
            throw error;
        }
    }
    await deleteDoc(doc(db, 'documents', docId));
}

// --- Sample Data ---
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
    task: 'Assurance',
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
