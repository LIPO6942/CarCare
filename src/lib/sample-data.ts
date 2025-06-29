
import type { Vehicle, Repair, Maintenance, FuelLog, Deadline } from './types';

export const sampleVehicles: Vehicle[] = [
  {
    id: 'sample-bmw-m3',
    brand: 'BMW',
    model: 'M3 Competition',
    year: 2023,
    licensePlate: 'G80-POWER',
    fuelType: 'Essence',
    imageUrl: 'https://images.unsplash.com/photo-1633409332034-6e1b8a10d5b6?q=80&w=1080',
    imagePath: '',
  },
  {
    id: 'sample-toyota-rav4',
    brand: 'Toyota',
    model: 'RAV4 Hybrid',
    year: 2022,
    licensePlate: 'ECO-RIDE',
    fuelType: 'Hybride',
    imageUrl: 'https://images.unsplash.com/photo-1643482522619-5431c4b14562?q=80&w=1080',
    imagePath: '',
  },
  {
    id: 'sample-honda-civic',
    brand: 'Honda',
    model: 'Civic Type R',
    year: 2021,
    licensePlate: 'VTEC-GO',
    fuelType: 'Essence',
    imageUrl: 'https://images.unsplash.com/photo-1619409898592-56c604343135?q=80&w=1080',
    imagePath: '',
  },
];

const repairs: Repair[] = [
    { id: 'r1', vehicleId: 'sample-bmw-m3', date: '2024-05-15', mileage: 15200, description: 'Remplacement plaquettes de frein avant', category: 'Freins', cost: 750 },
    { id: 'r2', vehicleId: 'sample-toyota-rav4', date: '2024-04-20', mileage: 30500, description: 'Réparation pneu crevé', category: 'Pneus', cost: 50 },
    { id: 'r3', vehicleId: 'sample-honda-civic', date: '2024-06-01', mileage: 45000, description: 'Changement de la batterie', category: 'Électrique', cost: 250 },
    { id: 'r4', vehicleId: 'sample-toyota-rav4', date: '2024-06-10', mileage: 32000, description: 'Alignement des roues', category: 'Suspension', cost: 120 },
];

const maintenance: Maintenance[] = [
    { id: 'm1', vehicleId: 'sample-bmw-m3', date: '2024-01-10', mileage: 10000, task: 'Vidange huile moteur et filtre', cost: 300, nextDueMileage: 25000 },
    { id: 'm2', vehicleId: 'sample-toyota-rav4', date: '2023-12-15', mileage: 25000, task: 'Entretien annuel Hybride', cost: 400, nextDueDate: '2024-12-15' },
    { id: 'm3', vehicleId: 'sample-honda-civic', date: '2024-03-01', mileage: 40000, task: 'Rotation des pneus et inspection', cost: 80, nextDueMileage: 50000 },
];

const fuelLogs: FuelLog[] = [
    { id: 'f1', vehicleId: 'sample-bmw-m3', date: '2024-06-20', mileage: 16000, quantity: 50, pricePerLiter: 2.5, totalCost: 125 },
    { id: 'f2', vehicleId: 'sample-toyota-rav4', date: '2024-06-18', mileage: 32500, quantity: 40, pricePerLiter: 2.2, totalCost: 88 },
    { id: 'f3', vehicleId: 'sample-honda-civic', date: '2024-06-22', mileage: 45800, quantity: 45, pricePerLiter: 2.5, totalCost: 112.5 },
];

const deadlines: Deadline[] = [
    { id: 'd1', vehicleId: 'sample-bmw-m3', name: 'Assurance annuelle', date: '2025-01-15' },
    { id: 'd2', vehicleId: 'sample-toyota-rav4', name: 'Contrôle Technique', date: '2024-11-05' },
    { id: 'd3', vehicleId: 'sample-honda-civic', name: 'Assurance annuelle', date: '2024-09-20' },
     { id: 'd4', vehicleId: 'sample-bmw-m3', name: 'Contrôle Technique', date: '2025-07-01' },
];

export function getSampleRepairs() { return repairs; }
export function getSampleMaintenance() { return maintenance; }
export function getSampleFuelLogs() { return fuelLogs; }
export function getSampleDeadlines() { return deadlines; }

export function getSampleDataForVehicle<T>(vehicleId: string, collection: 'repairs' | 'maintenance' | 'fuelLogs' | 'deadlines'): T[] {
    switch (collection) {
        case 'repairs':
            return repairs.filter(item => item.vehicleId === vehicleId) as T[];
        case 'maintenance':
            return maintenance.filter(item => item.vehicleId === vehicleId) as T[];
        case 'fuelLogs':
            return fuelLogs.filter(item => item.vehicleId === vehicleId) as T[];
        case 'deadlines':
            return deadlines.filter(item => item.vehicleId === vehicleId).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()) as T[];
        default:
            return [];
    }
}
