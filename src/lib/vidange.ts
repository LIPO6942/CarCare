import type { FuelLog, Repair, Maintenance } from './types';

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

  const firstEvent = sortedEvents[0];
  const lastEvent = sortedEvents[sortedEvents.length - 1];

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

/**
 * Calcule les jours restants avant une date
 */
export function getDaysRemaining(targetDate: Date, fromDate: Date = new Date()): number {
  const diffTime = targetDate.getTime() - fromDate.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}
