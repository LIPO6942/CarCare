import type { FuelLog, Repair, Maintenance, Vehicle } from './types';
import { calculateCalendarDaysDiff, getCanonicalTask } from './reminder-utils';

/**
 * Calcule la moyenne de km par jour basée sur l'historique des pleins et entretiens
 * @param events - Liste des événements (pleins, réparations, entretiens) avec date et kilométrage
 * @returns Moyenne de km par jour ou null si pas assez de données
 */
export function calculateAverageKmPerDay(
  events: Array<{ date: string; mileage: number }>
): number | null {
  if (events.length < 2) return null;

  // Trier par date croissante
  const sortedEvents = [...events]
    .filter(e => e.mileage > 0 && e.date && !isNaN(new Date(e.date).getTime()))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (sortedEvents.length < 2) return null;

  // Prefer recent usage (last 30 days from the latest event) to better match current driving habits.
  const lastEventDate = new Date(sortedEvents[sortedEvents.length - 1].date);
  const recentCutoff = new Date(lastEventDate);
  recentCutoff.setDate(recentCutoff.getDate() - 30);

  const recentEvents = sortedEvents.filter(e => new Date(e.date) >= recentCutoff);
  const windowEvents = recentEvents.length >= 2 ? recentEvents : sortedEvents;

  const firstEvent = windowEvents[0];
  const lastEvent = windowEvents[windowEvents.length - 1];

  const firstDate = new Date(firstEvent.date);
  const lastDate = new Date(lastEvent.date);
  const daysDiff = Math.max(1, Math.ceil((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)));
  
  const kmDiff = lastEvent.mileage - firstEvent.mileage;
  
  if (kmDiff <= 0 || daysDiff <= 0) return null;

  // Retourne la moyenne avec un minimum de 5 km/jour pour éviter les estimations trop faibles
  return Math.max(5, kmDiff / daysDiff);
}

/**
 * Estime la date de vidange basée sur le kilométrage restant et la moyenne km/jour
 * @param currentMileage - Kilométrage actuel du véhicule
 * @param nextDueMileage - Kilométrage prévu pour la prochaine vidange
 * @param avgKmPerDay - Moyenne de km par jour
 * @returns Date estimée de la vidange ou null si impossible à calculer
 */
export function estimateVidangeDate(
  currentMileage: number,
  nextDueMileage: number,
  avgKmPerDay: number | null
): Date | null {
  if (!avgKmPerDay || avgKmPerDay <= 0) return null;

  const kmRemaining = nextDueMileage - currentMileage;
  if (kmRemaining <= 0) return new Date(); // Déjà dûe

  const daysRemaining = Math.ceil(kmRemaining / avgKmPerDay);
  const estimatedDate = new Date();
  estimatedDate.setDate(estimatedDate.getDate() + daysRemaining);
  
  return estimatedDate;
}

/**
 * Formate une date pour l'affichage en français
 */
