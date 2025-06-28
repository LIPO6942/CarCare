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
} from 'firebase/firestore';
import type { Vehicle, Repair, Maintenance, FuelLog, Deadline } from './types';

// Helper function to convert Firestore doc to a specific type
function docToType<T>(document: any): T {
    const data = document.data();
    return {
        id: document.id,
        ...data,
    } as T;
}

// API functions
export async function getVehicles(): Promise<Vehicle[]> {
  const vehiclesCol = collection(db, 'vehicles');
  const vehicleSnapshot = await getDocs(query(vehiclesCol, orderBy('brand')));
  const vehicleList = vehicleSnapshot.docs.map(d => docToType<Vehicle>(d));
  return vehicleList;
}

export async function getVehicleById(id: string): Promise<Vehicle | undefined> {
  const vehicleRef = doc(db, 'vehicles', id);
  const vehicleSnap = await getDoc(vehicleRef);
  if (vehicleSnap.exists()) {
    return docToType<Vehicle>(vehicleSnap);
  }
  return undefined;
}

export async function addVehicle(vehicleData: Omit<Vehicle, 'id'>): Promise<Vehicle> {
    const docRef = await addDoc(collection(db, 'vehicles'), vehicleData);
    return {
        id: docRef.id,
        ...vehicleData,
    };
}


export async function deleteVehicleById(id: string): Promise<void> {
  const batch = writeBatch(db);

  // Delete the vehicle document
  const vehicleRef = doc(db, 'vehicles', id);
  batch.delete(vehicleRef);

  // Find and delete associated repairs
  const repairsQuery = query(collection(db, 'repairs'), where('vehicleId', '==', id));
  const repairsSnapshot = await getDocs(repairsQuery);
  repairsSnapshot.forEach(doc => batch.delete(doc.ref));
  
  // Find and delete associated maintenance
  const maintenanceQuery = query(collection(db, 'maintenance'), where('vehicleId', '==', id));
  const maintenanceSnapshot = await getDocs(maintenanceQuery);
  maintenanceSnapshot.forEach(doc => batch.delete(doc.ref));
  
  // Find and delete associated fuel logs
  const fuelLogsQuery = query(collection(db, 'fuelLogs'), where('vehicleId', '==', id));
  const fuelLogsSnapshot = await getDocs(fuelLogsQuery);
  fuelLogsSnapshot.forEach(doc => batch.delete(doc.ref));

  // Find and delete associated deadlines
  const deadlinesQuery = query(collection(db, 'deadlines'), where('vehicleId', '==', id));
  const deadlinesSnapshot = await getDocs(deadlinesQuery);
  deadlinesSnapshot.forEach(doc => batch.delete(doc.ref));

  // Commit the batch
  await batch.commit();
}

async function getSubCollectionForVehicle<T>(vehicleId: string, collectionName: string, dateField: string = 'date', sortOrder: 'asc' | 'desc' = 'desc'): Promise<T[]> {
    const colRef = collection(db, collectionName);
    const q = query(colRef, where('vehicleId', '==', vehicleId));
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(d => docToType<T>(d));

    // Sort the data in the application code to avoid needing a composite index
    data.sort((a: any, b: any) => {
        const dateA = new Date(a[dateField]).getTime();
        const dateB = new Date(b[dateField]).getTime();
        if (sortOrder === 'desc') {
            return dateB - dateA;
        }
        return dateA - dateB;
    });

    return data;
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

async function getAllFromCollection<T>(collectionName: string): Promise<T[]> {
    const colRef = collection(db, collectionName);
    const snapshot = await getDocs(colRef);
    return snapshot.docs.map(d => docToType<T>(d));
}

export async function getAllRepairs(): Promise<Repair[]> {
    return getAllFromCollection<Repair>('repairs');
}

export async function getAllFuelLogs(): Promise<FuelLog[]> {
    return getAllFromCollection<FuelLog>('fuelLogs');
}

export async function getAllDeadlines(): Promise<Deadline[]> {
    return getAllFromCollection<Deadline>('deadlines');
}

export async function addRepair(repairData: Omit<Repair, 'id'>): Promise<Repair> {
    const docRef = await addDoc(collection(db, 'repairs'), repairData);
    return {
        id: docRef.id,
        ...repairData,
    };
}
