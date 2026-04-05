'use client';

import { useEffect } from 'react';
import { useAuth } from '@/context/auth-context';
import { getAllUserMaintenance, getAllUserRepairs, getAllUserFuelLogs, getVehicles } from '@/lib/data';
import type { Maintenance, Repair, FuelLog } from '@/lib/types';
import { calculateNextVignetteDate, getCorrectVignetteDeadline, getVignetteRules } from '@/lib/vignette';
import { calculateAverageKmPerDay, estimateVidangeDate, formatDateToFrench, getDaysRemaining } from '@/lib/vidange';

const NOTIFICATION_SNOOZE_KEY = 'carcarepro_notified_deadlines';
const REMINDER_DAYS_THRESHOLD = 7; // Notify 7 days before date-based deadline
const REMINDER_KM_THRESHOLD = 2000; // Notify 2000km before mileage-based deadline

interface NotifiedDeadline {
    [id: string]: boolean; // { maintenanceId: true }
}

// Helper to get notified deadlines from localStorage
function getNotifiedDeadlines(): NotifiedDeadline {
    if (typeof window === 'undefined') return {};
    try {
        const stored = localStorage.getItem(NOTIFICATION_SNOOZE_KEY);
        return stored ? JSON.parse(stored) : {};
    } catch (error) {
        console.error("Failed to parse notified deadlines from localStorage", error);
        return {};
    }
}

// Helper to save a notified deadline to localStorage
function addNotifiedDeadline(maintenanceId: string): void {
    if (typeof window === 'undefined') return;
    const notified = getNotifiedDeadlines();
    notified[maintenanceId] = true; // Mark as notified
    localStorage.setItem(NOTIFICATION_SNOOZE_KEY, JSON.stringify(notified));
}


