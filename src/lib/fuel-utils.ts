import type { Vehicle, FuelLog } from '@/lib/types';

/**
 * Calcule ou estime la capacité du réservoir d'un véhicule (en Litres).
 * Priorité :
 * 1. Valeur explicitement configurée sur le véhicule (estimatedTankCapacity)
 * 2. Détection intelligente basée sur les pleins historiques avec jauge
 * 3. Estimation réaliste basée sur la puissance fiscale et le type de carburant
 * 4. Valeur par défaut standard (50L)
 */
export function getVehicleTankCapacity(vehicle?: Partial<Vehicle> | null, fuelLogs?: FuelLog[]): number {
  if (vehicle?.estimatedTankCapacity && vehicle.estimatedTankCapacity > 0) {
    return vehicle.estimatedTankCapacity;
  }

  // Détection à partir des pleins avec jauge si un plein important a été effectué
  if (fuelLogs && fuelLogs.length > 0) {
    const capacityEstimates: number[] = [];
    fuelLogs.forEach(log => {
      if (log.gaugeLevelBefore !== undefined && log.gaugeLevelBefore !== null && log.gaugeLevelBefore < 0.95 && log.quantity > 0) {
        // Estimation théorique : si le plein remplissait jusqu'à 100%
        const estimate = log.quantity / (1 - log.gaugeLevelBefore);
        if (estimate >= 35 && estimate <= 120) {
          capacityEstimates.push(estimate);
        }
      }
    });

    if (capacityEstimates.length > 0) {
      // On prend la valeur maximale observée
      const detected = Math.max(...capacityEstimates);
      if (detected >= 35 && detected <= 120) {
        return Math.round(detected);
      }
    }
  }

  // Estimation basée sur la puissance fiscale (marché tunisien / européen standard)
  const fiscalPower = vehicle?.fiscalPower || 6;
  if (fiscalPower <= 4) {
    return 42; // Petites citadines (Picanto, i10, C1, 108, etc.)
  } else if (fiscalPower <= 6) {
    return 48; // Citadines polyvalentes (Clio, 208, Rio, Polo, Fiesta, etc.)
  } else if (fiscalPower <= 8) {
    return 55; // Compactes et berlines moyennes (Megane, Golf, 308, Focus, Astra, etc.)
  } else {
    return 62; // Grandes berlines, SUV et routières
  }
}

/**
 * Calcule la consommation réelle (L/100km) pour un intervalle précis entre deux pleins consécutifs [i-1, i].
 * 
 * Formule exacte avec prise en compte du carburant résiduel (Jauge) :
 * - Carburant au début de l'intervalle (après le plein i-1) : F_start = (G_{i-1} * Cap) + Q_{i-1}
 * - Carburant à la fin de l'intervalle (avant le plein i) : F_end = G_i * Cap
 * - Volume consommé = F_start - F_end = Q_{i-1} + Cap * (G_{i-1} - G_i)
 * - Consommation = (Volume consommé / Distance) * 100
 */
export function calculateIntervalConsumption(
  previousLog: FuelLog,
  currentLog: FuelLog,
  tankCapacity: number
): { consumption: number; distance: number; consumedFuel: number } | null {
  const distance = currentLog.mileage - previousLog.mileage;
  if (distance <= 0) return null;

  const prevGauge = (previousLog.gaugeLevelBefore !== undefined && previousLog.gaugeLevelBefore !== null)
    ? previousLog.gaugeLevelBefore
    : 0.125; // 1/8 par défaut si non spécifié

  const currGauge = (currentLog.gaugeLevelBefore !== undefined && currentLog.gaugeLevelBefore !== null)
    ? currentLog.gaugeLevelBefore
    : 0.125;

  // Volume consommé prenant en compte la différence de jauge
  let consumedFuel = previousLog.quantity + (tankCapacity * (prevGauge - currGauge));

  // Sécurité anti-aberration (si le calcul donne <= 0 à cause d'une jauge mal ajustée)
  if (consumedFuel <= 0) {
    consumedFuel = currentLog.quantity;
  }

  let consumption = (consumedFuel / distance) * 100;

  // Plage de plausibilité automobile
  if (consumption < 2.0) consumption = 2.0;
  if (consumption > 35.0) consumption = 35.0;

  return {
    consumption: parseFloat(consumption.toFixed(2)),
    distance,
    consumedFuel: parseFloat(consumedFuel.toFixed(2))
  };
}

