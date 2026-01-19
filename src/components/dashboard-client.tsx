
'use client';

import { useState, useEffect, useCallback, useMemo, type ComponentType, type FormEvent, useRef } from 'react';
import type { Vehicle, Repair, Maintenance, FuelLog } from '@/lib/types';
import { AppLayout } from '@/components/app-layout';
import { DashboardHeader } from '@/components/dashboard-header';
import { AddVehicleSheet } from '@/components/add-vehicle-sheet';
import { Button } from '@/components/ui/button';
import { PlusCircle, Car, Wrench, Bell, Fuel, AlertTriangle, CheckCircle2, Gauge } from 'lucide-react';
import { format } from "date-fns"
import { fr } from "date-fns/locale"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { VehicleCard } from '@/components/vehicle-card';
import { getVehicles, getAllUserRepairs, getAllUserMaintenance, getAllUserFuelLogs, addMaintenance, updateMaintenance } from '@/lib/data';
import { useAuth } from '@/context/auth-context';
import { Skeleton } from './ui/skeleton';
import { cn } from '@/lib/utils';
import { VehicleDetailModal } from './vehicle-detail-modal';
import { AddInitialMaintenanceForm } from './add-initial-maintenance-form';
import { QuickFuelLogForm } from './quick-fuel-log-form';
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogDescription, DialogFooter } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { getSettings } from '@/lib/settings';

type Deadline = {
  type: 'date' | 'mileage';
  name: string;
  vehicleId: string;
  sortValue: number;
  originalTask: Maintenance;
} & ({ type: 'date'; date: Date } | { type: 'mileage'; kmRemaining: number });


