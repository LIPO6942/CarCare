'use client';

import { useState, useEffect, useCallback, useMemo, type ComponentType, type FormEvent, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Vehicle, Repair, Maintenance, FuelLog } from '@/lib/types';
import { AppLayout } from '@/components/app-layout';
import { DashboardHeader } from '@/components/dashboard-header';
import { AddVehicleSheet } from '@/components/add-vehicle-sheet';
import { Button } from '@/components/ui/button';
import { PlusCircle, Car, Wrench, Bell, Fuel, AlertTriangle, CheckCircle2, Gauge, ClipboardList, ExternalLink, Droplets, History, Sparkles, StickyNote, Save, Pin, Edit3, Trash2 } from 'lucide-react';
import { format } from "date-fns"
import { fr } from "date-fns/locale"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { VehicleCard } from '@/components/vehicle-card';
import { calculateNextVignetteDate, formatDateToLocalISO, getCorrectVignetteDeadline } from '@/lib/vignette';
import { getDeadlineAnticipationInfo } from '@/lib/tunisia-holidays';
import { getVehicleTankCapacity, calculateAverageFuelConsumption, calculateIntervalConsumption, calculateSmartAutonomie, calculateAverageRefillGaugeLevel } from '@/lib/fuel-utils';
import { getVehicles, getAllUserRepairs, getAllUserMaintenance, getAllUserFuelLogs, addMaintenance, updateMaintenance, updateVehicle } from '@/lib/data';
import { getCanonicalTask } from '@/lib/reminder-utils';
import { getLastVidangeSummary, getStandardVidangeItems, isFuelFilterApplicable, type LastVidangeSummary } from '@/lib/vidange';
import { useAuth } from '@/context/auth-context';
import { Skeleton } from './ui/skeleton';
import { cn } from '@/lib/utils';
import { VehicleDetailModal } from './vehicle-detail-modal';
import { AddInitialMaintenanceForm } from './add-initial-maintenance-form';
import { QuickFuelLogForm } from './quick-fuel-log-form';
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogDescription, DialogFooter } from './ui/dialog';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { Badge } from './ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { getSettings } from '@/lib/settings';

type Deadline = {
  type: 'date' | 'mileage';
  name: string;
  vehicleId: string;
  sortValue: number;
  originalTask: Maintenance;
  date: Date;
} & ({ type: 'date' } | { type: 'mileage'; kmRemaining: number });


function StatCard({
  title,
  value,
  icon: Icon,
  description,
  badge,
  onClick,
  disabled,
  isLoading,
  isUrgent,
  onComplete,
  secondaryAction,
  gradient = "from-primary/10 to-primary/5",
  iconGradient = "from-primary to-primary-foreground/50",
  shadow = "shadow-primary/10"
}: {
  title: string,
  value: string | number,
  icon: ComponentType<{ className?: string }>,
  description?: string,
  badge?: React.ReactNode,
  onClick?: () => void,
  disabled?: boolean,
  isLoading?: boolean,
  isUrgent?: boolean,
  onComplete?: () => void,
  secondaryAction?: {
    label: string,
    url?: string,
    isExternal?: boolean,
    icon?: ComponentType<{ className?: string }>,
    variantClass?: string,
    onClick?: () => void,
  },
  gradient?: string,
  iconGradient?: string,
  shadow?: string
}) {
  const isClickable = !!onClick && !disabled;

  if (isLoading) {
    return <Skeleton className="h-32 rounded-xl" />;
  }

  let IconToRender = Icon;
  let currentGradient = gradient;
  let currentIconGradient = iconGradient;
  let currentShadow = shadow;

  if (isUrgent) {
    IconToRender = AlertTriangle;
    currentGradient = "from-destructive/20 to-destructive/5";
    currentIconGradient = "from-destructive to-rose-600";
    currentShadow = "shadow-destructive/20";
  }

  const cardContent = (
    <Card className={cn(
      "relative overflow-hidden border-none transition-all duration-300 h-full flex flex-col",
      currentShadow,
      isClickable && "hover:shadow-2xl hover:-translate-y-1"
    )}>
      {/* Top Gradient Bar */}
      <div className={cn("absolute top-0 left-0 w-full h-1 bg-gradient-to-r", currentIconGradient)} />

      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
            {title}
          </CardTitle>
          {badge}
        </div>
        <div className={cn(
          "p-2 rounded-xl bg-gradient-to-br shadow-lg text-white",
          currentIconGradient
        )}>
          <IconToRender className="h-3.5 w-3.5" />
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col justify-center py-2">
        <div className="text-2xl font-black tracking-tight">{value}</div>
        {description && (
          <p className="text-[10px] text-muted-foreground mt-1 font-medium italic leading-tight">
            {description}
          </p>
        )}
      </CardContent>

      {(onComplete || secondaryAction) && !disabled && (
        <CardFooter className="p-2 border-t bg-background/40 backdrop-blur-sm mt-auto flex gap-1.5">
          {secondaryAction && (
            secondaryAction.url ? (
              <Button
                asChild
                variant="outline"
                size="sm"
                className={cn(
                  "flex-1 text-[10px] h-7 font-bold uppercase tracking-tighter hover:bg-primary/10 gap-1",
                  secondaryAction.variantClass || "border-blue-500/40 text-blue-600 dark:text-blue-400"
                )}
              >
                <a
                  href={secondaryAction.url}
                  target={secondaryAction.isExternal ? "_blank" : undefined}
                  rel={secondaryAction.isExternal ? "noopener noreferrer" : undefined}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (secondaryAction.onClick) {
                      secondaryAction.onClick();
                    }
                  }}
                >
                  {secondaryAction.icon && <secondaryAction.icon className="h-3 w-3" />}
                  {secondaryAction.label}
                </a>
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "flex-1 text-[10px] h-7 font-bold uppercase tracking-tighter hover:bg-primary/10 gap-1",
                  secondaryAction.variantClass || "border-blue-500/40 text-blue-600 dark:text-blue-400"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  if (secondaryAction.onClick) {
                    secondaryAction.onClick();
                  }
                }}
              >
                {secondaryAction.icon && <secondaryAction.icon className="h-3 w-3" />}
                {secondaryAction.label}
              </Button>
            )
          )}
          {onComplete && (
            <Button
              variant="ghost"
              size="sm"
              className={cn("text-[10px] h-7 font-bold uppercase tracking-tighter hover:bg-primary/10", secondaryAction ? "flex-1" : "w-full")}
              onClick={(e) => { e.stopPropagation(); onComplete(); }}
            >
              <CheckCircle2 className="mr-1.5 h-3 w-3" />
              Échéance réglée
            </Button>
          )}
        </CardFooter>
      )}

      {/* Background Decoration */}
      <div className={cn(
        "absolute -right-4 -bottom-4 w-24 h-24 bg-gradient-to-br opacity-[0.05] rounded-full blur-2xl",
        currentIconGradient
      )} />
    </Card>
  );

  if (isClickable) {
    return (
      <div
        onClick={() => !disabled && onClick ? onClick() : undefined}
        className={cn("text-left w-full h-full", disabled && "opacity-50 cursor-not-allowed")}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onClick?.();
          }
        }}
      >
        {cardContent}
      </div>
    )
  }

  return (
    <div className={cn("text-left w-full h-full", disabled && "opacity-50")}>
      {cardContent}
    </div>
  );
}

