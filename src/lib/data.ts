import type { Vehicle, Repair, Maintenance, FuelLog, Deadline } from './types';

// In-memory store
let vehicles: Vehicle[] = [
  {
    id: '1',
    brand: 'Peugeot',
    model: '308',
    year: 2021,
    licensePlate: 'AA-123-BB',
    fuelType: 'Essence',
    imageUrl: 'https://images.unsplash.com/photo-1697460750302-0e456cb3ec25?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3NDE5ODJ8MHwxfHNlYXJjaHw2fHxQZXVnZW90JTIwMzA4fGVufDB8fHx8MTc1MTEzODg3M3ww&ixlib=rb-4.1.0&q=80&w=1080',
  },
];

let repairs: Repair[] = [
  { id: 'r1', vehicleId: '1', date: '2023-10-15', mileage: 25000, description: 'Remplacement plaquettes de frein avant', category: 'Freins', cost: 250 },
  { id: 'r2', vehicleId: '1', date: '2024-01-20', mileage: 30000, description: 'Changement pneu avant droit', category: 'Pneus', cost: 120 },
];

let maintenances: Maintenance[] = [
  { id: 'm1', vehicleId: '1', date: '2023-05-01', mileage: 20000, task: 'Vidange huile moteur et filtre', cost: 180, nextDueDate: '2024-05-01', nextDueMileage: 40000 },
];

let fuelLogs: FuelLog[] = [
  { id: 'f1', vehicleId: '1', date: '2024-03-01', mileage: 32000, quantity: 45, pricePerLiter: 1.95, totalCost: 87.75 },
  { id: 'f2', vehicleId: '1', date: '2024-03-15', mileage: 32650, quantity: 42, pricePerLiter: 1.98, totalCost: 83.16 },
];

let deadlines: Deadline[] = [
    { id: 'd1', vehicleId: '1', name: 'Contrôle Technique', date: '2025-05-20' },
];


// API functions
export async function getVehicles(): Promise<Vehicle[]> {
  return vehicles;
}

export async function getVehicleById(id: string): Promise<Vehicle | undefined> {
  return vehicles.find((v) => v.id === id);
}

export async function addVehicle(vehicleData: Omit<Vehicle, 'id' | 'imageUrl'>): Promise<Vehicle> {
  const newVehicle: Vehicle = {
    id: (Math.random() * 1000).toString(),
    ...vehicleData,
    imageUrl: 'https://placehold.co/600x400.png',
  };
  vehicles.push(newVehicle);
  return newVehicle;
}

export async function deleteVehicleById(id: string): Promise<void> {
  const vehicleIndex = vehicles.findIndex((v) => v.id === id);
  if (vehicleIndex > -1) {
    vehicles.splice(vehicleIndex, 1);
    repairs = repairs.filter((r) => r.vehicleId !== id);
    maintenances = maintenances.filter((m) => m.vehicleId !== id);
    fuelLogs = fuelLogs.filter((f) => f.vehicleId !== id);
    deadlines = deadlines.filter((d) => d.vehicleId !== id);
  }
}

export async function getRepairsForVehicle(vehicleId: string): Promise<Repair[]> {
  return repairs.filter((r) => r.vehicleId === vehicleId).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export async function getMaintenanceForVehicle(vehicleId: string): Promise<Maintenance[]> {
    return maintenances.filter((m) => m.vehicleId === vehicleId).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export async function getFuelLogsForVehicle(vehicleId: string): Promise<FuelLog[]> {
    return fuelLogs.filter((f) => f.vehicleId === vehicleId).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export async function getDeadlinesForVehicle(vehicleId: string): Promise<Deadline[]> {
    return deadlines.filter((d) => d.vehicleId === vehicleId).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export async function getAllRepairs(): Promise<Repair[]> {
    return repairs;
}

export async function getAllFuelLogs(): Promise<FuelLog[]> {
    return fuelLogs;
}

export async function getAllDeadlines(): Promise<Deadline[]> {
    return deadlines;
}

export async function addRepair(repairData: Omit<Repair, 'id'>): Promise<Repair> {
    const newRepair: Repair = {
        id: `r${Math.random() * 1000}`,
        ...repairData,
    };
    repairs.push(newRepair);
    return newRepair;
}