/**
 * Calcule la consommation moyenne globale (L/100km) sur l'ensemble de l'historique des pleins.
 * 
 * Formule globale avec jauge de départ (Log 0) et jauge finale (Log N-1) :
 * - Total distance = Mileage_{N-1} - Mileage_0
 * - Total carburant consommé = Somme(Q_0 ... Q_{N-2}) + Cap * (G_0 - G_{N-1})
 * - Moyenne = (Total carburant consommé / Total distance) * 100
 */
export function calculateAverageFuelConsumption(
  fuelLogs: FuelLog[],
  tankCapacity: number
): number | null {
  if (!fuelLogs || fuelLogs.length < 2) return null;

  const sortedLogs = [...fuelLogs].sort((a, b) => a.mileage - b.mileage);
  const firstLog = sortedLogs[0];
  const lastLog = sortedLogs[sortedLogs.length - 1];
  const totalDistance = lastLog.mileage - firstLog.mileage;

  if (totalDistance <= 0) return null;

  // Somme des quantités ajoutées pour tous les intervalles sauf le tout dernier plein
  let sumQuantities = 0;
  for (let i = 0; i < sortedLogs.length - 1; i++) {
    sumQuantities += sortedLogs[i].quantity;
  }

  const startGauge = (firstLog.gaugeLevelBefore !== undefined && firstLog.gaugeLevelBefore !== null)
    ? firstLog.gaugeLevelBefore
    : 0.125;

  const endGauge = (lastLog.gaugeLevelBefore !== undefined && lastLog.gaugeLevelBefore !== null)
    ? lastLog.gaugeLevelBefore
    : 0.125;

  // Correction par la différence entre le niveau de départ et le niveau d'arrivée
  const gaugeDifferenceLiters = (startGauge - endGauge) * tankCapacity;
  let totalConsumed = sumQuantities + gaugeDifferenceLiters;

  if (totalConsumed <= 0) {
    // Fallback standard si entrée erronée
    totalConsumed = sortedLogs.slice(1).reduce((sum, log) => sum + log.quantity, 0);
  }

  const avg = (totalConsumed / totalDistance) * 100;
  if (avg < 2.0 || avg > 35.0) return null;

  return parseFloat(avg.toFixed(2));
}

export interface SmartAutonomieResult {
  remainingRangeKm: number;
  daysUntilEmpty: number;
  currentFuelLiters: number;
  tankCapacity: number;
  fuelPercentage: number;
  initialFuelAfterRefill: number;
  kmPerDay: number;
}

/**
 * Calcule l'Autonomie Intelligente ("Smart Autonomie") en temps réel.
 * Prend en compte :
 * 1. Le niveau de jauge avant le dernier plein (gaugeLevelBefore)
 * 2. La quantité ajoutée lors du dernier plein
 * 3. La capacité du réservoir
 * 4. La consommation réelle du véhicule
 * 5. L'estimation des kilomètres parcourus depuis le dernier plein selon l'intensité journalière
 */