export function DashboardClient() {
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    setHasMounted(true);
  }, []);

  const { user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [maintenance, setMaintenance] = useState<Maintenance[]>([]);
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [isVehiclesLoading, setIsVehiclesLoading] = useState(true);
  const [isStatsLoading, setIsStatsLoading] = useState(true);

  const [vehicleForDetailView, setVehicleForDetailView] = useState<Vehicle | null>(null);
  const [targetTab, setTargetTab] = useState<string | undefined>(undefined);
  const [vehicleForInitialMaintenance, setVehicleForInitialMaintenance] = useState<Vehicle | null>(null);

  const [deadlineToComplete, setDeadlineToComplete] = useState<Deadline | null>(null);
  const [vidangeHistoryVehicleId, setVidangeHistoryVehicleId] = useState<string | null>(null);

  const fetchData = useCallback(async (showLoadingIndicators = true) => {
    if (!user) return;
    if (showLoadingIndicators) {
      setIsVehiclesLoading(true);
      setIsStatsLoading(true);
    }

    // Phase 1: Fetch vehicles for a quick initial render
    const vehiclesData = await getVehicles(user.uid);
    setVehicles(vehiclesData);
    if (showLoadingIndicators) setIsVehiclesLoading(false);

    // Phase 2: Fetch all other data for stats
    const [repairsData, maintenanceData, fuelLogsData] = await Promise.all([
      getAllUserRepairs(user.uid),
      getAllUserMaintenance(user.uid),
      getAllUserFuelLogs(user.uid),
    ]);
    setRepairs(repairsData);
    setMaintenance(maintenanceData);
    setFuelLogs(fuelLogsData);
    if (showLoadingIndicators) setIsStatsLoading(false);
  }, [user]);

  const searchParams = useSearchParams();
  const vehicleIdParam = searchParams.get('vehicleId');

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user, fetchData]);

  useEffect(() => {
    if (vehicles.length > 0 && vehicleIdParam) {
      const vehicle = vehicles.find(v => v.id === vehicleIdParam);
      if (vehicle) {
        setVehicleForDetailView(vehicle);
        // Clear param from URL without refreshing? 
        // For now just opening it is enough.
      }
    }
  }, [vehicles, vehicleIdParam]);

  const handleVehicleAdded = (newVehicle: Vehicle) => {
    fetchData(false); // Refetch data in background
    setVehicleForInitialMaintenance(newVehicle);
  }

  const handleInitialMaintenanceFinished = () => {
    setVehicleForInitialMaintenance(null);
    fetchData(); // Full refetch to update stats
  }

  const {
    totalRepairCost,
    totalFuelCost,
    yearlyRepairCost,
    yearlyFuelCost,
    nextDeadline,
    secondNextDeadline,
    isDeadlineUrgent,
    isSecondDeadlineUrgent,
    allEvents
  } = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const totalRepairCost = repairs.reduce((sum, r) => sum + r.cost, 0);
    const totalFuelCost = fuelLogs.reduce((sum, f) => sum + f.totalCost, 0);
    const yearlyRepairCost = repairs
      .filter(r => new Date(r.date).getFullYear() === currentYear)
      .reduce((sum, r) => sum + r.cost, 0);
    const yearlyFuelCost = fuelLogs
      .filter(f => new Date(f.date).getFullYear() === currentYear)
      .reduce((sum, f) => sum + f.totalCost, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const allEvents = [
      ...repairs.map(item => ({ ...item, eventDate: new Date(item.date) })),
      ...maintenance.map(item => ({ ...item, eventDate: new Date(item.date) })),
      ...fuelLogs.map(item => ({ ...item, eventDate: new Date(item.date) }))
    ].filter(e => e.mileage > 0 && e.date && !isNaN(new Date(e.date).getTime()));

    // For vignette tasks, keep only the most recent payment record per vehicle
    // (prevents duplicates and ensures we compute from the freshest data)
    const latestVignetteByVehicle = new Map<string, Maintenance>();
    maintenance.forEach(m => {
      if (m.task === 'Vignette') {
        const existing = latestVignetteByVehicle.get(m.vehicleId);
        if (!existing || new Date(m.date) > new Date(existing.date)) {
          latestVignetteByVehicle.set(m.vehicleId, m);
        }
      }
    });

    const dateBasedDeadlines: Deadline[] = maintenance
      .filter(m => {
        // Vignette: keep only the most recent record per vehicle, even if nextDueDate is missing
        // (we can compute the deadline from the payment date itself)
        if (m.task === 'Vignette') {
          return latestVignetteByVehicle.get(m.vehicleId)?.id === m.id;
        }
        // All other tasks: require nextDueDate to be set
        return !!m.nextDueDate;
      })
      .map(m => {
        let deadlineDate: Date;
        if (m.task === 'Vignette') {
          const vehicle = vehicles.find(v => v.id === m.vehicleId);
          if (vehicle && vehicle.licensePlate) {
            if (m.date) {
              // Derive next deadline from the ACTUAL payment date:
              //  • paid 10 mars 2026 → next = 2027-04-05
              //  • paid 2025 → next = 2026-04-05
              deadlineDate = calculateNextVignetteDate(vehicle.licensePlate, new Date(m.date));
              // Safety cap: if the computed deadline is already in the past
              // (e.g. old missed record), fall back to the real upcoming date.
              if (deadlineDate < today) {
                deadlineDate = getCorrectVignetteDeadline(vehicle.licensePlate, today);
              }
            } else {
              deadlineDate = getCorrectVignetteDeadline(vehicle.licensePlate, today);
            }
          } else {
            deadlineDate = m.nextDueDate ? new Date(m.nextDueDate) : getCorrectVignetteDeadline('', today);
          }
        } else {
          deadlineDate = new Date(m.nextDueDate!);
        }
        return {
          type: 'date' as const,
          name: m.task,
          date: deadlineDate,
          cost: m.cost,
          vehicleId: m.vehicleId,
          sortValue: deadlineDate.getTime(),
          originalTask: m,
        };
      });

    // Vehicles with NO vignette record at all → synthesize a deadline from today + plate.
    // (Vehicles that HAVE a record, even without nextDueDate, are already handled above.)
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
          nextDueDate: formatDateToLocalISO(deadlineDate),
        } as any;
        dateBasedDeadlines.push({
          type: 'date' as const,
          name: 'Vignette',
          date: deadlineDate,
          vehicleId: vehicle.id,
          sortValue: deadlineDate.getTime(),
          originalTask: syntheticTask,
        });
      }
    });

    // For mileage-based, we still need the latest ones for context
    const latestTasksMap = new Map<string, Maintenance>();
    maintenance.forEach(task => {
      const key = `${task.vehicleId}-${task.task}`;
      const existingTask = latestTasksMap.get(key);
      if (!existingTask || new Date(task.date) > new Date(existingTask.date)) {
        latestTasksMap.set(key, task);
      }
    });
    const latestTasks = Array.from(latestTasksMap.values());

    const mileageBasedDeadlines: Deadline[] = vehicles.map(vehicle => {
      const latestVehicleEvent = allEvents
        .filter(e => e.vehicleId === vehicle.id)
        .sort((a, b) => b.eventDate.getTime() - a.eventDate.getTime())[0];

      if (!latestVehicleEvent) return null;

      const lastOilChange = latestTasks
        .find(m => m.vehicleId === vehicle.id && m.task === 'Vidange' && m.nextDueMileage && m.nextDueMileage > 0);

      if (!lastOilChange) return null;

      const kmRemaining = lastOilChange.nextDueMileage! - latestVehicleEvent.mileage;

      let estimatedDate = new Date();
      if (kmRemaining > 0) {
        const vehicleEvents = allEvents.filter(e => e.vehicleId === vehicle.id).sort((a, b) => a.eventDate.getTime() - b.eventDate.getTime());
        estimatedDate.setDate(estimatedDate.getDate() + 999);
        if (vehicleEvents.length > 1) {
          const firstEvent = vehicleEvents[0];
          const lastEvent = vehicleEvents[vehicleEvents.length - 1];
          const totalMiles = lastEvent.mileage - firstEvent.mileage;
          const totalDays = (lastEvent.eventDate.getTime() - firstEvent.eventDate.getTime()) / (1000 * 60 * 60 * 24);
          if (totalMiles > 0 && totalDays > 0) {
            const avgDailyMileage = totalMiles / totalDays;
            const daysToNextChange = Math.ceil(kmRemaining / avgDailyMileage);
            estimatedDate = new Date(lastEvent.eventDate);
            estimatedDate.setDate(estimatedDate.getDate() + daysToNextChange);
          }
        }
      } else {
        estimatedDate.setFullYear(estimatedDate.getFullYear() - 10);
      }


      return {
        type: 'mileage' as const,
        name: `${lastOilChange.task}`,
        kmRemaining,
        date: estimatedDate,
        vehicleId: vehicle.id,
        sortValue: estimatedDate.getTime(),
        originalTask: lastOilChange,
      }
    }).filter((item): item is any => item !== null) as Deadline[];


    const upcomingDeadlines: Deadline[] = [
      ...dateBasedDeadlines,
      ...mileageBasedDeadlines
    ]
      .sort((a, b) => a.sortValue - b.sortValue);

    const nextDeadline = upcomingDeadlines[0] || null;
    const secondNextDeadline = upcomingDeadlines[1] || null;

    const checkUrgency = (deadline: Deadline | null) => {
      if (!deadline) return false;
      if (deadline.type === 'date') {
        const twentyDaysFromNow = new Date();
        twentyDaysFromNow.setDate(today.getDate() + 20);
        return deadline.date <= twentyDaysFromNow;
      }
      if (deadline.type === 'mileage') {
        return deadline.kmRemaining <= 2000;
      }
      return false;
    };

    return {
      totalRepairCost,
      totalFuelCost,
      yearlyRepairCost,
      yearlyFuelCost,
      nextDeadline,
      secondNextDeadline,
      isDeadlineUrgent: checkUrgency(nextDeadline),
      isSecondDeadlineUrgent: checkUrgency(secondNextDeadline),
      allEvents
    }
  }, [vehicles, repairs, maintenance, fuelLogs]);

  const vidangeHistoryVehicle = useMemo(() => {
    if (!vidangeHistoryVehicleId) return null;
    return vehicles.find(v => v.id === vidangeHistoryVehicleId) || null;
  }, [vidangeHistoryVehicleId, vehicles]);

  const vidangeHistorySummary = useMemo(() => {
    if (!vidangeHistoryVehicleId) return null;
    const latestEvent = allEvents
      .filter(e => e.vehicleId === vidangeHistoryVehicleId)
      .sort((a, b) => b.eventDate.getTime() - a.eventDate.getTime())[0];
    return getLastVidangeSummary({
      vehicleId: vidangeHistoryVehicleId,
      maintenanceList: maintenance,
      repairsList: repairs,
      currentMileage: latestEvent?.mileage || 0,
      vehicle: vidangeHistoryVehicle,
    });
  }, [vidangeHistoryVehicleId, maintenance, repairs, allEvents, vidangeHistoryVehicle]);

  const fuelStats = useMemo(() => {
    const stats = new Map<string, {
      consumption: number | null;
      latestConsumption: number | null;
      cost: number | null;
      lastLogQuantity: number;
      lastLogTotalCost: number;
      kmPerDay: number;
      averageSpeed: number | null | undefined;
      drivingStyle: string;
      daysUntilEmpty?: number;
      remainingRangeKm?: number;
      estimatedCurrentMileage?: number;
      avgRefillGauge?: number | null;
      avgDaysBetweenFills?: number | null;
    } | null>();

    vehicles.forEach(vehicle => {
      const vehicleFuelLogs = fuelLogs
        .filter(log => log.vehicleId === vehicle.id && log.mileage > 0)
        .sort((a, b) => a.mileage - b.mileage);

      if (vehicleFuelLogs.length === 0) {
        stats.set(vehicle.id, null);
        return;
      }

      // Step A: Determine Tank Capacity (using vehicle setting, detected logs, or vehicle baseline)
      const estimatedCapacity = getVehicleTankCapacity(vehicle, vehicleFuelLogs);

      // Step B: Calculate Lifetime Average & Latest Interval Consumption
      const averageConsumption = calculateAverageFuelConsumption(vehicleFuelLogs, estimatedCapacity);
      const avgRefillGauge = calculateAverageRefillGaugeLevel(vehicleFuelLogs);

      const lastLog = vehicleFuelLogs[vehicleFuelLogs.length - 1];
      let latestConsumption: number | null = null;
      let lastIntervalDistance = 0;
      let previousLog: FuelLog | null = null;

      if (vehicleFuelLogs.length >= 2) {
        previousLog = vehicleFuelLogs[vehicleFuelLogs.length - 2];
        lastIntervalDistance = lastLog.mileage - previousLog.mileage;
        const intervalResult = calculateIntervalConsumption(previousLog, lastLog, estimatedCapacity);
        if (intervalResult) {
          latestConsumption = intervalResult.consumption;
        }
      }

      const latestCost = (latestConsumption && lastLog.pricePerLiter)
        ? (latestConsumption * lastLog.pricePerLiter)
        : null;

      // Calculate speed & driving style
      let estimatedSpeed = lastLog.averageSpeed;
      let drivingStyle = 'Mixte';
      let kmPerDay = 0;

      if (previousLog && lastIntervalDistance > 0) {
        const timeDiff = new Date(lastLog.date).getTime() - new Date(previousLog.date).getTime();
        const daysDiff = Math.max(1, Math.ceil(timeDiff / (1000 * 60 * 60 * 24)));
        kmPerDay = lastIntervalDistance / daysDiff;
      }

      if (kmPerDay < 30) {
        drivingStyle = 'Urbain';
      } else if (kmPerDay >= 60 && kmPerDay < 90) {
        drivingStyle = 'Semi-Sport';
      } else if (kmPerDay >= 90) {
        drivingStyle = 'Sport/Route';
      }

      const activeConsumption = latestConsumption || averageConsumption || 0;
      if (!estimatedSpeed && activeConsumption > 0) {
        const fiscalPower = vehicle.fiscalPower || 6;
        const isDiesel = vehicle.fuelType === 'Diesel';
        const baseReference = isDiesel ? 5.2 + (fiscalPower - 4) * 0.4 : 7.0 + (fiscalPower - 4) * 0.5;
        const carAvg = averageConsumption || baseReference;
        const stressFactor = activeConsumption / carAvg;

        let baseSpeed = 0;
        if (stressFactor >= 1) {
          baseSpeed = (29 / Math.pow(stressFactor, 1.6));
          if (baseSpeed < 10) baseSpeed = 10;
        } else {
          baseSpeed = 29 + (1 - stressFactor) * 100;
          if (baseSpeed > 130) baseSpeed = 130;
        }

        let intensityAdjustment = 0;
        if (kmPerDay > 0 && kmPerDay < 15) intensityAdjustment = -3;
        else if (kmPerDay > 100) intensityAdjustment = 15;

        estimatedSpeed = baseSpeed + intensityAdjustment;
      }

      // Step C: Calculate Smart Autonomie (taking gaugeLevelBefore + added fuel + days passed into account)
      const smartAutonomie = calculateSmartAutonomie(
        vehicle,
        vehicleFuelLogs,
        estimatedCapacity,
        latestConsumption,
        averageConsumption
      );

      // Calcul de l'intervalle moyen entre pleins
      let avgDaysBetweenFills: number | null = null;
      if (vehicleFuelLogs.length >= 2) {
        const sortedByDate = [...vehicleFuelLogs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        let totalDays = 0; let cnt = 0;
        for (let i = 1; i < sortedByDate.length; i++) {
          const diff = Math.round((new Date(sortedByDate[i].date).getTime() - new Date(sortedByDate[i - 1].date).getTime()) / (1000 * 60 * 60 * 24));
          if (diff > 0) { totalDays += diff; cnt++; }
        }
        avgDaysBetweenFills = cnt > 0 ? Math.round(totalDays / cnt) : null;
      }

      stats.set(vehicle.id, {
        consumption: averageConsumption,
        latestConsumption,
        cost: latestCost,
        lastLogQuantity: lastLog.quantity,
        lastLogTotalCost: lastLog.totalCost,
        kmPerDay: smartAutonomie?.kmPerDay ?? kmPerDay,
        averageSpeed: estimatedSpeed,
        drivingStyle,
        daysUntilEmpty: smartAutonomie?.daysUntilEmpty,
        remainingRangeKm: smartAutonomie?.remainingRangeKm,
        estimatedCurrentMileage: smartAutonomie?.estimatedCurrentMileage,
        avgRefillGauge,
        avgDaysBetweenFills
      });
    });

    return stats;
  }, [vehicles, fuelLogs]);

  const costCardDescription = useMemo(() => {
    if (vehicles.length === 1) {
      return `Pour ${vehicles[0].licensePlate}`;
    }
    if (vehicles.length > 1) {
      return "Total sur tous les véhicules";
    }
    return "Aucun véhicule";
  }, [vehicles]);

  if (!hasMounted || isVehiclesLoading) {
    return (
      <AppLayout>
        <DashboardHeader title="Tableau de Bord" description="Chargement de vos données..." showLogo={true} />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-8">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <Skeleton className="h-96" />
            <Skeleton className="h-96" />
          </div>
        </main>
      </AppLayout>
    )
  }

  const getVehicleForStat = (vehicleId?: string): Vehicle | undefined => {
    if (!vehicleId) return undefined;
    return vehicles.find(v => v.id === vehicleId);
  }

  const getNextDeadlineValue = (deadline: Deadline | null) => {
    if (!deadline) return "Aucune";
    if (deadline.type === 'date') return format(deadline.date, 'd MMM yyyy', { locale: fr });
    return `~ ${deadline.kmRemaining.toLocaleString('fr-FR')} km`;
  }

  const getNextDeadlineDescription = (deadline: Deadline | null) => {
    if (!deadline) return "Aucune échéance à venir";
    const vehicle = getVehicleForStat(deadline.vehicleId);
    let desc = `${deadline.name} (${vehicle?.licensePlate || 'N/A'})`;
    if (deadline.type === 'date') {
      const anticipation = getDeadlineAnticipationInfo(deadline.date);
      if (anticipation.isNonWorking) {
        desc += ` • ⚠️ ${anticipation.shortWarningText.replace(/^⚠️\s*/, '')}`;
      }
    }
    if (getCanonicalTask(deadline.name) === 'vidange') {
      const localNotes = typeof window !== 'undefined' ? localStorage.getItem(`carcare_vidange_notes_${deadline.vehicleId}`) : null;
      if (vehicle?.nextVidangeNotes || localNotes) {
        desc += ` • 📝 Pense-bête actif`;
      }
    }
    return desc;
  }

  const getDeadlineBadge = (deadline: Deadline | null) => {
    if (!deadline) return undefined;
    const canonical = getCanonicalTask(deadline.name);
    if (canonical === 'vidange') {
      const veh = getVehicleForStat(deadline.vehicleId);
      const localNotes = typeof window !== 'undefined' ? localStorage.getItem(`carcare_vidange_notes_${deadline.vehicleId}`) : null;
      const hasNotes = !!(veh?.nextVidangeNotes || localNotes);
      if (hasNotes) {
        return (
          <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-amber-800 dark:text-amber-200 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded-full" title="Pense-bête mécanicien actif">
            <StickyNote className="h-2.5 w-2.5 text-amber-600 dark:text-amber-400" />
            Pense-bête actif
          </span>
        );
      }
    }
    return undefined;
  };

  const getDeadlineSecondaryAction = (deadline: Deadline | null) => {
    if (!deadline) return undefined;
    const canonical = getCanonicalTask(deadline.name);
    if (canonical === 'visite_technique') {
      return {
        label: 'Checklist',
        url: `/checklist-visite-technique?vehicleId=${deadline.vehicleId}`,
        icon: ClipboardList,
        variantClass: 'border-blue-500/40 text-blue-600 dark:text-blue-400',
      };
    }
    if (canonical === 'vignette') {
      return {
        label: 'Amendes',
        url: 'https://amendes.finances.gov.tn/cons_amende.jsp',
        isExternal: true,
        icon: ExternalLink,
        variantClass: 'border-amber-500/40 text-amber-600 dark:text-amber-400',
        onClick: () => {
          const veh = getVehicleForStat(deadline.vehicleId);
          if (veh?.licensePlate && typeof navigator !== 'undefined' && navigator.clipboard) {
            navigator.clipboard.writeText(veh.licensePlate);
            toast({
              title: "Matricule copié !",
              description: `${veh.licensePlate} copié dans le presse-papier. Collez-le (Ctrl+V) sur le portail des amendes.`,
            });
          }
        }
      };
    }
    if (canonical === 'vidange') {
      const veh = getVehicleForStat(deadline.vehicleId);
      const localNotes = typeof window !== 'undefined' ? localStorage.getItem(`carcare_vidange_notes_${deadline.vehicleId}`) : null;
      const hasNotes = !!(veh?.nextVidangeNotes || localNotes);
      return {
        label: hasNotes ? 'Consulter' : 'Historique',
        icon: hasNotes ? StickyNote : History,
        variantClass: hasNotes ? 'border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10' : 'border-blue-500/40 text-blue-600 dark:text-blue-400',
        onClick: () => {
          setVidangeHistoryVehicleId(deadline.vehicleId);
        }
      };
    }
    return undefined;
  };


  return (
    <>
      <AppLayout>
        <DashboardHeader
          title="Tableau de Bord"
          description="Vue d'ensemble de votre flotte de véhicules."
          showLogo={true}
        >
          <AddVehicleSheet onVehicleAdded={handleVehicleAdded}>
            <Button size="sm" className="h-8 sm:h-9 px-2 sm:px-4 text-xs sm:text-sm font-semibold shrink-0 gap-1">
              <PlusCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
              <span className="hidden sm:inline">Ajouter un véhicule</span>
              <span className="sm:hidden">Ajouter</span>
            </Button>
          </AddVehicleSheet>
        </DashboardHeader>
        <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-8">
          {vehicles.map(vehicle => {
            const stats = fuelStats.get(vehicle.id);
            if (stats && stats.remainingRangeKm != null && stats.remainingRangeKm > 0) {
              const daysUntilEmpty = stats.daysUntilEmpty;
              const remainingRangeKm = stats.remainingRangeKm;

              return (
                <div key={vehicle.id} className={`mb-3 p-2 rounded-md border flex items-center justify-between transition-all duration-500 shadow-sm ${daysUntilEmpty != null && daysUntilEmpty < 3
                  ? 'bg-red-500/10 border-red-500/30 animate-pulse'
                  : 'bg-card border-emerald-500/20'}`}>
                  <div className="flex items-center gap-2.5">
                    <div className={`p-1 rounded-full ${daysUntilEmpty != null && daysUntilEmpty < 3 ? 'bg-red-500/20' : 'bg-emerald-500/20'}`}>
                      <Gauge className={`h-3.5 w-3.5 ${daysUntilEmpty != null && daysUntilEmpty < 3 ? 'text-red-500' : 'text-emerald-500'}`} />
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-medium text-foreground">{vehicle.brand} {vehicle.model}</span>
                        <span className="text-[9px] text-muted-foreground px-1 py-px rounded-full bg-muted/50 border border-border/50">Smart Autonomie</span>
                      </div>
                      <div className="flex items-baseline gap-2 mt-0.5">
                        <span className={`text-base font-bold leading-none ${daysUntilEmpty != null && daysUntilEmpty < 3 ? 'text-red-500' : 'text-emerald-500'}`}>
                          ≈ {Math.round(remainingRangeKm)} km
                        </span>
                        {stats.estimatedCurrentMileage != null && stats.estimatedCurrentMileage > 0 && (
                          <span className="text-[9px] text-muted-foreground font-normal tracking-tight">
                            · ~{stats.estimatedCurrentMileage.toLocaleString('fr-FR')} km (estimé)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {daysUntilEmpty != null && (
                    <div className="text-right">
                      <span className={`text-[10px] block font-medium ${daysUntilEmpty < 3 ? 'text-red-500' : daysUntilEmpty < 7 ? 'text-orange-500' : 'text-emerald-400'}`}>
                        {daysUntilEmpty < 3 ? "Plein urgent ! ⛽" :
                          daysUntilEmpty < 7 ? "Pensez-y cette semaine 📅" :
                            "Tranquille 😎"}
                      </span>
                      <span className="text-[9px] text-muted-foreground">
                        {daysUntilEmpty < 2 ? "Aujourd'hui" : `~${Math.ceil(daysUntilEmpty)} jours restants`}
                      </span>
                    </div>
                  )}
                </div>
              );
            }
            return null;
          })}

          {vehicles.length > 0 && (
            <QuickFuelLogForm
              vehicles={vehicles}
              fuelLogs={fuelLogs}
              onFuelLogAdded={() => fetchData(false)}
              onOpenVehicleFuel={(vehicleId) => {
                const vehicle = vehicles.find(v => v.id === vehicleId);
                if (vehicle) {
                  setTargetTab('fuel');
                  setVehicleForDetailView(vehicle);
                }
              }}
            />
          )}

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title={nextDeadline ? (isDeadlineUrgent ? "Échéance Proche !" : "Prochaine Échéance") : "Prochaine Échéance"}
              value={getNextDeadlineValue(nextDeadline)}
              badge={getDeadlineBadge(nextDeadline)}
              icon={Bell}
              description={getNextDeadlineDescription(nextDeadline)}
              onClick={() => {
                setTargetTab(undefined);
                setVehicleForDetailView(getVehicleForStat(nextDeadline?.vehicleId) || null);
              }}
              onComplete={() => setDeadlineToComplete(nextDeadline)}
              secondaryAction={getDeadlineSecondaryAction(nextDeadline)}
              disabled={!nextDeadline}
              isLoading={isStatsLoading}
              isUrgent={isDeadlineUrgent}
              iconGradient="from-blue-500 to-indigo-600"
              shadow="shadow-blue-500/20"
            />
            <StatCard
              title={secondNextDeadline ? (isSecondDeadlineUrgent ? "Échéance Suivante" : "Échéance Suivante") : "Échéance Suivante"}
              value={getNextDeadlineValue(secondNextDeadline)}
              badge={getDeadlineBadge(secondNextDeadline)}
              icon={Bell}
              description={getNextDeadlineDescription(secondNextDeadline)}
              onClick={() => {
                setTargetTab(undefined);
                setVehicleForDetailView(getVehicleForStat(secondNextDeadline?.vehicleId) || null);
              }}
              onComplete={() => setDeadlineToComplete(secondNextDeadline)}
              secondaryAction={getDeadlineSecondaryAction(secondNextDeadline)}
              disabled={!secondNextDeadline}
              isLoading={isStatsLoading}
              isUrgent={isSecondDeadlineUrgent}
              iconGradient="from-slate-500 to-slate-700"
              shadow="shadow-slate-500/20"
            />
            <StatCard
              title="Coût des Réparations"
              value={`${yearlyRepairCost.toLocaleString('fr-FR', { style: 'currency', currency: 'TND' })}`}
              icon={Wrench}
              description={`En ${new Date().getFullYear()} · Total : ${totalRepairCost.toLocaleString('fr-FR', { style: 'currency', currency: 'TND' })}`}
              disabled
              isLoading={isStatsLoading}
              iconGradient="from-rose-500 to-red-600"
              shadow="shadow-rose-500/20"
            />
            <StatCard
              title="Dépenses Carburant"
              value={`${yearlyFuelCost.toLocaleString('fr-FR', { style: 'currency', currency: 'TND' })}`}
              icon={Fuel}
              description={`En ${new Date().getFullYear()} · Total : ${totalFuelCost.toLocaleString('fr-FR', { style: 'currency', currency: 'TND' })}`}
              disabled
              isLoading={isStatsLoading}
              iconGradient="from-orange-400 to-amber-600"
              shadow="shadow-orange-500/20"
            />
          </div>



          <div className="space-y-4">
            <h2 className="text-2xl font-bold tracking-tight">Mes Véhicules</h2>
            {vehicles.length > 0 ? (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {vehicles.map((vehicle) => {
                  const stats = fuelStats.get(vehicle.id);
                  const vehicleFuelLogs = fuelLogs.filter(log => log.vehicleId === vehicle.id);
                  return (
                    <VehicleCard
                      key={vehicle.id}
                      vehicle={vehicle}
                      onShowDetails={() => {
                        setTargetTab(undefined);
                        setVehicleForDetailView(vehicle);
                      }}
                      onDeleted={() => fetchData(true)}
                      fuelConsumption={stats?.consumption}
                      latestConsumption={stats?.latestConsumption}
                      fuelCost={stats?.cost}
                      lastLogQuantity={stats?.lastLogQuantity}
                      lastLogTotalCost={stats?.lastLogTotalCost}
                      fuelLogs={vehicleFuelLogs}
                      kmPerDay={stats?.kmPerDay}
                      averageSpeed={stats?.averageSpeed}
                      drivingStyle={stats?.drivingStyle}
                      daysUntilEmpty={stats?.daysUntilEmpty}
                      remainingRangeKm={stats?.remainingRangeKm}
                      avgRefillGauge={stats?.avgRefillGauge}
                      avgDaysBetweenFills={stats?.avgDaysBetweenFills}
                    />
                  );
                })}
              </div>
            ) : (
              <Card className="flex flex-col items-center justify-center py-20 text-center">
                <CardHeader>
                  <CardTitle className="text-2xl">Aucun véhicule trouvé</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-6">
                    Commencez par ajouter votre premier véhicule pour suivre son entretien.
                  </p>
                  <AddVehicleSheet onVehicleAdded={handleVehicleAdded}>
                    <Button>
                      <PlusCircle className="mr-2" />
                      Ajouter un véhicule
                    </Button>
                  </AddVehicleSheet>
                </CardContent>
              </Card>
            )}
          </div>

        </main>
      </AppLayout>

      <VehicleDetailModal
        vehicle={vehicleForDetailView}
        open={!!vehicleForDetailView}
        onOpenChange={(isOpen) => !isOpen && setVehicleForDetailView(null)}
        onDataChange={() => fetchData(false)}
        initialTab={targetTab}
      />

      <AddInitialMaintenanceForm
        vehicle={vehicleForInitialMaintenance}
        open={!!vehicleForInitialMaintenance}
        onOpenChange={(isOpen) => !isOpen && setVehicleForInitialMaintenance(null)}
        onFinished={handleInitialMaintenanceFinished}
      />

      <LastVidangeModal
        open={!!vidangeHistoryVehicleId}
        onOpenChange={(isOpen) => !isOpen && setVidangeHistoryVehicleId(null)}
        summary={vidangeHistorySummary}
        vehicle={vidangeHistoryVehicle}
        onVehicleUpdated={(updated) => {
          setVehicles(prev => prev.map(v => v.id === updated.id ? updated : v));
        }}
      />

      <CompleteDeadlineDialog
        deadline={deadlineToComplete}
        allEvents={allEvents}
        maintenance={maintenance}
        repairs={repairs}
        open={!!deadlineToComplete}
        onOpenChange={(isOpen) => !isOpen && setDeadlineToComplete(null)}
        onComplete={() => {
          setDeadlineToComplete(null);
          fetchData();
        }}
        vehicles={vehicles}
      />
    </>
  );
}


function LastVidangeModal({
  open,
  onOpenChange,
  summary,
  vehicle,
  onVehicleUpdated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: LastVidangeSummary | null;
  vehicle: Vehicle | null;
  onVehicleUpdated?: (updatedVehicle: Vehicle) => void;
}) {
  const [memo, setMemo] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const { toast } = useToast();

  const savedNote = useMemo(() => {
    if (!vehicle) return '';
    const localNotes = typeof window !== 'undefined' ? localStorage.getItem(`carcare_vidange_notes_${vehicle.id}`) : null;
    return vehicle.nextVidangeNotes ?? (localNotes || '');
  }, [vehicle, open]);

  useEffect(() => {
    if (vehicle && open) {
      const current = vehicle.nextVidangeNotes ?? (typeof window !== 'undefined' ? localStorage.getItem(`carcare_vidange_notes_${vehicle.id}`) : '') ?? '';
      setMemo(current);
      setIsEditing(false);
    }
  }, [vehicle, open]);

  if (!vehicle || !summary) return null;

  const handleSaveMemo = async () => {
    if (!vehicle) return;
    setIsSaving(true);
    const trimmed = memo.trim();
    try {
      if (typeof window !== 'undefined') {
        if (trimmed) {
          localStorage.setItem(`carcare_vidange_notes_${vehicle.id}`, trimmed);
        } else {
          localStorage.removeItem(`carcare_vidange_notes_${vehicle.id}`);
        }
      }
      await updateVehicle(vehicle.id, { nextVidangeNotes: trimmed });
      toast({
        title: trimmed ? "Pense-bête enregistré !" : "Pense-bête effacé",
        description: trimmed
          ? "Ce rappel sera affiché en évidence lors de votre prochain passage chez le mécanicien."
          : "Le rappel a été retiré.",
      });
      if (onVehicleUpdated) {
        onVehicleUpdated({ ...vehicle, nextVidangeNotes: trimmed });
      }
      setIsEditing(false);
    } catch (err) {
      console.error("Error saving vidange memo:", err);
      toast({
        title: "Pense-bête sauvegardé en local",
        description: "Votre note est bien conservée sur cet appareil.",
      });
      if (onVehicleUpdated) {
        onVehicleUpdated({ ...vehicle, nextVidangeNotes: trimmed });
      }
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteMemo = async () => {
    if (!vehicle) return;
    setIsSaving(true);
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(`carcare_vidange_notes_${vehicle.id}`);
      }
      await updateVehicle(vehicle.id, { nextVidangeNotes: '' });
      setMemo('');
      setIsEditing(false);
      toast({
        title: "Pense-bête supprimé",
        description: "Le mémo pour la prochaine vidange a été effacé.",
      });
      if (onVehicleUpdated) {
        onVehicleUpdated({ ...vehicle, nextVidangeNotes: '' });
      }
    } catch (err) {
      console.error("Error deleting memo:", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Droplets className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg">Historique & Préparation Vidange</DialogTitle>
              <DialogDescription className="text-xs">
                {vehicle.brand} {vehicle.model} ({vehicle.licensePlate || 'N/A'})
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Section PENSE-BÊTE placé tout en haut de la fenêtre pour une visibilité immédiate */}
        <div className="pt-1">
          {savedNote && !isEditing ? (
            /* Affichage comme un vrai Post-It / Pense-bête adhésif */
            <div className="relative pt-3 pb-3 px-3.5 rounded-xl bg-gradient-to-br from-amber-100 via-amber-50 to-amber-100 dark:from-amber-950/60 dark:via-amber-900/30 dark:to-amber-950/50 border border-amber-300 dark:border-amber-700/60 shadow-md shadow-amber-500/10 text-amber-950 dark:text-amber-100 space-y-2">
              {/* Ruban adhésif / Scotch effet pense-bête */}
              <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-12 h-3.5 bg-amber-200/90 dark:bg-amber-600/40 rounded-xs shadow-xs border border-amber-300/80 dark:border-amber-500/30 -rotate-1" />

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold text-xs text-amber-900 dark:text-amber-200">
                  <Pin className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400 fill-amber-700/30 -rotate-45" />
                  <span>Pense-bête mécanicien (prochaine vidange) :</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px] text-amber-900 dark:text-amber-200 hover:bg-amber-200/60 dark:hover:bg-amber-900/50 gap-1 font-semibold"
                    onClick={() => {
                      setMemo(savedNote);
                      setIsEditing(true);
                    }}
                  >
                    <Edit3 className="h-3 w-3" />
                    Modifier
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-amber-800/70 hover:text-destructive hover:bg-destructive/10"
                    onClick={handleDeleteMemo}
                    disabled={isSaving}
                    title="Supprimer ce pense-bête"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              <div className="bg-amber-50/90 dark:bg-black/30 rounded-lg p-2.5 border border-amber-200/90 dark:border-amber-800/40">
                <p className="text-xs leading-relaxed whitespace-pre-wrap font-medium text-amber-950 dark:text-amber-100">
                  « {savedNote} »
                </p>
              </div>

              <p className="text-[10px] text-amber-800/80 dark:text-amber-300/80 flex items-center gap-1">
                <span>💡</span>
                <span>Rappelé automatiquement lors de la validation de la prochaine vidange.</span>
              </p>
            </div>
          ) : isEditing ? (
            /* Mode édition / création du pense-bête */
            <div className="p-3.5 rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-400/70 dark:border-amber-700/60 shadow-xs space-y-2.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="vidange-memo" className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                  <StickyNote className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  {savedNote ? 'Modifier votre pense-bête :' : 'Nouveau pense-bête pour le mécanicien :'}
                </Label>
                {memo && (
                  <span className="text-[10px] text-muted-foreground">{memo.length} car.</span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground leading-tight">
                Notez les vérifications ou pièces à signaler au mécanicien (ex : plaquettes avant, vibration, bruit suspect, permutation des pneus...).
              </p>
              <Textarea
                id="vidange-memo"
                rows={3}
                placeholder="Ex : Vérifier les plaquettes avant, permuter les pneus, vérifier un léger sifflement au freinage..."
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                className="text-xs bg-background resize-none border-amber-300 dark:border-amber-800 focus-visible:ring-amber-500"
                autoFocus
              />
              <div className="flex items-center justify-between pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    setMemo(savedNote);
                    setIsEditing(false);
                  }}
                >
                  Annuler
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={isSaving}
                  className="h-7 text-xs gap-1.5 bg-amber-600 hover:bg-amber-700 text-white font-medium"
                  onClick={handleSaveMemo}
                >
                  {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Enregistrer
                </Button>
              </div>
            </div>
          ) : (
            /* Bannière compacte pour ajouter un pense-bête s'il n'en existe pas encore */
            <div className="flex items-center justify-between p-2.5 rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 text-xs">
              <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
                <StickyNote className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <span className="text-[11px] font-medium">Un truc à faire vérifier lors de la vidange ?</span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 gap-1 font-medium"
                onClick={() => {
                  setMemo('');
                  setIsEditing(true);
                }}
              >
                <PlusCircle className="h-3.5 w-3.5" />
                Ajouter un pense-bête
              </Button>
            </div>
          )}
        </div>

        {summary.hasHistory ? (
          <div className="space-y-4 py-2 border-t mt-1">
            {/* Résumé général */}
            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-muted/40 border text-xs">
              <div>
                <span className="text-muted-foreground block text-[11px]">Réalisée le :</span>
                <span className="font-semibold text-foreground text-sm">
                  {summary.date ? format(new Date(summary.date), 'd MMMM yyyy', { locale: fr }) : 'Date inconnue'}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Kilométrage :</span>
                <span className="font-semibold text-foreground text-sm">
                  {summary.mileage ? `${summary.mileage.toLocaleString('fr-FR')} km` : 'Non renseigné'}
                </span>
                {summary.kmSinceLastVidange !== null && (
                  <span className="text-[10px] text-muted-foreground block">
                    (il y a {summary.kmSinceLastVidange.toLocaleString('fr-FR')} km)
                  </span>
                )}
              </div>
            </div>

            {/* Éléments remplacés */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                Pièces remplacées lors de cette vidange :
              </span>
              {summary.replacedItems.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {summary.replacedItems.map((item) => (
                    <Badge
                      key={item}
                      className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-xs font-medium"
                    >
                      ✓ {item}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">Vidange moteur standard enregistrée.</p>
              )}
            </div>

            {/* Information filtre carburant si non applicable sur ce modèle (ex: Peugeot 308 essence) */}
            {!isFuelFilterApplicable(vehicle) && (
              <div className="p-2.5 rounded-lg bg-muted/40 border border-muted-foreground/15 text-xs flex items-center justify-between text-muted-foreground">
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span>⛽</span>
                  <span>Filtre à essence : non applicable (intégré au réservoir sur {vehicle.model || 'ce modèle'})</span>
                </div>
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-muted-foreground shrink-0">
                  À vie
                </Badge>
              </div>
            )}

            {/* Diagnostic d'usure prédictif des filtres & bougies */}
            {summary.predictions && summary.predictions.length > 0 && (
              <div className="space-y-2 pt-2 border-t">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  Diagnostic d'usure prédictif (Filtres & Bougies) :
                </span>
                <p className="text-[11px] text-muted-foreground">
                  Analyse automatique selon les cycles et le kilométrage de vos entretiens :
                </p>
                <div className="space-y-1.5">
                  {summary.predictions.map((pred) => (
                    <div
                      key={pred.id}
                      className={cn(
                        "p-2 rounded-lg border text-xs flex items-start justify-between gap-2 transition-colors",
                        pred.status === 'recommended'
                          ? "bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200"
                          : "bg-muted/30 border-border/60 text-muted-foreground"
                      )}
                    >
                      <div className="space-y-0.5 flex-1">
                        <div className="flex items-center gap-1.5 font-semibold text-foreground">
                          <span>{pred.status === 'recommended' ? '⚠️' : '✓'}</span>
                          <span>{pred.label}</span>
                        </div>
                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                          {pred.recommendationMessage}
                        </p>
                      </div>
                      <Badge
                        variant={pred.status === 'recommended' ? 'default' : 'outline'}
                        className={cn(
                          "text-[10px] shrink-0 font-medium",
                          pred.status === 'recommended'
                            ? "bg-amber-600 hover:bg-amber-600 text-white border-none"
                            : "text-muted-foreground"
                        )}
                      >
                        {pred.status === 'recommended' ? 'À changer' : 'OK'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Interventions concomitantes (dans les 3 jours) */}
            {summary.nearbyEvents.length > 0 && (
              <div className="pt-2 border-t text-xs space-y-1.5">
                <span className="font-medium text-muted-foreground text-[11px]">
                  Autres opérations effectuées au même moment (± 3 jours) :
                </span>
                <ul className="space-y-1">
                  {summary.nearbyEvents.map((evt, idx) => (
                    <li key={idx} className="flex justify-between text-muted-foreground bg-muted/30 px-2 py-1 rounded text-xs">
                      <span>• {evt.title}</span>
                      {evt.cost > 0 && <span className="font-medium">{evt.cost.toLocaleString('fr-FR')} TND</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="py-4 text-center space-y-2 text-xs text-muted-foreground border-b pb-4">
            <p>Aucune vidange passée n'est encore enregistrée pour ce véhicule.</p>
            <p>L'historique détaillé et les recommandations se construiront dès votre première vidange enregistrée !</p>
          </div>
        )}

        <DialogFooter className="pt-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function CompleteDeadlineDialog({
  deadline,
  open,
  onOpenChange,
  onComplete,
  vehicles,
  allEvents,
  maintenance = [],
  repairs = [],
}: {
  deadline: Deadline | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
  vehicles: Vehicle[];
  allEvents: any[];
  maintenance?: Maintenance[];
  repairs?: Repair[];
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const { vehicle, latestMileage } = useMemo(() => {
    if (!deadline) return { vehicle: null, latestMileage: 0 };

    const vehicle = vehicles.find(v => v.id === deadline.vehicleId);
    const latestEvent = allEvents
      .filter(e => e.vehicleId === deadline.vehicleId)
      .sort((a, b) => b.eventDate.getTime() - a.eventDate.getTime())[0];

    return { vehicle, latestMileage: latestEvent?.mileage || 0 };
  }, [vehicles, deadline, allEvents]);

  const canonicalTask = useMemo(() => {
    if (!deadline) return '';
    const clean = deadline.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (clean.includes('assurance')) return 'assurance';
    if (clean.includes('visite') || clean.includes('controle')) return 'visite_technique';
    if (clean.includes('vignette')) return 'vignette';
    if (clean.includes('vidange')) return 'vidange';
    return clean;
  }, [deadline]);

  const needsCost = useMemo(() => {
    if (!deadline) return false;
    return ['visite_technique', 'vidange', 'assurance', 'vignette'].includes(canonicalTask);
  }, [deadline, canonicalTask]);

  const needsMileage = useMemo(() => {
    if (!deadline) return false;
    return canonicalTask === 'vidange';
  }, [deadline, canonicalTask]);

  const lastVidangeSummary = useMemo(() => {
    if (!vehicle || canonicalTask !== 'vidange') return null;
    return getLastVidangeSummary({
      vehicleId: vehicle.id,
      maintenanceList: maintenance,
      repairsList: repairs,
      currentMileage: latestMileage,
      vehicle: vehicle,
    });
  }, [vehicle, canonicalTask, maintenance, repairs, latestMileage]);

  const [selectedVidangeItems, setSelectedVidangeItems] = useState<string[]>(['huile', 'filtre_huile']);

  const savedVidangeNotes = useMemo(() => {
    if (!vehicle || canonicalTask !== 'vidange') return '';
    const local = typeof window !== 'undefined' ? localStorage.getItem(`carcare_vidange_notes_${vehicle.id}`) : null;
    return vehicle.nextVidangeNotes ?? (local || '');
  }, [vehicle, canonicalTask]);

  useEffect(() => {
    if (open && canonicalTask === 'vidange') {
      setSelectedVidangeItems(['huile', 'filtre_huile']);
    }
  }, [open, canonicalTask]);


  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !deadline || !vehicle) return;

    setIsSubmitting(true);
    const formData = new FormData(event.currentTarget);
    const cost = parseFloat(formData.get('cost') as string || '0');
    const mileageInput = formData.get('mileage') as string;
    const today = new Date().toISOString().split('T')[0];

    try {
      let standardizedTask = deadline.name;
      if (canonicalTask === 'assurance') standardizedTask = 'Paiement Assurance';
      else if (canonicalTask === 'visite_technique') standardizedTask = 'Visite technique';
      else if (canonicalTask === 'vignette') standardizedTask = 'Vignette';
      else if (canonicalTask === 'vidange') standardizedTask = 'Vidange';

      const newMaintenance: Omit<Maintenance, 'id' | 'userId'> = {
        vehicleId: vehicle.id,
        task: standardizedTask,
        date: today,
        cost: 0,
        mileage: 0,
      };

      if (canonicalTask === 'vidange') {
        newMaintenance.replacedItems = selectedVidangeItems;
        const itemLabels = getStandardVidangeItems(vehicle).filter(i => selectedVidangeItems.includes(i.id)).map(i => i.shortLabel);
        let notesContent = `Pack vidange : ${itemLabels.join(', ')}`;
        if (savedVidangeNotes) {
          notesContent += ` | Pense-bête mécanicien : ${savedVidangeNotes}`;
        }
        newMaintenance.notes = notesContent;

        // Effacer le pense-bête une fois la vidange enregistrée
        if (typeof window !== 'undefined') {
          localStorage.removeItem(`carcare_vidange_notes_${vehicle.id}`);
        }
        await updateVehicle(vehicle.id, { nextVidangeNotes: '' });
      }

      if (needsCost) newMaintenance.cost = cost;

      if (needsMileage) {
        const mileage = parseInt(mileageInput || '0', 10);
        if (!mileage || mileage <= 0) {
          toast({ title: "Erreur", description: "Le kilométrage est requis pour une vidange.", variant: "destructive" });
          setIsSubmitting(false);
          return;
        }
        newMaintenance.mileage = mileage;
      } else {
        newMaintenance.mileage = latestMileage || deadline.originalTask.mileage;
      }

      if (needsCost && cost === 0 && canonicalTask !== 'assurance') {
        const settings = getSettings();
        if (canonicalTask === 'vignette' && vehicle.fiscalPower) {
          const vignetteSettings = vehicle.fuelType === 'Diesel' ? settings.vignetteDiesel : settings.vignetteEssence;
          const powerRange = vignetteSettings.find(v => {
            if (v.range.includes('-')) {
              const [min, max] = v.range.split('-').map(Number);
              return vehicle.fiscalPower! >= min && vehicle.fiscalPower! <= max;
            }
            return Number(v.range) === vehicle.fiscalPower!;
          });
          if (powerRange) newMaintenance.cost = powerRange.cost;
        } else if (canonicalTask === 'visite_technique') {
          newMaintenance.cost = settings.costVisiteTechnique;
        }
      }

      // Create the new maintenance record for today's action
      const addedMaintenance = await addMaintenance(newMaintenance, user.uid);

      // Now, update the OLD maintenance task to remove its deadline fields
      // (skip if it's a synthetic record with no real Firestore ID)
      const isSyntheticRecord = deadline.originalTask.id?.startsWith('synthetic-');
      if (deadline.originalTask.id && !isSyntheticRecord) {
        await updateMaintenance(deadline.originalTask.id, {
          nextDueDate: undefined,
          nextDueMileage: undefined,
        } as any); // Use 'any' to allow 'undefined' for deletion
      }

      // Finally, create the *next* deadline by updating the record we just added
      const nextMaintenanceData: Partial<Maintenance> = {};

      if (canonicalTask === 'vidange') {
        nextMaintenanceData.nextDueMileage = (addedMaintenance.mileage || 0) + 10000;
      } else if (canonicalTask === 'vignette') {
        nextMaintenanceData.nextDueDate = formatDateToLocalISO(calculateNextVignetteDate(vehicle.licensePlate, new Date(addedMaintenance.date)));
      } else if (canonicalTask === 'visite_technique') {
        // La visite technique est valide exactement 1 an à compter du jour où l'entretien est effectué/réglé
        const [y, m, d] = today.split('-').map(Number);
        const nextDate = new Date(y + 1, m - 1, d);
        nextMaintenanceData.nextDueDate = formatDateToLocalISO(nextDate);
      } else if (canonicalTask === 'assurance') {
        let monthsToAdd = 12; // défaut annuel
        if (deadline.originalTask.nextDueDate && deadline.originalTask.date) {
          const oldDueDate = new Date(deadline.originalTask.nextDueDate);
          const oldDate = new Date(deadline.originalTask.date);
          const monthDiff = (oldDueDate.getFullYear() - oldDate.getFullYear()) * 12 + (oldDueDate.getMonth() - oldDate.getMonth());
          monthsToAdd = monthDiff > 8 ? 12 : 6;
        }
        const baseDate = deadline.originalTask.nextDueDate ? new Date(deadline.originalTask.nextDueDate) : new Date(today);
        baseDate.setMonth(baseDate.getMonth() + monthsToAdd);
        nextMaintenanceData.nextDueDate = formatDateToLocalISO(baseDate);
      }

      if (Object.keys(nextMaintenanceData).length > 0) {
        await updateMaintenance(addedMaintenance.id, nextMaintenanceData);
      }


      toast({ title: 'Succès', description: `${deadline.name} a été enregistré.` });
      onComplete();

    } catch (error) {
      console.error("Error completing deadline:", error);
      toast({ title: "Erreur", description: "Impossible d'enregistrer l'entretien.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!deadline || !vehicle) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={canonicalTask === 'vidange' ? "max-w-lg" : "max-w-md"}>
        <DialogHeader>
          <DialogTitle>Confirmer l'entretien</DialogTitle>
          <DialogDescription>
            Avez-vous bien effectué l'entretien suivant pour {vehicle.brand} {vehicle.model} ?
            <br />
            <span className="font-semibold text-foreground">{deadline.name}</span>
          </DialogDescription>
        </DialogHeader>
        <form ref={formRef} onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {/* Rappel intelligent de la précédente vidange */}
            {canonicalTask === 'vidange' && lastVidangeSummary?.hasHistory && (
              <div className="p-3 rounded-lg bg-blue-50/70 dark:bg-blue-950/20 border border-blue-500/20 text-xs text-blue-900 dark:text-blue-200 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold">
                  <History className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  <span>Rappel de la précédente vidange :</span>
                </div>
                <p className="text-muted-foreground leading-relaxed text-[11px]">
                  Effectuée le {lastVidangeSummary.date ? format(new Date(lastVidangeSummary.date), 'd MMMM yyyy', { locale: fr }) : ''} à {lastVidangeSummary.mileage?.toLocaleString('fr-FR')} km.
                  {lastVidangeSummary.replacedItems.length > 0 && (
                    <> Éléments remplacés : <strong className="text-foreground">{lastVidangeSummary.replacedItems.join(', ')}</strong>.</>
                  )}
                </p>
                {lastVidangeSummary.notReplacedItems.length > 0 && (
                  <p className="text-[10px] text-amber-700 dark:text-amber-300">
                    💡 Non remplacés la dernière fois : {lastVidangeSummary.notReplacedItems.join(', ')}.
                  </p>
                )}
              </div>
            )}

            {/* Rappel du pense-bête pour le mécanicien sous forme de Post-it */}
            {canonicalTask === 'vidange' && !!savedVidangeNotes && (
              <div className="relative pt-3 pb-2.5 px-3 rounded-xl bg-gradient-to-br from-amber-100 via-amber-50 to-amber-100 dark:from-amber-950/60 dark:via-amber-900/30 dark:to-amber-950/50 border border-amber-300 dark:border-amber-700/60 shadow-xs text-xs space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-amber-900 dark:text-amber-200">
                  <Pin className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400 fill-amber-700/30 -rotate-45" />
                  <span>Votre pense-bête pour ce rendez-vous mécanicien :</span>
                </div>
                <div className="bg-amber-50/90 dark:bg-black/30 rounded-lg p-2 border border-amber-200/90 dark:border-amber-800/40">
                  <p className="text-amber-950 dark:text-amber-100 text-[11px] whitespace-pre-wrap font-medium">
                    « {savedVidangeNotes} »
                  </p>
                </div>
                <p className="text-[10px] text-amber-800/80 dark:text-amber-300/80 italic">
                  💡 Ce pense-bête sera automatiquement archivé dans les notes de cette vidange.
                </p>
              </div>
            )}

            {/* Diagnostic d'usure prédictif */}
            {canonicalTask === 'vidange' && lastVidangeSummary?.predictions?.some(p => p.status === 'recommended') && (
              <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold">
                  <Sparkles className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Conseil d'usure prédictif (Filtres & Bougies) :</span>
                </div>
                <ul className="space-y-0.5 text-[11px] list-disc pl-4 text-muted-foreground">
                  {lastVidangeSummary.predictions.filter(p => p.status === 'recommended').map(p => (
                    <li key={p.id}>
                      <strong className="text-foreground">{p.label}</strong> : {p.recommendationMessage}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Lien direct amendes radar si l'utilisateur veut vérifier avant de marquer la vignette */}
            {canonicalTask === 'vignette' && (
              <div className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-500/20">
                <span className="text-muted-foreground text-[11px]">Un doute sur les amendes radar ?</span>
                <a
                  href="https://amendes.finances.gov.tn/cons_amende.jsp"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    if (vehicle?.licensePlate && typeof navigator !== 'undefined' && navigator.clipboard) {
                      navigator.clipboard.writeText(vehicle.licensePlate);
                      toast({
                        title: "Matricule copié !",
                        description: `${vehicle.licensePlate} copié dans le presse-papier.`,
                      });
                    }
                  }}
                  className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 hover:underline font-medium"
                >
                  <ExternalLink className="h-3 w-3" />
                  Vérifier sur le portail officiel
                </a>
              </div>
            )}

            {needsMileage && (
              <div className="space-y-2">
                <Label htmlFor="mileage">Kilométrage actuel</Label>
                <Input id="mileage" name="mileage" type="number" required placeholder="ex: 125000" defaultValue={latestMileage || (deadline.originalTask.nextDueMileage ? deadline.originalTask.nextDueMileage - 10000 : undefined)} />
              </div>
            )}

            {/* Pack Vidange : cases à cocher (Option 1) */}
            {canonicalTask === 'vidange' && (
              <div className="space-y-2.5 p-3 rounded-lg bg-muted/40 border">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-foreground">
                    Pack d'entretien réalisé cette fois-ci :
                  </Label>
                  <span className="text-[10px] text-muted-foreground font-normal">Cochez les éléments remplacés</span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {getStandardVidangeItems(vehicle).map((item) => {
                    const isChecked = selectedVidangeItems.includes(item.id);
                    const isRecommended = lastVidangeSummary?.predictions?.some(p => p.id === item.id && p.status === 'recommended');
                    return (
                      <div
                        key={item.id}
                        onClick={() => {
                          setSelectedVidangeItems(prev =>
                            prev.includes(item.id)
                              ? prev.filter(x => x !== item.id)
                              : [...prev, item.id]
                          );
                        }}
                        className={cn(
                          "flex items-center justify-between p-2 rounded-md border text-xs cursor-pointer transition-colors select-none",
                          isChecked
                            ? "bg-primary/5 border-primary/40 text-foreground font-medium"
                            : "bg-background/60 border-border/60 text-muted-foreground hover:bg-muted/60"
                        )}
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          <Checkbox
                            id={`vidange-item-${item.id}`}
                            checked={isChecked}
                            onCheckedChange={(checked) => {
                              setSelectedVidangeItems(prev =>
                                checked
                                  ? (prev.includes(item.id) ? prev : [...prev, item.id])
                                  : prev.filter(x => x !== item.id)
                              );
                            }}
                            className="h-4 w-4 shrink-0"
                          />
                          <span className="leading-tight truncate">{item.label}</span>
                        </div>
                        {isRecommended && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-500/50 text-amber-700 dark:text-amber-300 bg-amber-500/10 shrink-0">
                            Conseillé
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground italic">
                  Option 1 (Pack Vidange) : Indiquez ci-dessous le montant total global (huile + filtres cochés + main-d'œuvre).
                </p>
              </div>
            )}

            {needsCost && (
              <div className="space-y-2">
                <Label htmlFor="cost">
                  {canonicalTask === 'vidange' ? "Coût total du pack vidange (TND)" : "Coût de l'entretien (TND)"}
                </Label>
                <Input
                  id="cost"
                  name="cost"
                  type="number"
                  step="0.01"
                  placeholder={canonicalTask === 'vidange' ? "Ex: 180.000" : (deadline.name === 'Paiement Assurance' ? "Coût de l'assurance" : "0")}
                />
              </div>
            )}
            {!needsCost && !needsMileage && (
              <p className="text-sm text-muted-foreground">
                Un nouvel enregistrement sera créé à la date d'aujourd'hui pour confirmer cette action. Le dernier kilométrage connu ({latestMileage.toLocaleString('fr-FR')} km) sera utilisé.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Annuler</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Confirmer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}