export function formatDateToFrench(date: Date): string {
  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function toLocalStartOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Calcule les jours restants avant une date
 */
export function getDaysRemaining(targetDate: Date, fromDate: Date = new Date()): number {
  const startTarget = toLocalStartOfDay(targetDate);
  const startFrom = toLocalStartOfDay(fromDate);
  const diffTime = startTarget.getTime() - startFrom.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export interface VidangeStandardItem {
  id: string;
  label: string;
  shortLabel: string;
  category: string;
  isMandatoryOrFrequent: boolean;
}

export const STANDARD_VIDANGE_ITEMS: VidangeStandardItem[] = [
  { id: 'huile', label: 'Huile moteur', shortLabel: 'Huile', category: 'Lubrification', isMandatoryOrFrequent: true },
  { id: 'filtre_huile', label: 'Filtre à huile', shortLabel: 'Filtre huile', category: 'Filtration', isMandatoryOrFrequent: true },
  { id: 'filtre_air', label: 'Filtre à air', shortLabel: 'Filtre air', category: 'Filtration', isMandatoryOrFrequent: false },
  { id: 'filtre_carburant', label: 'Filtre à carburant (gasoil/essence)', shortLabel: 'Filtre carburant', category: 'Filtration', isMandatoryOrFrequent: false },
  { id: 'filtre_habitacle', label: 'Filtre habitacle (climatisation)', shortLabel: 'Filtre habitacle', category: 'Confort / Air', isMandatoryOrFrequent: false },
  { id: 'bougies', label: 'Bougies d’allumage', shortLabel: 'Bougies', category: 'Allumage', isMandatoryOrFrequent: false },
];

/**
 * Détermine si un véhicule possède un filtre à carburant externe / remplaçable.
 * Sur de nombreux modèles essence modernes (ex: Peugeot 308, 208, Citroën C3, C4...),
 * le filtre à essence est intégré au réservoir / pompe immergée et n'est pas à remplacer en vidange.
 */
export function isFuelFilterApplicable(vehicle?: Vehicle | null): boolean {
  if (!vehicle) return true;
  if (vehicle.hasFuelFilter === false) return false;
  if (vehicle.hasFuelFilter === true) return true;

  if (typeof window !== 'undefined') {
    const local = localStorage.getItem(`carcare_no_fuel_filter_${vehicle.id}`);
    if (local === 'true') return false;
    if (local === 'false') return true;
  }

  // Détection automatique pour les véhicules essence sans filtre externe (ex: Peugeot 308 essence)
  if (vehicle.fuelType === 'Essence') {
    const brand = (vehicle.brand || '').toLowerCase().trim();
    const model = (vehicle.model || '').toLowerCase().trim();

    // Modèles Peugeot essence (308, 208, 2008, 3008, 508, RCZ)
    if (brand.includes('peugeot') && (model.includes('308') || model.includes('208') || model.includes('2008') || model.includes('3008') || model.includes('508') || model.includes('rcz'))) {
      return false;
    }
    // Modèles Citroën essence (C3, C4, C4 Cactus, DS3, DS4)
    if (brand.includes('citroen') && (model.includes('c3') || model.includes('c4') || model.includes('ds3') || model.includes('ds4'))) {
      return false;
    }
    // Modèles Renault essence sans filtre externe (Clio 4/5, Captur, Megane 3/4)
    if (brand.includes('renault') && (model.includes('clio') || model.includes('captur') || model.includes('megane'))) {
      return false;
    }
  }

  return true;
}

/**
 * Retourne la liste des éléments de vidange applicables pour ce véhicule
 */
export function getStandardVidangeItems(vehicle?: Vehicle | null): VidangeStandardItem[] {
  const hasFilter = isFuelFilterApplicable(vehicle);
  const isDiesel = vehicle?.fuelType === 'Diesel';

  return STANDARD_VIDANGE_ITEMS
    .filter(item => {
      if (item.id === 'filtre_carburant' && !hasFilter) return false;
      return true;
    })
    .map(item => {
      if (item.id === 'filtre_carburant') {
        return {
          ...item,
          label: isDiesel ? 'Filtre à carburant (gasoil)' : 'Filtre à carburant (essence)',
          shortLabel: isDiesel ? 'Filtre gasoil' : 'Filtre essence',
        };
      }
      return item;
    });
}

export interface WearItemPrediction {
  id: string;
  label: string;
  shortLabel: string;
  category: string;
  status: 'recommended' | 'good';
  vidangesElapsed: number;
  kmElapsed: number | null;
  lastReplacedDate: string | null;
  recommendationMessage: string;
}

export interface LastVidangeSummary {
  hasHistory: boolean;
  lastVidange: Maintenance | null;
  date: string | null;
  mileage: number | null;
  kmSinceLastVidange: number | null;
  cost: number;
  replacedItems: string[];
  replacedItemIds: string[];
  notReplacedItems: string[];
  predictions: WearItemPrediction[];
  nearbyEvents: Array<{ title: string; date: string; cost: number; source: 'maintenance' | 'repair'; description?: string }>;
}

export function getLastVidangeSummary(params: {
  vehicleId: string;
  maintenanceList: Maintenance[];
  repairsList: Repair[];
  currentMileage?: number;
  vehicle?: Vehicle | null;
}): LastVidangeSummary {
  const { vehicleId, maintenanceList, repairsList, currentMileage, vehicle } = params;

  const today = new Date();
  today.setHours(23, 59, 59, 999);

  const pastVidanges = maintenanceList
    .filter(m => m.vehicleId === vehicleId && getCanonicalTask(m.task) === 'vidange' && m.date && new Date(m.date).getTime() <= today.getTime())
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const lastVidange = pastVidanges[0] || null;

  const standardItems = getStandardVidangeItems(vehicle);

  if (!lastVidange || !lastVidange.date) {
    return {
      hasHistory: false,
      lastVidange: null,
      date: null,
      mileage: null,
      kmSinceLastVidange: null,
      cost: 0,
      replacedItems: [],
      replacedItemIds: [],
      notReplacedItems: standardItems.map(i => i.label),
      predictions: [],
      nearbyEvents: [],
    };
  }

  // Événements dans la fenêtre de +/- 3 jours ou même kilométrage (+/- 50 km)
  const nearbyEvents: Array<{ title: string; date: string; cost: number; source: 'maintenance' | 'repair'; description?: string; replacedItems?: string[] }> = [];

  maintenanceList.forEach(m => {
    if (m.vehicleId !== vehicleId || !m.date) return;
    if (m.id === lastVidange.id) return;

    const daysDiff = Math.abs(calculateCalendarDaysDiff(m.date, lastVidange.date));
    const mileageDiff = (lastVidange.mileage > 0 && m.mileage > 0) ? Math.abs(m.mileage - lastVidange.mileage) : 9999;

    if (daysDiff <= 3 || mileageDiff <= 50) {
      nearbyEvents.push({
        title: m.task || 'Entretien',
        description: m.notes || '',
        date: m.date,
        cost: m.cost || 0,
        source: 'maintenance',
        replacedItems: m.replacedItems || []
      });
    }
  });

  repairsList.forEach(r => {
    if (r.vehicleId !== vehicleId || !r.date) return;

    const daysDiff = Math.abs(calculateCalendarDaysDiff(r.date, lastVidange.date));
    const mileageDiff = (lastVidange.mileage > 0 && r.mileage > 0) ? Math.abs(r.mileage - lastVidange.mileage) : 9999;

    if (daysDiff <= 3 || mileageDiff <= 50) {
      nearbyEvents.push({
        title: r.description || r.category || 'Réparation',
        description: r.description || '',
        date: r.date,
        cost: r.cost || 0,
        source: 'repair',
      });
    }
  });

  // Identifier les éléments remplacés
  const detectedIds = new Set<string>();

  // 1. Éléments explicitement enregistrés dans la dernière vidange
  if (Array.isArray(lastVidange.replacedItems)) {
    lastVidange.replacedItems.forEach(id => detectedIds.add(id));
  }

  // 2. Éléments enregistrés dans les entretiens concomitants (± 3 jours)
  nearbyEvents.forEach(evt => {
    if (Array.isArray(evt.replacedItems)) {
      evt.replacedItems.forEach(id => detectedIds.add(id));
    }
  });

  // 3. Scan sémantique du texte : vidange + TOUTES les opérations concomitantes (titres + notes/descriptions)
  // Prise en compte immédiate des bougies ou autres pièces faites en entretien concomitant
  const textCorpus = [
    lastVidange.task || '',
    lastVidange.notes || '',
    ...nearbyEvents.map(e => `${e.title} ${e.description || ''}`)
  ].join(' ').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  if (textCorpus.includes('huile') || textCorpus.includes('vidange')) {
    detectedIds.add('huile');
  }
  if (textCorpus.includes('filtre a huile') || textCorpus.includes('filtre huile') || (textCorpus.includes('filtre') && textCorpus.includes('huile')) || textCorpus.includes('vidange')) {
    detectedIds.add('filtre_huile');
  }
  if (textCorpus.includes('filtre a air') || textCorpus.includes('filtre air')) {
    detectedIds.add('filtre_air');
  }
  if (isFuelFilterApplicable(vehicle) && (textCorpus.includes('filtre a carburant') || textCorpus.includes('filtre carburant') || textCorpus.includes('filtre gasoil') || textCorpus.includes('filtre a gasoil') || textCorpus.includes('filtre essence') || textCorpus.includes('filtre a essence') || textCorpus.includes('gasoil') || textCorpus.includes('gazole'))) {
    detectedIds.add('filtre_carburant');
  }
  if (textCorpus.includes('filtre habitacle') || textCorpus.includes('filtre clim') || textCorpus.includes('filtre pollen') || textCorpus.includes('filtre a pollen') || textCorpus.includes('habitacle') || textCorpus.includes('climatisation')) {
    detectedIds.add('filtre_habitacle');
  }
  if (textCorpus.includes('bougie') || textCorpus.includes('allumage')) {
    detectedIds.add('bougies');
  }

  const replacedItems: string[] = [];
  const replacedItemIds: string[] = [];
  const notReplacedItems: string[] = [];

  standardItems.forEach(item => {
    if (detectedIds.has(item.id)) {
      replacedItems.push(item.label);
      replacedItemIds.push(item.id);
    } else {
      notReplacedItems.push(item.label);
    }
  });

  const kmSince = (currentMileage && lastVidange.mileage && currentMileage >= lastVidange.mileage)
    ? currentMileage - lastVidange.mileage
    : null;

  // Calcul prédictif d'usure des filtres et bougies sur l'ensemble de l'historique
  const itemMatchesText = (text: string, itemId: string): boolean => {
    const clean = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (itemId === 'filtre_air' && (clean.includes('filtre a air') || clean.includes('filtre air'))) return true;
    if (itemId === 'filtre_carburant' && (clean.includes('filtre a carburant') || clean.includes('filtre carburant') || clean.includes('filtre gasoil') || clean.includes('filtre a gasoil') || clean.includes('filtre essence') || clean.includes('filtre a essence') || clean.includes('gasoil') || clean.includes('gazole'))) return true;
    if (itemId === 'filtre_habitacle' && (clean.includes('filtre habitacle') || clean.includes('filtre clim') || clean.includes('filtre pollen') || clean.includes('habitacle') || clean.includes('climatisation'))) return true;
    if (itemId === 'bougies' && (clean.includes('bougie') || clean.includes('allumage'))) return true;
    return false;
  };

  const wearItemIds = ['filtre_carburant', 'filtre_air', 'filtre_habitacle', 'bougies'].filter(id => {
    if (id === 'filtre_carburant' && !isFuelFilterApplicable(vehicle)) return false;
    return true;
  });

  const predictions: WearItemPrediction[] = [];

  wearItemIds.forEach(itemId => {
    const stdItem = standardItems.find(i => i.id === itemId);
    if (!stdItem) return;

    // Rechercher TOUS les événements historiques (vidanges, entretiens séparés, réparations) où cette pièce a été changée
    const replacementEvents: Array<{ date: string; mileage: number | null }> = [];

    maintenanceList.forEach(m => {
      if (m.vehicleId !== vehicleId || !m.date) return;
      if (new Date(m.date).getTime() > today.getTime()) return;
      if ((Array.isArray(m.replacedItems) && m.replacedItems.includes(itemId)) || itemMatchesText(`${m.task || ''} ${m.notes || ''}`, itemId)) {
        replacementEvents.push({ date: m.date, mileage: m.mileage || null });
      }
    });

    repairsList.forEach(r => {
      if (r.vehicleId !== vehicleId || !r.date) return;
      if (new Date(r.date).getTime() > today.getTime()) return;
      if (itemMatchesText(`${r.description || ''} ${r.category || ''}`, itemId)) {
        replacementEvents.push({ date: r.date, mileage: r.mileage || null });
      }
    });

    // Si la pièce a été détectée dans la dernière vidange ou ses événements concomitants
    if (detectedIds.has(itemId) && lastVidange.date) {
      replacementEvents.push({ date: lastVidange.date, mileage: lastVidange.mileage || null });
    }

    replacementEvents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    let vidangesElapsed = 0;
    let kmElapsed: number | null = null;
    let lastDate: string | null = null;
    let lastMileage: number | null = null;

    if (replacementEvents.length > 0) {
      const mostRecent = replacementEvents[0];
      lastDate = mostRecent.date;
      lastMileage = mostRecent.mileage;

      // Nombre de vidanges passées strictement APRES ce remplacement (au-delà de 3 jours)
      vidangesElapsed = pastVidanges.filter(v => v.date && new Date(v.date) > new Date(mostRecent.date) && Math.abs(calculateCalendarDaysDiff(v.date, mostRecent.date)) > 3).length;

      const refMileage = currentMileage || lastVidange.mileage || 0;
      if (lastMileage && refMileage >= lastMileage) {
        kmElapsed = refMileage - lastMileage;
      }
    } else {
      vidangesElapsed = pastVidanges.length;
    }

    let status: 'recommended' | 'good' = 'good';
    let recommendationMessage = '';

    if (itemId === 'filtre_carburant') {
      if (vidangesElapsed >= 2 || (kmElapsed !== null && kmElapsed >= 20000) || (vidangesElapsed === 1 && pastVidanges.length >= 2)) {
        status = 'recommended';
        recommendationMessage = `Non remplacé depuis ${vidangesElapsed >= 2 ? `${vidangesElapsed} vidanges` : 'la dernière vidange'}${kmElapsed ? ` (~${kmElapsed.toLocaleString('fr-FR')} km)` : ''} → Remplacement vivement conseillé.`;
      } else if (vidangesElapsed === 0) {
        status = 'good';
        recommendationMessage = 'Remplacé à la dernière vidange (ou entretien concomitant) → Encore en bon état.';
      } else {
        status = 'good';
        recommendationMessage = 'Cycle acceptable (recommandé tous les 20 000 km ou 2 vidanges).';
      }
    } else if (itemId === 'filtre_air') {
      if (vidangesElapsed >= 2 || (kmElapsed !== null && kmElapsed >= 18000)) {
        status = 'recommended';
        recommendationMessage = `Non remplacé depuis ${vidangesElapsed} vidanges${kmElapsed ? ` (~${kmElapsed.toLocaleString('fr-FR')} km)` : ''} → Remplacement conseillé pour le moteur.`;
      } else if (vidangesElapsed === 0) {
        status = 'good';
        recommendationMessage = 'Remplacé récemment (vidange ou entretien concomitant).';
      } else {
        status = 'good';
        recommendationMessage = 'À contrôler visuellement lors de la vidange.';
      }
    } else if (itemId === 'filtre_habitacle') {
      if (vidangesElapsed >= 2 || (kmElapsed !== null && kmElapsed >= 18000)) {
        status = 'recommended';
        recommendationMessage = `Non changé depuis ${vidangesElapsed} vidanges → Remplacement conseillé pour l'air de l'habitacle.`;
      } else if (vidangesElapsed === 0) {
        status = 'good';
        recommendationMessage = 'Filtre d\'habitacle récent.';
      } else {
        status = 'good';
        recommendationMessage = 'État satisfaisant.';
      }
    } else if (itemId === 'bougies') {
      if (vidangesElapsed >= 3 || (kmElapsed !== null && kmElapsed >= 30000)) {
        status = 'recommended';
        recommendationMessage = `Non remplacées depuis ${vidangesElapsed} vidanges${kmElapsed ? ` (~${kmElapsed.toLocaleString('fr-FR')} km)` : ''} → Remplacement conseillé pour l'allumage.`;
      } else if (vidangesElapsed === 0) {
        status = 'good';
        recommendationMessage = 'Bougies d’allumage remplacées récemment (vidange ou entretien concomitant).';
      } else {
        status = 'good';
        recommendationMessage = 'Bougies encore dans leur cycle d\'usure normal.';
      }
    }

    predictions.push({
      id: itemId,
      label: stdItem.label,
      shortLabel: stdItem.shortLabel,
      category: stdItem.category,
      status,
      vidangesElapsed,
      kmElapsed,
      lastReplacedDate: lastDate,
      recommendationMessage,
    });
  });

  return {
    hasHistory: true,
    lastVidange,
    date: lastVidange.date,
    mileage: lastVidange.mileage || null,
    kmSinceLastVidange: kmSince,
    cost: lastVidange.cost || 0,
    replacedItems,
    replacedItemIds,
    notReplacedItems,
    predictions,
    nearbyEvents,
  };
}
