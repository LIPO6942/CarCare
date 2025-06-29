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
} from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import type { Vehicle, Repair, Maintenance, FuelLog, Deadline } from './types';

function docToType<T>(document: any): T {
    const data = document.data();
    return {
        id: document.id,
        ...data,
    } as T;
}

export async function getVehicles(userId: string): Promise<Vehicle[]> {
  try {
    const vehiclesCol = collection(db, 'vehicles');
    const q = query(vehiclesCol, where('userId', '==', userId), orderBy('brand'));
    const vehicleSnapshot = await getDocs(q);
    const vehicleList = vehicleSnapshot.docs.map(d => docToType<Vehicle>(d));
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
  const vehicleDoc = await getDoc(vehicleRef);
  const vehicleData = vehicleDoc.data();

  // Delete image from storage if it exists
  if (vehicleData?.imageUrl && vehicleData.imageUrl.includes('firebasestorage')) {
      try {
        const imageRef = ref(storage, vehicleData.imageUrl);
        await deleteObject(imageRef);
      } catch (error) {
          console.error("Error deleting image from storage, continuing with firestore deletion.", error);
      }
  }

  const batch = writeBatch(db);
  batch.delete(vehicleRef);

  const collectionsToDelete = ['repairs', 'maintenance', 'fuelLogs', 'deadlines'];
  for (const colName of collectionsToDelete) {
      const q = query(collection(db, colName), where('vehicleId', '==', id));
      const snapshot = await getDocs(q);
      snapshot.forEach(doc => batch.delete(doc.ref));
  }

  await batch.commit();
}

async function getSubCollectionForVehicle<T>(vehicleId: string, collectionName: string, dateField: string = 'date', sortOrder: 'asc' | 'desc' = 'desc'): Promise<T[]> {
    try {
        const colRef = collection(db, collectionName);
        const q = query(colRef, where('vehicleId', '==', vehicleId));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(d => docToType<T>(d));

        data.sort((a: any, b: any) => {
            const dateA = new Date(a[dateField]).getTime();
            const dateB = new Date(b[dateField]).getTime();
            return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
        });
        return data;

    } catch (error) {
        console.error(`Firebase error fetching ${collectionName} for ${vehicleId}. Returning empty array.`, error);
        return [];
    }
}

export async function getRepairsForVehicle(vehicleId: string): Promise<Repair[]> {
  return getSubCollectionForVehicle<Repair>(vehicleId, 'repairs');
}

export async function getMaintenanceForVehicle(vehicleId: string): Promise<Maintenance[]> {
    return getSubCollectionForVehicle<Maintenance>(vehicleId, 'maintenance');
}

export async function getFuelLogsForVehicle(vehicleId: string): Promise<FuelLog[]> {
    return getSubCollectionForVehicle<FuelLog>(vehicleId, 'fuelLogs');
}

export async function getDeadlinesForVehicle(vehicleId: string): Promise<Deadline[]> {
    return getSubCollectionForVehicle<Deadline>(vehicleId, 'deadlines', 'date', 'asc');
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
