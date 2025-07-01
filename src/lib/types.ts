export type Vehicle = {
  id: string;
  userId: string;
  brand: string;
  model: string;
  year: number;
  licensePlate: string;
  fuelType: 'Essence' | 'Diesel' | 'Électrique' | 'Hybride';
  imageUrl?: string;
  fiscalPower?: number;
};

export type Repair = {
  id: string;
  userId: string;
  vehicleId: string;
  date: string;
  mileage: number;
  description: string;
  category: string;
  cost: number;
};

export type Maintenance = {
  id:string;
  userId: string;
  vehicleId: string;
  date: string;
  mileage: number;
  task: string;
  cost: number;
  nextDueDate?: string;
  nextDueMileage?: number;
};

export type FuelLog = {
  id: string;
  userId: string;
  vehicleId: string;
  date: string;
  mileage: number;
  quantity: number;
  pricePerLiter: number;
  totalCost: number;
};

export type Document = {
  id: string;
  userId: string;
  vehicleId: string;
  name: string;
  type: 'Carte Grise' | 'Assurance' | 'Facture' | 'Visite Technique' | 'Autre';
  url: string;
  filePath: string; // The path in Firebase Storage, needed for deletion
  createdAt: string;
};