function StatCard({ title, value, icon: Icon, description, onClick, disabled, isLoading, isUrgent, onComplete }: { title: string, value: string | number, icon: ComponentType<{ className?: string }>, description?: string, onClick?: () => void, disabled?: boolean, isLoading?: boolean, isUrgent?: boolean, onComplete?: () => void }) {
  const isClickable = !!onClick && !disabled;

  if (isLoading) {
    return <Skeleton className="h-32" />;
  }

  let IconToRender = Icon;
  let cardClasses = "h-full flex flex-col";

  if (isUrgent) {
    IconToRender = AlertTriangle;
    cardClasses = cn(cardClasses, "bg-destructive/10 border-destructive text-destructive");
  }

  const cardContent = (
    <Card className={cardClasses}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <IconToRender className={cn("h-4 w-4 text-muted-foreground", isUrgent && "text-destructive")} />
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-center">
        <div className="text-2xl font-bold">{value}</div>
        {description && <p className="text-sm text-current/90 pt-1">{description}</p>}
      </CardContent>
      {onComplete && !disabled && (
        <CardFooter className="p-2 border-t -mx-0 -mb-0 mt-auto bg-background/20 dark:bg-card/30">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
            onClick={(e) => { e.stopPropagation(); onComplete(); }}
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Échéance réglée
          </Button>
        </CardFooter>
      )}
    </Card>
  );

  if (isClickable) {
    return (
      <div
        onClick={() => !disabled && onClick ? onClick() : undefined}
        className={cn("text-left w-full h-full", isClickable && "cursor-pointer transition-all hover:shadow-md hover:-translate-y-1", disabled && "opacity-50 cursor-not-allowed")}
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
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [maintenance, setMaintenance] = useState<Maintenance[]>([]);
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [isVehiclesLoading, setIsVehiclesLoading] = useState(true);
  const [isStatsLoading, setIsStatsLoading] = useState(true);

  const [vehicleForDetailView, setVehicleForDetailView] = useState<Vehicle | null>(null);
  const [vehicleForInitialMaintenance, setVehicleForInitialMaintenance] = useState<Vehicle | null>(null);

  const [deadlineToComplete, setDeadlineToComplete] = useState<Deadline | null>(null);

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

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user, fetchData]);

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
    nextDeadline,
    secondNextDeadline,
    isDeadlineUrgent,
    isSecondDeadlineUrgent,
    allEvents
  } = useMemo(() => {
    const totalRepairCost = repairs.reduce((sum, r) => sum + r.cost, 0);
    const totalFuelCost = fuelLogs.reduce((sum, f) => sum + f.totalCost, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const allEvents = [
      ...repairs.map(item => ({ ...item, eventDate: new Date(item.date) })),
      ...maintenance.map(item => ({ ...item, eventDate: new Date(item.date) })),
      ...fuelLogs.map(item => ({ ...item, eventDate: new Date(item.date) }))
    ].filter(e => e.mileage > 0 && e.date && !isNaN(new Date(e.date).getTime()));

    // Group maintenance tasks by type and vehicle to find the most recent one.
    const latestTasksMap = new Map<string, Maintenance>();
    maintenance.forEach(task => {
      const key = `${task.vehicleId}-${task.task}`;
      const existingTask = latestTasksMap.get(key);
      if (!existingTask || new Date(task.date) > new Date(existingTask.date)) {
        latestTasksMap.set(key, task);
      }
    });

    const latestTasks = Array.from(latestTasksMap.values());

    const dateBasedDeadlines: Deadline[] = latestTasks
      .filter(m => m.nextDueDate)
      .map(m => ({
        type: 'date' as const,
        name: m.task,
        date: new Date(m.nextDueDate!),
        cost: m.cost,
        vehicleId: m.vehicleId,
        sortValue: new Date(m.nextDueDate!).getTime(),
        originalTask: m,
      }));

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
      .filter(deadline => {
        if (deadline.type === 'date') {
          return deadline.date >= today;
        }
        return true;
      })
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
      nextDeadline,
      secondNextDeadline,
      isDeadlineUrgent: checkUrgency(nextDeadline),
      isSecondDeadlineUrgent: checkUrgency(secondNextDeadline),
      allEvents
    }
  }, [vehicles, repairs, maintenance, fuelLogs]);

  const fuelStats = useMemo(() => {
    const stats = new Map<string, {
      consumption: number;
      latestConsumption: number;
      cost: number;
      lastLogQuantity: number;
      lastLogTotalCost: number;
      kmPerDay: number;
      averageSpeed: number | null | undefined;
      drivingStyle: string;
      daysUntilEmpty?: number;
      remainingRangeKm?: number;
    } | null>();

    vehicles.forEach(vehicle => {
      const vehicleFuelLogs = fuelLogs
        .filter(log => log.vehicleId === vehicle.id && log.mileage > 0)
        .sort((a, b) => a.mileage - b.mileage);

      if (vehicleFuelLogs.length < 2) {
        stats.set(vehicle.id, null);
        return;
      }

      // Step A: Estimate Tank Capacity
      const capacityEstimates: number[] = [];
      vehicleFuelLogs.forEach(log => {
        if (log.gaugeLevelBefore !== undefined && log.gaugeLevelBefore < 1) {
          const estimate = log.quantity / (1 - log.gaugeLevelBefore);
          if (estimate > 0 && estimate < 200) { // Sanity check: tank < 200L
            capacityEstimates.push(estimate);
          }
        }
      });

      let estimatedCapacity = 0;
      if (capacityEstimates.length > 0) {
        // Use median for robustness
        capacityEstimates.sort((a, b) => a - b);
        const mid = Math.floor(capacityEstimates.length / 2);
        estimatedCapacity = capacityEstimates.length % 2 === 0
          ? (capacityEstimates[mid - 1] + capacityEstimates[mid]) / 2
          : capacityEstimates[mid];
      }

      // 1. Lifetime Average Consumption (L/100km)
      const firstLog = vehicleFuelLogs[0];
      const lastLog = vehicleFuelLogs[vehicleFuelLogs.length - 1];
      const totalDistance = lastLog.mileage - firstLog.mileage;

      let totalFuel = 0;
      for (let i = 0; i < vehicleFuelLogs.length - 1; i++) {
        totalFuel += vehicleFuelLogs[i].quantity;
      }

      let averageConsumption = 0;
      if (totalDistance > 0 && totalFuel > 0) {
        averageConsumption = (totalFuel / totalDistance) * 100;
      }

      // 2. Latest Interval Stats (Gauge-Based if capacity known)
      const previousLog = vehicleFuelLogs[vehicleFuelLogs.length - 2];
      const lastIntervalDistance = lastLog.mileage - previousLog.mileage;
      let latestCost = 0;
      let latestConsumption = 0;

      if (lastIntervalDistance > 0) {
        if (estimatedCapacity > 0 && previousLog.gaugeLevelBefore !== undefined && lastLog.gaugeLevelBefore !== undefined) {
          // Step B: Use Delta V formula
          const deltaV = previousLog.quantity + (estimatedCapacity * previousLog.gaugeLevelBefore) - (estimatedCapacity * lastLog.gaugeLevelBefore);
          latestConsumption = (deltaV / lastIntervalDistance) * 100;
        } else {
          // Fallback to old method if gauge data missing
          latestConsumption = (previousLog.quantity / lastIntervalDistance) * 100;
        }

        latestCost = (latestConsumption * lastLog.pricePerLiter);
      }

      if (averageConsumption > 0 || latestCost > 0 || latestConsumption > 0) {
        // Estimate Average Speed based on consumption if not provided
        let estimatedSpeed = lastLog.averageSpeed;
        let drivingStyle = 'Mixte';
        let kmPerDay = 0;

        const timeDiff = new Date(lastLog.date).getTime() - new Date(previousLog.date).getTime();
        const daysDiff = Math.max(1, Math.ceil(timeDiff / (1000 * 60 * 60 * 24)));
        if (lastIntervalDistance > 0) {
          kmPerDay = lastIntervalDistance / daysDiff;
        }

        if (kmPerDay < 30) {
          drivingStyle = 'Urbain';
        } else if (kmPerDay >= 60 && kmPerDay < 90) {
          drivingStyle = 'Semi-Sport';
        } else if (kmPerDay >= 90) {
          drivingStyle = 'Sport/Route';
        }

        if (!estimatedSpeed && latestConsumption > 0) {
          // Creative approach: Calculate a 'Traffic Stress Factor'
          const baseline = averageConsumption > 0 ? averageConsumption : (vehicle.fuelType === 'Diesel' ? 5.5 : 7.5);
          const stressFactor = latestConsumption / baseline;

          let intensityAdjustment = 0;
          if (kmPerDay < 30) {
            intensityAdjustment = -5;
          } else if (kmPerDay >= 60 && kmPerDay < 90) {
            intensityAdjustment = 15;
          } else if (kmPerDay >= 90) {
            intensityAdjustment = 35;
          }

          if (stressFactor >= 1) {
            estimatedSpeed = (45 / Math.pow(stressFactor, 1.8)) + intensityAdjustment;
            if (estimatedSpeed < 8) estimatedSpeed = 8;
          } else {
            estimatedSpeed = 45 + (1 - stressFactor) * 110 + intensityAdjustment;
            if (estimatedSpeed > 135) estimatedSpeed = 135;
          }
        }

        // --- SMART RANGE PREDICTOR ---
        let daysUntilEmpty = undefined;
        let remainingRangeKm = undefined;

        if (estimatedCapacity > 0 && latestConsumption > 0 && kmPerDay > 0) {
          // Fuel level after last refill
          const initialFuelAfterLog = (estimatedCapacity * lastLog.gaugeLevelBefore) + lastLog.quantity;
          const cappedFuel = Math.min(initialFuelAfterLog, estimatedCapacity);

          // Estimation of fuel consumed since last log based on average daily mileage
          const now = new Date();
          const lastLogDate = new Date(lastLog.date);
          const totalHoursPassed = Math.max(0, (now.getTime() - lastLogDate.getTime()) / (1000 * 60 * 60));
          const daysPassed = totalHoursPassed / 24;

          const estimatedDistanceDrivenSinceLog = daysPassed * kmPerDay;
          const fuelConsumedSinceLog = (estimatedDistanceDrivenSinceLog * latestConsumption) / 100;

          const currentFuelInTank = Math.max(0, cappedFuel - fuelConsumedSinceLog);

          remainingRangeKm = (currentFuelInTank / latestConsumption) * 100;
          daysUntilEmpty = remainingRangeKm / kmPerDay;
        }

        stats.set(vehicle.id, {
          consumption: averageConsumption,
          latestConsumption,
          cost: latestCost,
          lastLogQuantity: lastLog.quantity,
          lastLogTotalCost: lastLog.totalCost,
          kmPerDay,
          averageSpeed: estimatedSpeed,
          drivingStyle,
          daysUntilEmpty,
          remainingRangeKm
        });
      } else {
        stats.set(vehicle.id, null);
      }
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

  if (isVehiclesLoading) {
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
    return `${deadline.name} (${vehicle?.licensePlate || 'N/A'})`;
  }


  return (
    <>
      <AppLayout>
        <DashboardHeader
          title="Tableau de Bord"
          description="Vue d'ensemble de votre flotte de véhicules."
          showLogo={true}
        >
          <AddVehicleSheet onVehicleAdded={handleVehicleAdded}>
            <Button>
              <PlusCircle className="mr-2" />
              Ajouter un véhicule
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
                <div key={vehicle.id} className={`mb-3 py-2 px-3 rounded-md border flex items-center justify-between transition-all duration-500 shadow-sm ${daysUntilEmpty != null && daysUntilEmpty < 3
                  ? 'bg-red-500/10 border-red-500/30 animate-pulse'
                  : 'bg-card border-emerald-500/20'}`}>
                  <div className="flex items-center gap-2">
                    <div className={`p-1 rounded-full ${daysUntilEmpty != null && daysUntilEmpty < 3 ? 'bg-red-500/20' : 'bg-emerald-500/20'}`}>
                      <Gauge className={`h-3.5 w-3.5 ${daysUntilEmpty != null && daysUntilEmpty < 3 ? 'text-red-500' : 'text-emerald-500'}`} />
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-foreground">{vehicle.brand} {vehicle.model}</span>
                        <span className="text-[9px] uppercase tracking-widest text-muted-foreground/80 font-medium">Smart Autonomie</span>
                      </div>
                      <span className={`text-base font-bold leading-tight ${daysUntilEmpty != null && daysUntilEmpty < 3 ? 'text-red-500' : 'text-emerald-500'}`}>
                        ≈ {Math.round(remainingRangeKm)} km
                      </span>
                    </div>
                  </div>
                  {daysUntilEmpty != null && (
                    <div className="text-right">
                      <span className={`text-[10px] block font-semibold ${daysUntilEmpty < 3 ? 'text-red-500' : 'text-emerald-500'}`}>
                        {daysUntilEmpty < 1 ? "PLEIN URGENT !" :
                          daysUntilEmpty < 2 ? "Aujourd'hui" :
                            `~${Math.ceil(daysUntilEmpty)} jours`}
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
            />
          )}

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title={nextDeadline ? (isDeadlineUrgent ? "Échéance Proche !" : "Prochaine Échéance") : "Prochaine Échéance"}
              value={getNextDeadlineValue(nextDeadline)}
              icon={Bell}
              description={getNextDeadlineDescription(nextDeadline)}
              onClick={() => setVehicleForDetailView(getVehicleForStat(nextDeadline?.vehicleId) || null)}
              onComplete={() => setDeadlineToComplete(nextDeadline)}
              disabled={!nextDeadline}
              isLoading={isStatsLoading}
              isUrgent={isDeadlineUrgent}
            />
            <StatCard
              title={secondNextDeadline ? (isSecondDeadlineUrgent ? "Échéance Suivante" : "Échéance Suivante") : "Échéance Suivante"}
              value={getNextDeadlineValue(secondNextDeadline)}
              icon={Bell}
              description={getNextDeadlineDescription(secondNextDeadline)}
              onClick={() => setVehicleForDetailView(getVehicleForStat(secondNextDeadline?.vehicleId) || null)}
              onComplete={() => setDeadlineToComplete(secondNextDeadline)}
              disabled={!secondNextDeadline}
              isLoading={isStatsLoading}
              isUrgent={isSecondDeadlineUrgent}
            />
            <StatCard
              title="Coût des Réparations"
              value={`${totalRepairCost.toLocaleString('fr-FR', { style: 'currency', currency: 'TND' })}`}
              icon={Wrench}
              description={costCardDescription}
              disabled
              isLoading={isStatsLoading}
            />
            <StatCard
              title="Dépenses Carburant"
              value={`${totalFuelCost.toLocaleString('fr-FR', { style: 'currency', currency: 'TND' })}`}
              icon={Fuel}
              description={costCardDescription}
              disabled
              isLoading={isStatsLoading}
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
                      onShowDetails={() => setVehicleForDetailView(vehicle)}
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
      />

      <AddInitialMaintenanceForm
        vehicle={vehicleForInitialMaintenance}
        open={!!vehicleForInitialMaintenance}
        onOpenChange={(isOpen) => !isOpen && setVehicleForInitialMaintenance(null)}
        onFinished={handleInitialMaintenanceFinished}
      />

      <CompleteDeadlineDialog
        deadline={deadlineToComplete}
        allEvents={allEvents}
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


function CompleteDeadlineDialog({ deadline, open, onOpenChange, onComplete, vehicles, allEvents }: { deadline: Deadline | null, open: boolean, onOpenChange: (open: boolean) => void, onComplete: () => void, vehicles: Vehicle[], allEvents: any[] }) {
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

  const needsCost = useMemo(() => {
    if (!deadline) return false;
    return ['Visite technique', 'Vidange', 'Paiement Assurance', 'Vignette'].includes(deadline.name);
  }, [deadline]);

  const needsMileage = useMemo(() => {
    if (!deadline) return false;
    return deadline.name === 'Vidange';
  }, [deadline]);


  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !deadline || !vehicle) return;

    setIsSubmitting(true);
    const formData = new FormData(event.currentTarget);
    const cost = parseFloat(formData.get('cost') as string || '0');
    const mileageInput = formData.get('mileage') as string;
    const today = new Date().toISOString().split('T')[0];

    try {

      const newMaintenance: Omit<Maintenance, 'id' | 'userId'> = {
        vehicleId: vehicle.id,
        task: deadline.name,
        date: today,
        cost: 0,
        mileage: 0,
      };

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

      if (needsCost && cost === 0 && deadline.name !== 'Paiement Assurance') {
        const settings = getSettings();
        if (deadline.name === 'Vignette' && vehicle.fiscalPower) {
          const vignetteSettings = vehicle.fuelType === 'Diesel' ? settings.vignetteDiesel : settings.vignetteEssence;
          const powerRange = vignetteSettings.find(v => {
            if (v.range.includes('-')) {
              const [min, max] = v.range.split('-').map(Number);
              return vehicle.fiscalPower! >= min && vehicle.fiscalPower! <= max;
            }
            return Number(v.range) === vehicle.fiscalPower!;
          });
          if (powerRange) newMaintenance.cost = powerRange.cost;
        } else if (deadline.name === 'Visite technique') {
          newMaintenance.cost = settings.costVisiteTechnique;
        }
      }

      // Create the new maintenance record for today's action
      const addedMaintenance = await addMaintenance(newMaintenance, user.uid);

      // Now, update the OLD maintenance task to remove its deadline fields
      if (deadline.originalTask.id) {
        await updateMaintenance(deadline.originalTask.id, {
          nextDueDate: undefined,
          nextDueMileage: undefined,
        } as any); // Use 'any' to allow 'undefined' for deletion
      }

      // Finally, create the *next* deadline by updating the record we just added
      const nextMaintenanceData: Partial<Maintenance> = {};

      if (deadline.name === 'Vidange') {
        nextMaintenanceData.nextDueMileage = (addedMaintenance.mileage || 0) + 10000;
      } else if (deadline.originalTask.nextDueDate) {
        const previousDueDate = new Date(deadline.originalTask.nextDueDate);

        if (deadline.name === 'Visite technique' || deadline.name === 'Vignette') {
          previousDueDate.setFullYear(previousDueDate.getFullYear() + 1);
        } else if (deadline.name === 'Paiement Assurance') {
          const oldDueDate = new Date(deadline.originalTask.nextDueDate);
          const oldDate = new Date(deadline.originalTask.date);
          const monthDiff = (oldDueDate.getFullYear() - oldDate.getFullYear()) * 12 + (oldDueDate.getMonth() - oldDate.getMonth());
          const isAnnual = monthDiff > 8;
          previousDueDate.setMonth(previousDueDate.getMonth() + (isAnnual ? 12 : 6));
        }
        nextMaintenanceData.nextDueDate = previousDueDate.toISOString().split('T')[0];
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
      <DialogContent>
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
            {needsMileage && (
              <div className="space-y-2">
                <Label htmlFor="mileage">Kilométrage actuel</Label>
                <Input id="mileage" name="mileage" type="number" required placeholder="ex: 125000" defaultValue={latestMileage || (deadline.originalTask.nextDueMileage ? deadline.originalTask.nextDueMileage - 10000 : undefined)} />
              </div>
            )}
            {needsCost && (
              <div className="space-y-2">
                <Label htmlFor="cost">Coût de l'entretien (TND)</Label>
                <Input id="cost" name="cost" type="number" step="0.01" placeholder={deadline.name === 'Paiement Assurance' ? "Coût de l'assurance" : "0"} />
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












