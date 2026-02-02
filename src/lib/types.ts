export type Vehicle = {
  id: string;
  userId: string;
  brand: string;
  model: string;
  year: number;
  licensePlate: string;
  fuelType: 'Essence' | 'Diesel' | 'Électrique' | 'Hybride';
  fiscalPower?: number;
  estimatedTankCapacity?: number | null;
  vin?: string;
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
  id: string;
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
  gaugeLevelBefore: number;
  averageSpeed?: number | null; // Optional user input for precise tracking
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

export type FcmToken = {
  id?: string;
  userId: string;
  token: string;
  createdAt: any;
}

export type Place = {
  id: string;
  userId: string;
  name: string; // Ex: "Domicile", "Travail", "Salle de sport"
  type: 'home' | 'work' | 'leisure' | 'sport' | 'parents' | 'other';
  address?: string;
  estimatedDistanceFromHome?: number; // Distance en km depuis le domicile (si applicable)
  isRoundTrip?: boolean; // Si la distance specifiee est aller-retour
  workingDays?: number[]; // [0, 1, 2, 3, 4, 5, 6] (0=Dimanche, 1=Lundi, etc.)
  icon?: string; // Emoji ou icone
  color?: string; // Couleur pour la visualisation
  createdAt: string;
};

export type RoutePattern = {
  id: string;
  userId: string;
  vehicleId: string;
  fromPlace?: string; // ID du lieu de depart
  toPlace?: string; // ID du lieu d'arrivee
  estimatedDistance: number; // Distance calculee en km
  fuelLogId: string; // Reference au plein de carburant
  consumption: number; // Consommation pour ce trajet (L/100km)
  cost: number; // Cout pour ce trajet
  date: string;
  detectedPattern?: 'daily_commute' | 'weekend_trip' | 'occasional' | 'mixed' | 'unknown';
  matchedPlaceId?: string;
  matchedPlaceName?: string;
  averageSpeed?: number;
  drivingStyle?: string;
  analysis?: {
    workDistance: number;
    leisureDistance: number;
    workCost: number;
    leisureCost: number;
    workRatio: number; // 0 to 1
    commuteEfficiency: number; // diff from avg
  };
};