async function checkDeadlinesAndNotify(userId: string) {
    if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
        // Cannot send notifications if permission is not granted
        return;
    }

    const [maintenanceTasks, repairs, fuelLogs, vehicles] = await Promise.all([
        getAllUserMaintenance(userId),
        getAllUserRepairs(userId),
        getAllUserFuelLogs(userId),
        getVehicles(userId)
    ]);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const reminderDateThreshold = new Date(today);
    reminderDateThreshold.setDate(today.getDate() + REMINDER_DAYS_THRESHOLD);

    const notifiedDeadlines = getNotifiedDeadlines();
    
    // Create a map of the latest known mileage for each vehicle
    const latestMileageMap = new Map<string, { mileage: number, date: Date }>();

    const allEvents = [
        ...repairs.map(item => ({...item, eventDate: new Date(item.date)})),
        ...maintenanceTasks.map(item => ({...item, eventDate: new Date(item.date)})),
        ...fuelLogs.map(item => ({...item, eventDate: new Date(item.date)}))
    ].filter(e => e.mileage > 0 && e.date && !isNaN(new Date(e.date).getTime()));

    allEvents.forEach(event => {
        const existing = latestMileageMap.get(event.vehicleId);
        if (!existing || event.eventDate > existing.date) {
            latestMileageMap.set(event.vehicleId, { mileage: event.mileage, date: event.eventDate });
        }
    });

    // For vignette tasks, keep only the most recent payment record per vehicle
    const latestVignetteByVehicle = new Map<string, Maintenance>();
    maintenanceTasks.forEach(m => {
      if (m.task === 'Vignette') {
        const existing = latestVignetteByVehicle.get(m.vehicleId);
        if (!existing || new Date(m.date) > new Date(existing.date)) {
          latestVignetteByVehicle.set(m.vehicleId, m);
        }
      }
    });

    // Synthesize missing vignette tasks
    const allMaintenanceTasks = [...maintenanceTasks];
    vehicles.forEach(vehicle => {
      if (vehicle.licensePlate && !latestVignetteByVehicle.has(vehicle.id)) {
        const deadlineDate = getCorrectVignetteDeadline(vehicle.licensePlate, today);
        const syntheticTask: Maintenance = {
          id: `synthetic-vignette-${vehicle.id}`,
          vehicleId: vehicle.id,
          task: 'Vignette',
          date: '',
          mileage: 0,
          cost: 0,
          nextDueDate: deadlineDate.toISOString().split('T')[0],
        } as any;
        allMaintenanceTasks.push(syntheticTask);
      }
    });


    for (const task of allMaintenanceTasks) {
        // Skip outdated vignette records (only evaluate the latest per vehicle)
        if (task.task === 'Vignette' && !task.id.startsWith('synthetic-') && latestVignetteByVehicle.get(task.vehicleId)?.id !== task.id) {
            continue;
        }

        // Check if a notification was already sent for this task, ever.
        if (notifiedDeadlines[task.id]) {
            continue; // Already notified for this task, skip.
        }

        // --- Logic for Mileage-Based Reminders (Vidange) with Date Estimation ---
        if (task.task === 'Vidange' && task.nextDueMileage && task.nextDueMileage > 0) {
            const vehicleMileage = latestMileageMap.get(task.vehicleId);
            if (!vehicleMileage) continue;

            const kmRemaining = task.nextDueMileage - vehicleMileage.mileage;
            
            // Get all events for this vehicle to calculate average km/day
            const vehicleEvents = allEvents.filter(e => e.vehicleId === task.vehicleId);
            const avgKmPerDay = calculateAverageKmPerDay(vehicleEvents);
            
            if (avgKmPerDay) {
                // Estimate the date when vidange will be due
                const estimatedDate = estimateVidangeDate(vehicleMileage.mileage, task.nextDueMileage, avgKmPerDay);
                
                if (estimatedDate) {
                    const daysRemaining = getDaysRemaining(estimatedDate, today);
                    
                    // Check if we should notify (J-7, J-3, or J-0)
                    const shouldNotify = daysRemaining <= 7 && daysRemaining >= 0;
                    const isJ7 = daysRemaining === 7;
                    const isJ3 = daysRemaining === 3;
                    const isJ0 = daysRemaining <= 0;
                    
                    // Create specific notification tags for each reminder type
                    const j7Tag = `${task.id}-j7`;
                    const j3Tag = `${task.id}-j3`;
                    const j0Tag = `${task.id}-j0`;
                    
                    if (shouldNotify) {
                        let title = '';
                        let body = '';
                        let tag = '';
                        let notificationId = '';
                        
                        if (isJ0 && !notifiedDeadlines[j0Tag]) {
                            title = 'Jour J : Vidange Requise';
                            body = `Votre vidange est dûe maintenant ! Kilométrage actuel: ${vehicleMileage.mileage.toLocaleString('fr-FR')} km. Objectif: ${task.nextDueMileage.toLocaleString('fr-FR')} km.`;
                            tag = j0Tag;
                            notificationId = j0Tag;
                        } else if (isJ3 && !notifiedDeadlines[j3Tag]) {
                            title = 'Rappel J-3 : Vidange';
                            body = `Votre vidange est estimée dans 3 jours (${formatDateToFrench(estimatedDate)}). Préparez-vous ! Il reste ${kmRemaining.toLocaleString('fr-FR')} km.`;
                            tag = j3Tag;
                            notificationId = j3Tag;
                        } else if (isJ7 && !notifiedDeadlines[j7Tag]) {
                            title = 'Rappel J-7 : Vidange';
                            body = `Votre vidange est estimée dans 7 jours (${formatDateToFrench(estimatedDate)}). Pensez-y ! Il reste ${kmRemaining.toLocaleString('fr-FR')} km.`;
                            tag = j7Tag;
                            notificationId = j7Tag;
                        }
                        
                        if (title && tag && notificationId) {
                            // Route through SW to avoid double notification and ensure PWA opens
                            if ('serviceWorker' in navigator) {
                                const url = `/maintenance?vehicleId=${task.vehicleId}&highlight=${task.id}`;
                                navigator.serviceWorker.ready.then((reg) => {
                                    reg.showNotification(title, {
                                        body,
                                        icon: '/android-chrome-192x192.png',
                                        badge: '/badge-72x72.png',
                                        tag,
                                        renotify: true,
                                        requireInteraction: isJ0, // Require interaction for J0
                                        data: { 
                                            url,
                                            taskId: task.id,
                                            vehicleId: task.vehicleId,
                                            type: 'vidange-reminder',
                                            priority: isJ0 ? 'high' : 'normal'
                                        },
                                    });
                                });
                            }
                            addNotifiedDeadline(notificationId);
                        }
                    }
                }
            } else if (kmRemaining <= REMINDER_KM_THRESHOLD) {
                // Fallback: if we can't calculate average, use the old km-based notification
                const title = 'Rappel de Vidange Proche';
                const body = `Il reste environ ${kmRemaining.toLocaleString('fr-FR')} km avant votre prochaine vidange.`;
                
                if ('serviceWorker' in navigator) {
                    const url = `/maintenance?vehicleId=${task.vehicleId}&highlight=${task.id}`;
                    navigator.serviceWorker.ready.then((reg) => {
                        reg.showNotification(title, {
                            body,
                            icon: '/android-chrome-192x192.png',
                            badge: '/badge-72x72.png',
                            tag: `task-${task.id}`,
                            data: { 
                                url,
                                taskId: task.id,
                                vehicleId: task.vehicleId,
                                type: 'vidange-reminder'
                            },
                        });
                    });
                }
                addNotifiedDeadline(task.id);
            }
            continue;
        }
        
        // --- Logic for Date-Based Reminders (Others) ---
        else {
            let dueDate: Date | null = null;
            const isPaid = !task.id.startsWith('synthetic-');

            if (task.task === 'Vignette') {
                const vehicle = vehicles.find(v => v.id === task.vehicleId);
                if (vehicle && vehicle.licensePlate) {
                    if (task.date) {
                        // For PAID vignettes, we want to notify on the OFFICIAL deadline day of the payment year
                        // to remind the user about the document.
                        const paymentDate = new Date(task.date);
                        const officialDeadline = new Date(paymentDate.getFullYear(), getVignetteRules(vehicle.licensePlate).month, getVignetteRules(vehicle.licensePlate).day);
                        
                        // Also calculate the NEXT deadline for regular reminders
                        dueDate = calculateNextVignetteDate(vehicle.licensePlate, paymentDate);
                        
                        // If we are looking at a PAID record, we ONLY notify on the official deadline day
                        // of the cycle that was just paid.
                        const isOfficialDeadlineToday = officialDeadline.getFullYear() === today.getFullYear() &&
                                                      officialDeadline.getMonth() === today.getMonth() &&
                                                      officialDeadline.getDate() === today.getDate();

                        if (isOfficialDeadlineToday) {
                            const title = 'Jour J : Justificatif Vignette';
                            const body = `C'est aujourd'hui la date limite officielle pour la Vignette. Puisque vous avez déjà effectué le paiement, n'oubliez pas d'ajouter le document dans l'onglet "Documents".`;
                            const tag = `task-${task.id}-doc-reminder`;
                            
                            if (notifiedDeadlines[tag]) continue;

                            if ('serviceWorker' in navigator) {
                                navigator.serviceWorker.ready.then((reg) => {
                                    reg.showNotification(title, {
                                        body,
                                        icon: '/android-chrome-192x192.png',
                                        badge: '/android-chrome-192x192.png',
                                        tag,
                                        data: { url: `/documents?vehicleId=${task.vehicleId}` },
                                    });
                                });
                            }
                            addNotifiedDeadline(tag);
                        }
                        
                        // For the regular J-X reminders, use the calculated next dueDate
                        // but if it's in the future, the J-X check below will handle it.
                        // However, if we JUST paid it, the next dueDate is 1 year away.
                    } else {
                        dueDate = getCorrectVignetteDeadline(vehicle.licensePlate, today);
                    }
                } else if (task.nextDueDate) {
                     dueDate = new Date(task.nextDueDate);
                }
            } else if (task.nextDueDate) {
                dueDate = new Date(task.nextDueDate);
            }

            if (!dueDate) continue;

            // Check if the due date is within the reminder threshold
            if (dueDate >= today && dueDate <= reminderDateThreshold) {
                // Determine if it's today
                const isToday = dueDate.getFullYear() === today.getFullYear() &&
                               dueDate.getMonth() === today.getMonth() &&
                               dueDate.getDate() === today.getDate();

                // If it's a PAID task (real record), and it's NOT today, we suppress J-7/J-3
                // as requested: "if paid send only Jour J for doc".
                // Note: Real records usually have dueDate in the next year, so this block 
                // won't even execute for them until next year.
                // The synthetic tasks handle the "unpaid" reminders.
                if (isPaid && !isToday) {
                    continue; 
                }

                let title = 'Rappel d\'Entretien Proche';
                let body = `N'oubliez pas : "${task.task}" est à faire avant le ${dueDate.toLocaleDateString('fr-FR')}.`;

                if (isToday) {
                    title = 'Jour J : Entretien';
                    body = `C'est aujourd'hui ! N'oubliez pas l'entretien "${task.task}". Pensez à ajouter le document "${task.task}" dans l'onglet "Documents" pour un suivi complet.`;
                }
                
                // Route through SW to avoid double notification (browser tab + PWA)
                if ('serviceWorker' in navigator) {
                    const url = isToday
                        ? `/documents?vehicleId=${task.vehicleId}`
                        : `/?vehicleId=${task.vehicleId}`;

                    navigator.serviceWorker.ready.then((reg) => {
                        reg.showNotification(title, {
                            body,
                            icon: '/android-chrome-192x192.png',
                            badge: '/android-chrome-192x192.png',
                            tag: `task-${task.id}`,
                            data: { url },
                        });
                    });
                }
                addNotifiedDeadline(task.id);
            }
        }
    }
}

export function useLocalNotifications() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    // Run the check once on initial load
    checkDeadlinesAndNotify(user.uid);

    // Set up a periodic check every 6 hours
    const intervalId = setInterval(() => {
        checkDeadlinesAndNotify(user.uid);
    }, 6 * 60 * 60 * 1000); // 6 hours in milliseconds

    // Clean up the interval when the component unmounts
    return () => clearInterval(intervalId);
  }, [user]);
}
