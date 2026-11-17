import type { FuelLog, Repair, Maintenance } from './types';
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
  nearbyEvents: Array<{ title: string; date: string; cost: number; source: 'maintenance' | 'repair' }>;
}

export function getLastVidangeSummary(params: {
  vehicleId: string;
  maintenanceList: Maintenance[];
  repairsList: Repair[];
  currentMileage?: number;
}): LastVidangeSummary {
  const { vehicleId, maintenanceList, repairsList, currentMileage } = params;

  const today = new Date();
  today.setHours(23, 59, 59, 999);

  const pastVidanges = maintenanceList
    .filter(m => m.vehicleId === vehicleId && getCanonicalTask(m.task) === 'vidange' && m.date && new Date(m.date).getTime() <= today.getTime())
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const lastVidange = pastVidanges[0] || null;

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
      notReplacedItems: STANDARD_VIDANGE_ITEMS.map(i => i.label),
      predictions: [],
      nearbyEvents: [],
    };
  }

  // Événements dans la fenêtre de +/- 3 jours ou même kilométrage (+/- 50 km)
  const nearbyEvents: Array<{ title: string; date: string; cost: number; source: 'maintenance' | 'repair' }> = [];

  maintenanceList.forEach(m => {
    if (m.vehicleId !== vehicleId || !m.date) return;
    if (m.id === lastVidange.id) return;

    const daysDiff = Math.abs(calculateCalendarDaysDiff(m.date, lastVidange.date));
    const mileageDiff = (lastVidange.mileage > 0 && m.mileage > 0) ? Math.abs(m.mileage - lastVidange.mileage) : 9999;

    if (daysDiff <= 3 || mileageDiff <= 50) {
      nearbyEvents.push({
        title: m.task || 'Entretien',
        date: m.date,
        cost: m.cost || 0,
        source: 'maintenance'
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
        date: r.date,
        cost: r.cost || 0,
        source: 'repair'
      });
    }
  });

  // Identifier les éléments remplacés
  const detectedIds = new Set<string>();

  if (Array.isArray(lastVidange.replacedItems) && lastVidange.replacedItems.length > 0) {
    lastVidange.replacedItems.forEach(id => detectedIds.add(id));
  } else {
    const textCorpus = [
      lastVidange.task || '',
      lastVidange.notes || '',
      ...nearbyEvents.map(e => e.title)
    ].join(' ').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    if (textCorpus.includes('huile') || textCorpus.includes('vidange')) {
      detectedIds.add('huile');
    }
    if (textCorpus.includes('filtre a huile') || textCorpus.includes('filtre huile') || (textCorpus.includes('filtre') && textCorpus.includes('huile'))) {
      detectedIds.add('filtre_huile');
    } else if (textCorpus.includes('vidange')) {
      detectedIds.add('filtre_huile');
    }
    if (textCorpus.includes('filtre a air') || textCorpus.includes('filtre air')) {
      detectedIds.add('filtre_air');
    }
    if (textCorpus.includes('filtre a carburant') || textCorpus.includes('filtre carburant') || textCorpus.includes('filtre gasoil') || textCorpus.includes('filtre a gasoil') || textCorpus.includes('filtre essence') || textCorpus.includes('filtre a essence') || textCorpus.includes('gasoil')) {
      detectedIds.add('filtre_carburant');
    }
    if (textCorpus.includes('filtre habitacle') || textCorpus.includes('filtre clim') || textCorpus.includes('filtre pollen') || textCorpus.includes('filtre a pollen') || textCorpus.includes('habitacle') || textCorpus.includes('climatisation')) {
      detectedIds.add('filtre_habitacle');
    }
    if (textCorpus.includes('bougie') || textCorpus.includes('allumage')) {
      detectedIds.add('bougies');
    }
  }

  const replacedItems: string[] = [];
  const replacedItemIds: string[] = [];
  const notReplacedItems: string[] = [];

  STANDARD_VIDANGE_ITEMS.forEach(item => {
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
  const isItemInMaintenance = (m: Maintenance, itemId: string): boolean => {
    if (Array.isArray(m.replacedItems) && m.replacedItems.includes(itemId)) {
      return true;
    }
    const text = [m.task || '', m.notes || ''].join(' ').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (itemId === 'filtre_air' && (text.includes('filtre a air') || text.includes('filtre air'))) return true;
    if (itemId === 'filtre_carburant' && (text.includes('filtre a carburant') || text.includes('filtre carburant') || text.includes('filtre gasoil') || text.includes('filtre a gasoil') || text.includes('filtre essence') || text.includes('filtre a essence') || text.includes('gasoil'))) return true;
    if (itemId === 'filtre_habitacle' && (text.includes('filtre habitacle') || text.includes('filtre clim') || text.includes('filtre pollen') || text.includes('habitacle') || text.includes('climatisation'))) return true;
    if (itemId === 'bougies' && (text.includes('bougie') || text.includes('allumage'))) return true;
    return false;
  };

  const wearItemIds = ['filtre_carburant', 'filtre_air', 'filtre_habitacle', 'bougies'];
  const predictions: WearItemPrediction[] = [];

  wearItemIds.forEach(itemId => {
    const stdItem = STANDARD_VIDANGE_ITEMS.find(i => i.id === itemId);
    if (!stdItem) return;

    let foundIndex = -1;
    let lastDate: string | null = null;
    let lastMileage: number | null = null;

    for (let i = 0; i < pastVidanges.length; i++) {
      const v = pastVidanges[i];
      if (isItemInMaintenance(v, itemId)) {
        foundIndex = i;
        lastDate = v.date;
        lastMileage = v.mileage || null;
        break;
      }
    }

    const vidangesElapsed = foundIndex >= 0 ? foundIndex : pastVidanges.length;
    let kmElapsed: number | null = null;
    const refMileage = currentMileage || lastVidange.mileage || 0;
    if (lastMileage && refMileage >= lastMileage) {
      kmElapsed = refMileage - lastMileage;
    }

    let status: 'recommended' | 'good' = 'good';
    let recommendationMessage = '';

    if (itemId === 'filtre_carburant') {
      if (vidangesElapsed >= 2 || (kmElapsed !== null && kmElapsed >= 20000) || (vidangesElapsed === 1 && pastVidanges.length >= 2)) {
        status = 'recommended';
        recommendationMessage = `Non remplacé depuis ${vidangesElapsed >= 2 ? `${vidangesElapsed} vidanges` : 'la dernière vidange'}${kmElapsed ? ` (~${kmElapsed.toLocaleString('fr-FR')} km)` : ''} → Remplacement vivement conseillé.`;
      } else if (vidangesElapsed === 0) {
        status = 'good';
        recommendationMessage = 'Remplacé à la dernière vidange → Encore en bon état.';
      } else {
        status = 'good';
        recommendationMessage = 'Cycle correct (recommandé tous les 20 000 km ou 2 vidanges).';
      }
    } else if (itemId === 'filtre_air') {
      if (vidangesElapsed >= 2 || (kmElapsed !== null && kmElapsed >= 18000)) {
        status = 'recommended';
        recommendationMessage = `Non remplacé depuis ${vidangesElapsed} vidanges${kmElapsed ? ` (~${kmElapsed.toLocaleString('fr-FR')} km)` : ''} → Remplacement conseillé pour le moteur.`;
      } else if (vidangesElapsed === 0) {
        status = 'good';
        recommendationMessage = 'Remplacé récemment.';
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
        recommendationMessage = 'Bougies d\'allumage récentes.';
      } else {
        status = 'good';
        recommendationMessage = 'Bougies encore dans leur cycle d\'usure.';
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
