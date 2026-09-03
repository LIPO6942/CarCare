'use client';

import { useEffect } from 'react';
import { useAuth } from '@/context/auth-context';
import { getAllUserMaintenance, getAllUserRepairs, getAllUserFuelLogs, getVehicles } from '@/lib/data';
import type { Maintenance } from '@/lib/types';
import { calculateNextVignetteDate, getCorrectVignetteDeadline, getVignetteRules } from '@/lib/vignette';
import { calculateAverageKmPerDay, estimateVidangeDate, formatDateToFrench, getDaysRemaining } from '@/lib/vidange';
import { getDeadlineAnticipationInfo } from '@/lib/tunisia-holidays';
import { useToast, toast as globalToast } from './use-toast';

const NOTIFICATION_SNOOZE_KEY = 'carcarepro_notified_deadlines';
const REMINDER_DAYS_THRESHOLD = 15; // Notify up to 15 days before date-based deadline
const REMINDER_KM_THRESHOLD = 2000; // Notify 2000km before mileage-based deadline

interface NotifiedDeadline {
    [id: string]: boolean;
}

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

function addNotifiedDeadline(key: string): void {
    if (typeof window === 'undefined') return;
    const notified = getNotifiedDeadlines();
    notified[key] = true;
    localStorage.setItem(NOTIFICATION_SNOOZE_KEY, JSON.stringify(notified));
}

async function sendBrowserNotification(title: string, options: NotificationOptions) {
    if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
        return;
    }
    let sent = false;
    if ('serviceWorker' in navigator) {
        try {
            const reg = await Promise.race([
                navigator.serviceWorker.ready,
                new Promise<ServiceWorkerRegistration | null>((resolve) => setTimeout(() => resolve(null), 1000))
            ]);
            if (reg && 'showNotification' in reg) {
                await reg.showNotification(title, options);
                sent = true;
            }
        } catch (e) {
            console.warn("ServiceWorker notification failed, using fallback:", e);
        }
    }
    if (!sent) {
        try {
            new Notification(title, options);
        } catch (e) {
            console.error("Direct browser notification failed:", e);
        }
    }
}

