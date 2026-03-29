'use client';

import { useEffect } from 'react';
import { useAuth } from '@/context/auth-context';
import { getAllUserMaintenance, getAllUserRepairs, getAllUserFuelLogs, getVehicles } from '@/lib/data';
import type { Maintenance, Repair, FuelLog } from '@/lib/types';
import { calculateNextVignetteDate, getCorrectVignetteDeadline } from '@/lib/vignette';

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

        // --- Logic for Mileage-Based Reminders (Vidange) ---
        if (task.task === 'Vidange' && task.nextDueMileage && task.nextDueMileage > 0) {
            const vehicleMileage = latestMileageMap.get(task.vehicleId);
            if (!vehicleMileage) continue; // Cannot check if we don't know the current mileage

            const kmRemaining = task.nextDueMileage - vehicleMileage.mileage;

            if (kmRemaining <= REMINDER_KM_THRESHOLD) {
                const title = 'Rappel de Vidange Proche';
                const body = `Il reste environ ${kmRemaining.toLocaleString('fr-FR')} km avant votre prochaine vidange.`;
                
                // Route through SW to avoid double notification (browser tab + PWA)
                if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.ready.then((reg) => {
                        reg.showNotification(title, {
                            body,
                            icon: '/android-chrome-192x192.png',
                            badge: '/android-chrome-192x192.png',
                            data: { url: '/' },
                        });
                    });
                }
                addNotifiedDeadline(task.id);
                continue; // Move to the next task after sending notification
            }
        }
        
        // --- Logic for Date-Based Reminders (Others) ---
        else {
            let dueDate: Date | null = null;

            if (task.task === 'Vignette') {
                const vehicle = vehicles.find(v => v.id === task.vehicleId);
                if (vehicle && vehicle.licensePlate) {
                    if (task.date) {
                        dueDate = calculateNextVignetteDate(vehicle.licensePlate, new Date(task.date));
                        if (dueDate < today) {
                            dueDate = getCorrectVignetteDeadline(vehicle.licensePlate, today);
                        }
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

                let title = 'Rappel d\'Entretien Proche';
                let body = `N'oubliez pas : "${task.task}" est à faire avant le ${dueDate.toLocaleDateString('fr-FR')}.`;

                if (isToday) {
                    title = 'Jour J : Entretien';
                    body = `C'est aujourd'hui ! N'oubliez pas l'entretien "${task.task}". Pensez à ajouter le document "${task.task}" dans l'onglet "Documents" pour un suivi complet.`;
                }
                
                // Route through SW to avoid double notification (browser tab + PWA)
                if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.ready.then((reg) => {
                        reg.showNotification(title, {
                            body,
                            icon: '/android-chrome-192x192.png',
                            badge: '/android-chrome-192x192.png',
                            data: { url: '/' },
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
