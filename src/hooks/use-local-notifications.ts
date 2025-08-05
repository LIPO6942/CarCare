'use client';

import { useEffect } from 'react';
import { useAuth } from '@/context/auth-context';
import { getAllUserMaintenance } from '@/lib/data';
import type { Maintenance } from '@/lib/types';

const NOTIFICATION_SNOOZE_KEY = 'carcarepro_notified_deadlines';
const REMINDER_DAYS_THRESHOLD = 3; // Notify 3 days before deadline

interface NotifiedDeadline {
    [id: string]: string; // { maintenanceId: isoDateString }
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
    notified[maintenanceId] = new Date().toISOString();
    localStorage.setItem(NOTIFICATION_SNOOZE_KEY, JSON.stringify(notified));
}


async function checkDeadlinesAndNotify(userId: string) {
    if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
        // Cannot send notifications if permission is not granted
        return;
    }

    const maintenanceTasks = await getAllUserMaintenance(userId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const reminderDateThreshold = new Date(today);
    reminderDateThreshold.setDate(today.getDate() + REMINDER_DAYS_THRESHOLD);

    const notifiedDeadlines = getNotifiedDeadlines();

    for (const task of maintenanceTasks) {
        if (!task.nextDueDate) continue;

        const dueDate = new Date(task.nextDueDate);
        
        // Check if a notification was already sent for this task today
        const lastNotifiedDateStr = notifiedDeadlines[task.id];
        if (lastNotifiedDateStr) {
            const lastNotifiedDate = new Date(lastNotifiedDateStr);
            lastNotifiedDate.setHours(0,0,0,0);
            if (lastNotifiedDate.getTime() === today.getTime()) {
                continue; // Already notified today, skip.
            }
        }

        // Check if the due date is within the reminder threshold
        if (dueDate >= today && dueDate <= reminderDateThreshold) {
            const title = 'Rappel d\'Entretien Proche';
            const body = `N'oubliez pas: "${task.task}" est à faire avant le ${dueDate.toLocaleDateString('fr-FR')}.`;
            
            // Use the Notification API to show the local notification
            new Notification(title, {
                body: body,
                icon: '/apple-touch-icon.png', // Optional: adds an icon
                badge: '/apple-touch-icon.png' // For mobile
            });

            // Mark this task as notified for today
            addNotifiedDeadline(task.id);
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