async function checkDeadlinesAndNotify(userId: string, showToast?: typeof globalToast) {
    if (typeof window === 'undefined') return;

    try {
        const [maintenanceTasks, repairs, fuelLogs, vehicles] = await Promise.all([
            getAllUserMaintenance(userId),
            getAllUserRepairs(userId),
            getAllUserFuelLogs(userId),
            getVehicles(userId)
        ]);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const notifiedDeadlines = getNotifiedDeadlines();

        // Create a map of the latest known mileage for each vehicle
        const latestMileageMap = new Map<string, { mileage: number, date: Date }>();

        const allEvents = [
            ...repairs.map(item => ({ ...item, eventDate: new Date(item.date) })),
            ...maintenanceTasks.map(item => ({ ...item, eventDate: new Date(item.date) })),
            ...fuelLogs.map(item => ({ ...item, eventDate: new Date(item.date) }))
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

        // Synthesize missing vignette tasks for vehicles
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
            const vehicle = vehicles.find(v => v.id === task.vehicleId);
            const vehicleName = vehicle ? `${vehicle.brand} ${vehicle.model}` : 'Votre véhicule';

            // Skip outdated vignette records (only evaluate the latest per vehicle)
            if (task.task === 'Vignette' && !task.id.startsWith('synthetic-') && latestVignetteByVehicle.get(task.vehicleId)?.id !== task.id) {
                continue;
            }

            // --- Logic 1: Mileage-Based Reminders (Vidange) ---
            if (task.task === 'Vidange' && task.nextDueMileage && task.nextDueMileage > 0) {
                const vehicleMileage = latestMileageMap.get(task.vehicleId);
                if (!vehicleMileage) continue;

                const kmRemaining = task.nextDueMileage - vehicleMileage.mileage;
                const vehicleEvents = allEvents.filter(e => e.vehicleId === task.vehicleId);
                const avgKmPerDay = calculateAverageKmPerDay(vehicleEvents);

                let title = '';
                let body = '';
                let stageTag = '';
                let isUrgent = false;

                if (kmRemaining <= 0) {
                    title = `⚠️ VIDANGE ÉCHUE : ${vehicleName}`;
                    body = `Le kilométrage prévu (${task.nextDueMileage.toLocaleString('fr-FR')} km) a été dépassé ! Kilométrage actuel: ${vehicleMileage.mileage.toLocaleString('fr-FR')} km.`;
                    stageTag = 'overdue';
                    isUrgent = true;
                } else if (avgKmPerDay) {
                    const estimatedDate = estimateVidangeDate(vehicleMileage.mileage, task.nextDueMileage, avgKmPerDay);
                    if (estimatedDate) {
                        const daysRemaining = getDaysRemaining(estimatedDate, today);

                        if (daysRemaining < 0) {
                            title = `⚠️ VIDANGE ÉCHUE : ${vehicleName}`;
                            body = `Votre vidange aurait dû être faite le ${formatDateToFrench(estimatedDate)}. Dépassement estimé !`;
                            stageTag = 'overdue';
                            isUrgent = true;
                        } else if (daysRemaining <= 1) {
                            title = `🚨 Jour J : Vidange pour ${vehicleName}`;
                            body = `La vidange est dûe maintenant (${formatDateToFrench(estimatedDate)}). Il reste ${kmRemaining.toLocaleString('fr-FR')} km.`;
                            stageTag = 'j0';
                            isUrgent = true;
                        } else if (daysRemaining <= 3) {
                            stageTag = 'j3';
                            const anticipation = getDeadlineAnticipationInfo(estimatedDate);
                            if (anticipation.isNonWorking) {
                                title = `⚠️ Rappel J-3 (${anticipation.dayName}) : Vidange (${vehicleName})`;
                                body = `Prochaine vidange estimée dans ${daysRemaining} jours (${formatDateToFrench(estimatedDate)}). Reste ${kmRemaining.toLocaleString('fr-FR')} km. ⚠️ Attention : le jour prévu tombe ${anticipation.isWeekend ? 'un weekend' : 'un jour férié'} (ateliers fermés). Anticipez votre rendez-vous avant le ${anticipation.lastWorkingDateFormatted} !`;
                            } else {
                                title = `Rappel J-3 : Vidange (${vehicleName})`;
                                body = `Prochaine vidange estimée dans ${daysRemaining} jours (${formatDateToFrench(estimatedDate)}). Reste ${kmRemaining.toLocaleString('fr-FR')} km.`;
                            }
                        } else if (daysRemaining <= 7) {
                            stageTag = 'j7';
                            const anticipation = getDeadlineAnticipationInfo(estimatedDate);
                            if (anticipation.isNonWorking) {
                                title = `Rappel J-7 : Vidange (${vehicleName})`;
                                body = `Prochaine vidange estimée dans ${daysRemaining} jours (${formatDateToFrench(estimatedDate)}). Reste ${kmRemaining.toLocaleString('fr-FR')} km. ⚠️ Attention : cette date tombe ${anticipation.isWeekend ? 'un weekend' : 'un jour férié'}, pensez à planifier à l'avance !`;
                            } else {
                                title = `Rappel J-7 : Vidange (${vehicleName})`;
                                body = `Prochaine vidange estimée dans ${daysRemaining} jours (${formatDateToFrench(estimatedDate)}). Reste ${kmRemaining.toLocaleString('fr-FR')} km.`;
                            }
                        } else if (daysRemaining <= 15) {
                            stageTag = 'j15';
                            const anticipation = getDeadlineAnticipationInfo(estimatedDate);
                            if (anticipation.isNonWorking) {
                                title = `Rappel J-15 : Vidange (${vehicleName})`;
                                body = `Vidange prévue dans environ 15 jours (${formatDateToFrench(estimatedDate)}). Reste ${kmRemaining.toLocaleString('fr-FR')} km. ⚠️ Le jour prévu tombe ${anticipation.isWeekend ? 'un weekend' : 'un jour férié'}, pensez à anticiper.`;
                            } else {
                                title = `Rappel J-15 : Vidange (${vehicleName})`;
                                body = `Vidange prévue dans environ 15 jours (${formatDateToFrench(estimatedDate)}). Reste ${kmRemaining.toLocaleString('fr-FR')} km.`;
                            }
                        }
                    }
                } else if (kmRemaining <= REMINDER_KM_THRESHOLD) {
                    title = `Rappel Vidange (${vehicleName})`;
                    body = `Il reste environ ${kmRemaining.toLocaleString('fr-FR')} km avant la prochaine vidange.`;
                    stageTag = 'km_threshold';
                }

                if (title && stageTag) {
                    const snoozeKey = `${task.id}_${stageTag}`;
                    if (!notifiedDeadlines[snoozeKey]) {
                        sendBrowserNotification(title, {
                            body,
                            icon: '/android-chrome-192x192.png',
                            badge: '/badge-72x72.png',
                            tag: snoozeKey,
                            requireInteraction: isUrgent,
                            data: { url: `/maintenance?vehicleId=${task.vehicleId}&highlight=${task.id}` },
                        });

                        if (showToast) {
                            showToast({
                                title,
                                description: body,
                                variant: isUrgent ? 'destructive' : 'default',
                            });
                        }

                        addNotifiedDeadline(snoozeKey);
                    }
                }
                continue;
            }

            // --- Logic 2: Date-Based Reminders (Vignette, Assurance, Visite Technique, etc.) ---
            let dueDate: Date | null = null;
            const isPaid = !task.id.startsWith('synthetic-');

            if (task.task === 'Vignette') {
                if (vehicle && vehicle.licensePlate) {
                    if (task.date) {
                        const paymentDate = new Date(task.date);
                        const officialDeadline = new Date(paymentDate.getFullYear(), getVignetteRules(vehicle.licensePlate).month, getVignetteRules(vehicle.licensePlate).day);
                        dueDate = calculateNextVignetteDate(vehicle.licensePlate, paymentDate);

                        const isOfficialDeadlineToday = officialDeadline.getFullYear() === today.getFullYear() &&
                            officialDeadline.getMonth() === today.getMonth() &&
                            officialDeadline.getDate() === today.getDate();

                        if (isOfficialDeadlineToday) {
                            const snoozeKey = `${task.id}_doc_reminder_${today.getFullYear()}`;
                            if (!notifiedDeadlines[snoozeKey]) {
                                const title = `Jour J : Document Vignette (${vehicleName})`;
                                const body = `Aujourd'hui est la date limite officielle pour la Vignette. Pensez à vérifier votre document dans l'onglet "Documents".`;
                                sendBrowserNotification(title, {
                                    body,
                                    icon: '/android-chrome-192x192.png',
                                    badge: '/badge-72x72.png',
                                    tag: snoozeKey,
                                    data: { url: `/documents?vehicleId=${task.vehicleId}` },
                                });
                                if (showToast) showToast({ title, description: body });
                                addNotifiedDeadline(snoozeKey);
                            }
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

            if (!dueDate || isNaN(dueDate.getTime())) continue;

            const daysRemaining = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            const dueDateStr = dueDate.toISOString().split('T')[0];

            let title = '';
            let body = '';
            let stageTag = '';
            let isUrgent = false;

            if (daysRemaining < 0 && !isPaid) {
                title = `⚠️ ÉCHÉANCE DÉPASSÉE : ${task.task} (${vehicleName})`;
                body = `L'échéance pour "${task.task}" est dépassée depuis le ${dueDate.toLocaleDateString('fr-FR')}. Action requise !`;
                stageTag = 'overdue';
                isUrgent = true;
            } else if (daysRemaining <= 1 && (!isPaid || daysRemaining === 0)) {
                title = `🚨 Jour J : ${task.task} (${vehicleName})`;
                body = `C'est aujourd'hui la date limite pour "${task.task}" (${dueDate.toLocaleDateString('fr-FR')}).`;
                stageTag = 'j0';
                isUrgent = true;
            } else if (daysRemaining <= 3 && !isPaid) {
                stageTag = 'j3';
                const anticipation = getDeadlineAnticipationInfo(dueDate);
                if (anticipation.isNonWorking) {
                    title = `⚠️ Rappel J-3 (${anticipation.dayName}) : ${task.task} (${vehicleName})`;
                    body = `L'échéance "${task.task}" arrive dans ${daysRemaining} jour(s). ${anticipation.warningText}`;
                } else {
                    title = `Rappel J-3 : ${task.task} (${vehicleName})`;
                    body = `L'échéance "${task.task}" arrive dans ${daysRemaining} jour(s) (${dueDate.toLocaleDateString('fr-FR')}).`;
                }
            } else if (daysRemaining <= 7 && !isPaid) {
                stageTag = 'j7';
                const anticipation = getDeadlineAnticipationInfo(dueDate);
                if (anticipation.isNonWorking) {
                    title = `Rappel J-7 : ${task.task} (${vehicleName})`;
                    body = `N'oubliez pas : "${task.task}" est à faire pour le ${anticipation.dueDateFormatted}. ${anticipation.warningText}`;
                } else {
                    title = `Rappel J-7 : ${task.task} (${vehicleName})`;
                    body = `N'oubliez pas : "${task.task}" est à faire avant le ${dueDate.toLocaleDateString('fr-FR')}.`;
                }
            } else if (daysRemaining <= 15 && !isPaid) {
                stageTag = 'j15';
                const anticipation = getDeadlineAnticipationInfo(dueDate);
                if (anticipation.isNonWorking) {
                    title = `Rappel J-15 : ${task.task} (${vehicleName})`;
                    body = `Pensez à planifier : "${task.task}" est prévu le ${anticipation.dueDateFormatted}. ${anticipation.warningText}`;
                } else {
                    title = `Rappel J-15 : ${task.task} (${vehicleName})`;
                    body = `Pensez à planifier : "${task.task}" est prévu le ${dueDate.toLocaleDateString('fr-FR')}.`;
                }
            }

            if (title && stageTag) {
                const snoozeKey = `${task.id}_${stageTag}_${dueDateStr}`;
                if (!notifiedDeadlines[snoozeKey]) {
                    const targetUrl = isUrgent ? `/documents?vehicleId=${task.vehicleId}` : `/?vehicleId=${task.vehicleId}`;
                    sendBrowserNotification(title, {
                        body,
                        icon: '/android-chrome-192x192.png',
                        badge: '/badge-72x72.png',
                        tag: snoozeKey,
                        requireInteraction: isUrgent,
                        data: { url: targetUrl },
                    });

                    if (showToast) {
                        showToast({
                            title,
                            description: body,
                            variant: isUrgent ? 'destructive' : 'default',
                        });
                    }

                    addNotifiedDeadline(snoozeKey);
                }
            }
        }
    } catch (error) {
        console.error("Error in checkDeadlinesAndNotify:", error);
    }
}

export function useLocalNotifications() {
    const { user } = useAuth();
    const { toast } = useToast();

    useEffect(() => {
        if (!user) return;

        // Run check on initial load with in-app toast support
        checkDeadlinesAndNotify(user.uid, toast);

        // Periodic check every 4 hours
        const intervalId = setInterval(() => {
            checkDeadlinesAndNotify(user.uid, toast);
        }, 4 * 60 * 60 * 1000);

        return () => clearInterval(intervalId);
    }, [user, toast]);
}
