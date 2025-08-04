export type Vehicle = {
  id: string;
  userId: string;
  brand: string;
  model: string;
  year: number;
  licensePlate: string;
  fuelType: 'Essence' | 'Diesel' | 'Électrique' | 'Hybride';
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
  id: number; // This will be the IndexedDB key
  vehicleId: string;
  name: string;
  type: 'Carte Grise' | 'Assurance' | 'Facture' | 'Visite Technique' | 'Permis de Conduite' | 'Autre';
  fileRecto: File;
  fileVerso?: File;
  createdAt: string;
  invoiceDate?: string;
  invoiceAmount?: number;
};

export type AiDiagnostic = {
  id: string;
  userId: string;
  vehicleId: string;
  vehicleInfo: {
    brand: string;
    model: string;
    licensePlate: string;
  };
  symptoms: {
    component: string;
    symptom: string;
    details?: string;
  };
  suggestions: string[];
  createdAt: string;
}