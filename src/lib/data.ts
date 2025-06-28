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
import { 
    sampleVehicles, 
    getSampleRepairs, 
    getSampleFuelLogs, 
    getSampleDeadlines, 
    getSampleDataForVehicle 
} from './sample-data';

function docToType<T>(document: any): T {
    const data = document.data();
    return {
        id: document.id,
        ...data,
    } as T;
}

export async function getVehicles(): Promise<Vehicle[]> {
  try {
    const vehiclesCol = collection(db, 'vehicles');
    const vehicleSnapshot = await getDocs(query(vehiclesCol, orderBy('brand')));
    const vehicleList = vehicleSnapshot.docs.map(d => docToType<Vehicle>(d));
    if (vehicleList.length > 0) {
      return vehicleList;
    }
    return sampleVehicles;
  } catch (error) {
    console.error("Firebase error fetching vehicles. Returning sample data.", error);
    return sampleVehicles;
  }
}

export async function getVehicleById(id: string): Promise<Vehicle | undefined> {
  try {
    const vehicleRef = doc(db, 'vehicles', id);
    const vehicleSnap = await getDoc(vehicleRef);
    if (vehicleSnap.exists()) {
      return docToType<Vehicle>(vehicleSnap);
    }
    
    // If not in DB, check if we are in sample mode
    const allVehicles = await getVehicles();
    if (allVehicles.some(v => v.id.startsWith('sample-'))) {
        return sampleVehicles.find(v => v.id === id);
    }
    return undefined;
  } catch (error) {
    console.error(`Firebase error fetching vehicle ${id}. Returning sample data.`, error);
    return sampleVehicles.find(v => v.id === id);
  }
}

export async function addVehicle(vehicleData: Omit<Vehicle, 'id'>): Promise<Vehicle> {
    const docRef = await addDoc(collection(db, 'vehicles'), vehicleData);
    return {
        id: docRef.id,
        ...vehicleData,
    };
}


export async function deleteVehicleById(id: string): Promise<void> {
  const vehicleRef = doc(db, 'vehicles', id);
  const vehicleSnap = await getDoc(vehicleRef);

  if (!vehicleSnap.exists()) {
    console.log("Vehicle to delete does not exist.");
    return;
  }

  const vehicleData = vehicleSnap.data() as Omit<Vehicle, 'id'>;
  const imagePath = vehicleData.imagePath;

  if (imagePath) {
    const imageRef = ref(storage, imagePath);
    await deleteObject(imageRef).catch(error => {
      console.error("Could not delete image from storage:", error);
    });
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

        if (data.length > 0) {
            data.sort((a: any, b: any) => {
                const dateA = new Date(a[dateField]).getTime();
                const dateB = new Date(b[dateField]).getTime();
                return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
            });
            return data;
        }

        // Return sample data if subcollection is empty but we are in sample mode
        const allVehicles = await getVehicles();
        if (allVehicles.some(v => v.id.startsWith('sample-'))) {
            return getSampleDataForVehicle(vehicleId, collectionName as any);
        }
        return [];
    } catch (error) {
        console.error(`Firebase error fetching ${collectionName} for ${vehicleId}. Returning sample data.`, error);
        return getSampleDataForVehicle(vehicleId, collectionName as any);
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

async function getAllFromCollection<T>(collectionName: string, sampleDataFn: () => T[]): Promise<T[]> {
    try {
        const colRef = collection(db, collectionName);
        const snapshot = await getDocs(colRef);
        const data = snapshot.docs.map(d => docToType<T>(d));
        if (data.length > 0) return data;
        return sampleDataFn();
    } catch (error) {
        console.error(`Firebase error fetching all ${collectionName}. Returning sample data.`, error);
        return sampleDataFn();
    }
}

export async function getAllRepairs(): Promise<Repair[]> {
    return getAllFromCollection<Repair>('repairs', getSampleRepairs);
}

export async function getAllFuelLogs(): Promise<FuelLog[]> {
    return getAllFromCollection<FuelLog>('fuelLogs', getSampleFuelLogs);
}

export async function getAllDeadlines(): Promise<Deadline[]> {
    return getAllFromCollection<Deadline>('deadlines', getSampleDeadlines);
}

export async function addRepair(repairData: Omit<Repair, 'id'>): Promise<Repair> {
    const docRef = await addDoc(collection(db, 'repairs'), repairData);
    return {
        id: docRef.id,
        ...repairData,
    };
}