export function calculateSmartAutonomie(
  vehicle: Vehicle,
  fuelLogs: FuelLog[],
  tankCapacity: number,
  latestConsumption?: number | null,
  averageConsumption?: number | null
): SmartAutonomieResult | null {
  if (!fuelLogs || fuelLogs.length === 0) return null;

  const sortedLogs = [...fuelLogs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.mileage - b.mileage);
  const lastLog = sortedLogs[sortedLogs.length - 1];

  // 1. Niveau de carburant dans le réservoir JUSTE APRÈS le dernier plein
  const gaugeBefore = (lastLog.gaugeLevelBefore !== undefined && lastLog.gaugeLevelBefore !== null)
    ? lastLog.gaugeLevelBefore
    : 0.125;

  const fuelBeforeRefill = gaugeBefore * tankCapacity;
  const initialFuelAfterRefill = Math.min(tankCapacity, fuelBeforeRefill + lastLog.quantity);

  // 2. Détermination du taux de consommation (L/100km)
  const fiscalPower = vehicle.fiscalPower || 6;
  const isDiesel = vehicle.fuelType === 'Diesel';
  const baselineConsumption = isDiesel ? 5.2 + (fiscalPower - 4) * 0.4 : 7.0 + (fiscalPower - 4) * 0.5;

  const consumptionRate = (latestConsumption && latestConsumption > 2.0 && latestConsumption < 30.0)
    ? latestConsumption
    : (averageConsumption && averageConsumption > 2.0 && averageConsumption < 30.0)
      ? averageConsumption
      : baselineConsumption;

  // 3. Calcul de l'intensité moyenne en km/jour
  let kmPerDay = 30; // Valeur par défaut
  let avgDaysBetweenLogs = 14;

  if (sortedLogs.length >= 2) {
    const timeStats: number[] = [];
    let totalDist = 0;
    let totalDays = 0;

    for (let i = 1; i < sortedLogs.length; i++) {
      const prev = sortedLogs[i - 1];
      const curr = sortedLogs[i];
      const dist = curr.mileage - prev.mileage;
      const days = Math.max(1, Math.ceil((new Date(curr.date).getTime() - new Date(prev.date).getTime()) / (1000 * 60 * 60 * 24)));
      if (dist > 0) {
        totalDist += dist;
        totalDays += days;
        timeStats.push(days);
      }
    }

    if (totalDays > 0 && totalDist > 0) {
      kmPerDay = Math.max(5, Math.min(250, totalDist / totalDays));
    }
    if (timeStats.length > 0) {
      avgDaysBetweenLogs = timeStats.reduce((a, b) => a + b, 0) / timeStats.length;
    }
  }

  // 4. Estimation de la distance parcourue depuis le dernier plein
  const now = new Date();
  const lastLogDate = new Date(lastLog.date);
  const hoursPassed = Math.max(0, (now.getTime() - lastLogDate.getTime()) / (1000 * 60 * 60));
  const daysPassed = hoursPassed / 24;

  // Amortissement adaptatif si aucune saisie depuis longtemps
  let adaptiveKmPerDay = kmPerDay;
  const latencyThreshold = avgDaysBetweenLogs * 1.15;
  if (daysPassed > latencyThreshold) {
    const overtime = daysPassed - latencyThreshold;
    const dampingFactor = 1 / (1 + (overtime / (avgDaysBetweenLogs * 0.5)));
    adaptiveKmPerDay = Math.max(2, kmPerDay * dampingFactor);
  }

  const estimatedDistanceDrivenSinceLog = daysPassed * adaptiveKmPerDay;
  const fuelConsumedSinceLog = (estimatedDistanceDrivenSinceLog * consumptionRate) / 100;

  // Carburant restant actuellement
  const currentFuelLiters = Math.max(0, initialFuelAfterRefill - fuelConsumedSinceLog);
  const fuelPercentage = Math.min(100, Math.max(0, (currentFuelLiters / tankCapacity) * 100));

  // Autonomie restante en km
  const remainingRangeKm = (currentFuelLiters / consumptionRate) * 100;
  const daysUntilEmpty = adaptiveKmPerDay > 0 ? (remainingRangeKm / adaptiveKmPerDay) : 99;

  return {
    remainingRangeKm: Math.round(remainingRangeKm),
    daysUntilEmpty: parseFloat(daysUntilEmpty.toFixed(1)),
    currentFuelLiters: parseFloat(currentFuelLiters.toFixed(1)),
    tankCapacity,
    fuelPercentage: Math.round(fuelPercentage),
    initialFuelAfterRefill: parseFloat(initialFuelAfterRefill.toFixed(1)),
    kmPerDay: parseFloat(adaptiveKmPerDay.toFixed(1))
  };
}

/**
 * Calcule le niveau moyen de la jauge (en %) au moment où l'utilisateur décide de faire le plein.
 * Permet d'analyser l'habitude de ravitaillement du conducteur (ex: fait le plein à 15% en réserve, ou à 35% quart plein).
 */
export function calculateAverageRefillGaugeLevel(fuelLogs: FuelLog[]): number | null {
  if (!fuelLogs || fuelLogs.length === 0) return null;

  const validLogs = fuelLogs.filter(
    log => log.gaugeLevelBefore !== undefined && log.gaugeLevelBefore !== null && log.gaugeLevelBefore >= 0 && log.gaugeLevelBefore <= 1
  );

  if (validLogs.length === 0) return null;

  const sumGauge = validLogs.reduce((sum, log) => sum + log.gaugeLevelBefore!, 0);
  const avgFraction = sumGauge / validLogs.length;

  return Math.round(avgFraction * 100);
}

/**
 * Retourne un libellé qualitatif de l'habitude de ravitaillement selon le niveau moyen de la jauge
 */
export function getRefillHabitDescription(avgGaugePercentage: number): { label: string; icon: string; text: string } {
  if (avgGaugePercentage < 15) {
    return { label: 'En réserve', icon: '🔴', text: 'Fait le plein en zone de réserve' };
  } else if (avgGaugePercentage < 35) {
    return { label: 'Quart réservoir', icon: '🟡', text: 'Fait le plein au quart du réservoir' };
  } else if (avgGaugePercentage < 60) {
    return { label: 'Mi-réservoir', icon: '🟢', text: 'Fait le plein à moitié de réservoir' };
  } else {
    return { label: 'Plein préventif', icon: '✅', text: 'Fait le plein très tôt par anticipation' };
  }
}

