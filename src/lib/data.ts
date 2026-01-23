
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
import type { Vehicle, Repair, Maintenance, FuelLog, AiDiagnostic, FcmToken, Place, RoutePattern } from './types';
import { deleteLocalDocumentsForVehicle, deleteVehicleImage } from './local-db';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data.sort((a: any, b: any) => {
      try {
        const dateA = a[dateField] ? new Date(a[dateField]).getTime() : 0;
        const dateB = b[dateField] ? new Date(b[dateField]).getTime() : 0;

        const validA = isNaN(dateA) ? 0 : dateA;
        const validB = isNaN(dateB) ? 0 : dateB;

        return sortOrder === 'desc' ? validB - validA : validA - validB;
      } catch (e) {
        console.error(`Error sorting ${collectionName}. Invalid date found.`, { a, b });
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

export async function updateMaintenance(id: string, data: Partial<Omit<Maintenance, 'id' | 'userId' | 'vehicleId'>>): Promise<void> {
  const docRef = doc(db, 'maintenance', id);
  // Firestore's updateDoc throws an error if a field is set to `undefined`.
  // We must clean the data object to remove any undefined or null values.
  const cleanData = Object.fromEntries(Object.entries(data).filter(([_, v]) => v !== undefined && v !== null));
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
export async function saveFcmToken(tokenData: Omit<FcmToken, 'id' | 'createdAt'>): Promise<{ isNew: boolean }> {
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
    gaugeLevelBefore: 0.125,
  }, userId);
}

// --- Place Management ---
export async function addPlace(placeData: Omit<Place, 'id' | 'createdAt'>): Promise<Place> {
  const docRef = await addDoc(collection(db, 'places'), {
    ...placeData,
    createdAt: new Date().toISOString()
  });
  return {
    id: docRef.id,
    ...placeData,
    createdAt: new Date().toISOString()
  };
}

export async function getPlaces(userId: string): Promise<Place[]> {
  return getAllFromUserCollection<Place>(userId, 'places');
}

export async function updatePlace(id: string, data: Partial<Omit<Place, 'id' | 'userId' | 'createdAt'>>): Promise<void> {
  const cleanData = Object.fromEntries(Object.entries(data).filter(([_, v]) => v !== undefined && v !== null));
  await updateDoc(doc(db, 'places', id), cleanData);
}

export async function deletePlace(id: string): Promise<void> {
  await deleteDoc(doc(db, 'places', id));
}

// --- Route Analysis ---

// --- Constants ---

const TUNISIAN_HOLIDAYS_MM_DD = new Set([
  // Fixed Holidays
  '01-01', '03-20', '04-09', '05-01', '07-25', '08-13', '10-15', '12-17',
  // Variable Holidays (Observed in 2025 & 2026) - Applied to all years as requested
  '03-21', '03-22', '03-30', // Aid Fitr
  '05-26', '05-27', // Aid Adha (2026)
  '06-06', '06-07', // Aid Adha (2025)
  '06-15', '06-26', '08-24', '09-04' // Mouled / New Year Hijri
]);

function isHoliday(date: Date): boolean {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return TUNISIAN_HOLIDAYS_MM_DD.has(`${mm}-${dd}`);
}

export async function analyzeRoutes(userId: string, vehicleId: string): Promise<RoutePattern[]> {
  const fuelLogs = await getFuelLogsForVehicle(vehicleId, userId);
  // Sort logs by mileage ascending (oldest to newest mileage) for analysis
  fuelLogs.sort((a, b) => a.mileage - b.mileage);

  const places = await getPlaces(userId);
  const vehicle = await getVehicleById(vehicleId);

  // Find users work place for calculations
  const workPlace = places.find(p => p.type === 'work');
  const workDist = workPlace?.estimatedDistanceFromHome || 0;
  const isWorkRoundTrip = workPlace?.isRoundTrip ?? false;
  const workWorkingDays = workPlace?.workingDays || [1, 2, 3, 4, 5]; // Default Mon-Fri if not specified

  // Calculate global average consumption for the vehicle to use for weighting
  // Re-sort fuel logs by mileage ascending
  // Step A: Estimate Tank Capacity (Same logic as dashboard for consistency)
  const capacityEstimates: number[] = [];
  fuelLogs.forEach(log => {
    if (log.gaugeLevelBefore !== undefined && log.gaugeLevelBefore < 1) {
      const estimate = log.quantity / (1 - log.gaugeLevelBefore);
      if (estimate > 0 && estimate < 200) { // Sanity check: tank < 200L
        capacityEstimates.push(estimate);
      }
    }
  });

  let estimatedCapacity = 0;
  if (capacityEstimates.length > 0) {
    // Use median for robustness
    capacityEstimates.sort((a, b) => a - b);
    const mid = Math.floor(capacityEstimates.length / 2);
    estimatedCapacity = capacityEstimates.length % 2 === 0
      ? (capacityEstimates[mid - 1] + capacityEstimates[mid]) / 2
      : capacityEstimates[mid];
  }

  // Calculate global average consumption
  const totalKm = fuelLogs[fuelLogs.length - 1].mileage - fuelLogs[0].mileage;
  let totalFuel = fuelLogs.slice(1).reduce((sum, log) => sum + log.quantity, 0);

  // If we have gauge data and estimated capacity, we can refine the global average too
  if (estimatedCapacity > 0 && fuelLogs[0].gaugeLevelBefore !== undefined && fuelLogs[fuelLogs.length - 1].gaugeLevelBefore !== undefined) {
    totalFuel = fuelLogs.slice(0, -1).reduce((sum, log) => sum + log.quantity, 0) +
      (estimatedCapacity * (fuelLogs[0].gaugeLevelBefore - fuelLogs[fuelLogs.length - 1].gaugeLevelBefore));
  }

  const globalAvgConsumption = totalKm > 0 ? (totalFuel / totalKm) * 100 : 0;

  const patterns: RoutePattern[] = [];

  // Analyze intervals between fuel logs
  for (let i = 1; i < fuelLogs.length; i++) {
    const currentLog = fuelLogs[i];
    const previousLog = fuelLogs[i - 1];

    const distance = currentLog.mileage - previousLog.mileage;

    if (distance <= 0) continue;

    let consumption = 0;
    if (estimatedCapacity > 0 && previousLog.gaugeLevelBefore !== undefined && currentLog.gaugeLevelBefore !== undefined) {
      // Step B: Use Delta V formula for maximum precision
      const deltaV = previousLog.quantity + (estimatedCapacity * (previousLog.gaugeLevelBefore - currentLog.gaugeLevelBefore));
      consumption = (deltaV / distance) * 100;
    } else {
      // Fallback to basic method if gauge data is missing
      consumption = (previousLog.quantity / distance) * 100;
    }

    const currDate = new Date(currentLog.date);
    const prevDate = new Date(previousLog.date);

    // Tiered usage analysis
    const dateDiff = Math.max(1, Math.ceil((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)));
    const intensity = distance / dateDiff;

    // Estimate Average Speed for this route based on consumption
    let estimatedAvgSpeed = 0;
    if (consumption > 0) {
      const fiscalPower = vehicle?.fiscalPower || 6;
      const isDiesel = vehicle?.fuelType === 'Diesel';

      const baseReference = isDiesel ? 5.2 + (fiscalPower - 4) * 0.4 : 7.0 + (fiscalPower - 4) * 0.5;
      const carAvg = globalAvgConsumption > 0 ? globalAvgConsumption : baseReference;
      const stressFactor = consumption / carAvg;

      let baseSpeed = 0;
      if (stressFactor >= 1) {
        baseSpeed = (38 / Math.pow(stressFactor, 1.6));
        if (baseSpeed < 10) baseSpeed = 10;
      } else {
        baseSpeed = 38 + (1 - stressFactor) * 100;
        if (baseSpeed > 130) baseSpeed = 130;
      }

      let intensityAdjustment = 0;
      if (intensity < 15) intensityAdjustment = -3;
      else if (intensity > 100) intensityAdjustment = 15;

      estimatedAvgSpeed = baseSpeed + intensityAdjustment;
    }

    // ... (maintenance logic here if any)

    // 1. Calculate Calendar Work Days based on custom selection
    let workDaysCount = 0;
    let tempDate = new Date(prevDate);
    // Iterate from day after previous log up to current log
    tempDate.setDate(tempDate.getDate() + 1);

    while (tempDate <= currDate) {
      const day = tempDate.getDay();
      const isWorkingDay = workWorkingDays.includes(day);
      if (isWorkingDay && !isHoliday(tempDate)) {
        workDaysCount++;
      }
      tempDate.setDate(tempDate.getDate() + 1);
    }

    // 2. Theoretical Work Distance
    const dailyDistance = isWorkRoundTrip ? workDist : (workDist * 2);
    let theoreticalWorkDist = workDaysCount * dailyDistance;

    // --- High Consumption Weighting (Traffic Jam Logic) ---
    // User request: if consumption exceeds avg by > 0.5L/100km, it's likely Pro (traffic)
    let consumptionWeightFactor = 1.0;
    if (globalAvgConsumption > 0 && consumption > globalAvgConsumption + 0.5) {
      // Increase theoretical work distance by 15% to prioritize Pro ratio
      consumptionWeightFactor = 1.15;
      theoreticalWorkDist *= consumptionWeightFactor;
    }

    // 3. Analysis
    let workDistance = 0;
    let leisureDistance = 0;

    if (workDist > 0) {
      // Cap work distance at actual distance
      workDistance = Math.min(distance, theoreticalWorkDist);
      leisureDistance = Math.max(0, distance - workDistance);
    } else {
      // No work place defined -> assume 0 work
      leisureDistance = distance;
    }

    const workRatio = distance > 0 ? (workDistance / distance) : 0;

    // 4. Pattern Detection
    let patternType: RoutePattern['detectedPattern'] = 'unknown';
    let matchedPlaceId: string | undefined;
    let matchedPlaceName: string | undefined;

    if (workRatio > 0.6) {
      patternType = 'daily_commute';
      matchedPlaceId = workPlace?.id;
      matchedPlaceName = workPlace?.name;
    } else if (leisureDistance > distance * 0.8) {
      // Mostly leisure
      // Try to match specific leisure place
      for (const place of places) {
        if (place.type !== 'work' && place.estimatedDistanceFromHome) {
          const roundTv = place.isRoundTrip ? place.estimatedDistanceFromHome : (place.estimatedDistanceFromHome * 2);
          const trips = Math.round(leisureDistance / roundTv);
          if (trips > 0 && Math.abs(leisureDistance - (trips * roundTv)) < leisureDistance * 0.2) {
            matchedPlaceId = place.id;
            matchedPlaceName = place.name;
            patternType = 'occasional';
            break;
          }
        }
      }
      if (!patternType || patternType === 'unknown') patternType = 'weekend_trip';
    } else {
      patternType = 'mixed'; // Mixed usage
    }

    let s = 'Mixte';
    if (intensity < 30) s = 'Urbain';
    else if (intensity >= 60 && intensity < 90) s = 'Semi-Sport';
    else if (intensity >= 90) s = 'Sport/Route';

    patterns.push({
      id: `pattern-${currentLog.id}`,
      userId,
      vehicleId,
      estimatedDistance: distance,
      fuelLogId: currentLog.id,
      consumption,
      cost: currentLog.totalCost,
      date: currentLog.date,
      detectedPattern: patternType,
      matchedPlaceId,
      matchedPlaceName,
      averageSpeed: estimatedAvgSpeed,
      drivingStyle: s,
      analysis: {
        workDistance,
        leisureDistance,
        workRatio,
        commuteEfficiency: 0 // Will be calc on frontend vs avg
      }
    });
  }

  return patterns;
}

