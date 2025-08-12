'use client';

import { useEffect } from 'react';
import { useAuth } from '@/context/auth-context';
import { getAllUserMaintenance, getAllUserRepairs, getAllUserFuelLogs } from '@/lib/data';
import type { Maintenance, Repair, FuelLog } from '@/lib/types';

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

    const [maintenanceTasks, repairs, fuelLogs] = await Promise.all([
        getAllUserMaintenance(userId),
        getAllUserRepairs(userId),
        getAllUserFuelLogs(userId),
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
        ...maintenance.map(item => ({...item, eventDate: new Date(item.date)})),
        ...fuelLogs.map(item => ({...item, eventDate: new Date(item.date)}))
    ].filter(e => e.mileage > 0 && e.date && !isNaN(new Date(e.date).getTime()));

    allEvents.forEach(event => {
        const existing = latestMileageMap.get(event.vehicleId);
        if (!existing || event.eventDate > existing.date) {
            latestMileageMap.set(event.vehicleId, { mileage: event.mileage, date: event.eventDate });
        }
    });


    for (const task of maintenanceTasks) {
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
                
                new Notification(title, {
                    body: body,
                    icon: '/apple-touch-icon.png',
                    badge: '/apple-touch-icon.png'
                });
                addNotifiedDeadline(task.id);
                continue; // Move to the next task after sending notification
            }
        }
        
        // --- Logic for Date-Based Reminders (Others) ---
        else if (task.nextDueDate) {
            const dueDate = new Date(task.nextDueDate);
            
            // Check if the due date is within the reminder threshold
            if (dueDate >= today && dueDate <= reminderDateThreshold) {
                const title = 'Rappel d\'Entretien Proche';
                const body = `N'oubliez pas: "${task.task}" est à faire avant le ${dueDate.toLocaleDateString('fr-FR')}.`;
                
                new Notification(title, {
                    body: body,
                    icon: '/apple-touch-icon.png',
                    badge: '/apple-touch-icon.png'
                });
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
