export type Vehicle = {
  id: string;
  userId: string;
  brand: string;
  model: string;
  year: number;
  licensePlate: string;
  fuelType: 'Essence' | 'Diesel' | 'Électrique' | 'Hybride';
  imageUrl?: string;
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
