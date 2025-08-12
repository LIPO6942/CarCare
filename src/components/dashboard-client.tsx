
'use client';

import { useState, useEffect, useCallback, useMemo, type ComponentType } from 'react';
import type { Vehicle, Repair, Maintenance, FuelLog } from '@/lib/types';
import { AppLayout } from '@/components/app-layout';
import { DashboardHeader } from '@/components/dashboard-header';
import { AddVehicleSheet } from '@/components/add-vehicle-sheet';
import { Button } from '@/components/ui/button';
import { PlusCircle, Car, Wrench, Bell, Fuel, AlertTriangle } from 'lucide-react';
import { format } from "date-fns"
import { fr } from "date-fns/locale"
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RepairSummaryChart } from '@/components/repair-summary-chart';
import { VehicleCard } from '@/components/vehicle-card';
import { getVehicles, getAllUserRepairs, getAllUserMaintenance, getAllUserFuelLogs } from '@/lib/data';
import { useAuth } from '@/context/auth-context';
import { Skeleton } from './ui/skeleton';
import { cn } from '@/lib/utils';
import { VehicleDetailModal } from './vehicle-detail-modal';
import { AddInitialMaintenanceForm } from './add-initial-maintenance-form';
import { QuickFuelLogForm } from './quick-fuel-log-form';


function StatCard({ title, value, icon: Icon, description, onClick, disabled, isLoading, isUrgent }: { title: string, value: string | number, icon: ComponentType<{ className?: string }>, description?: string, onClick?: () => void, disabled?: boolean, isLoading?: boolean, isUrgent?: boolean }) {
  const isClickable = !!onClick && !disabled;
  
  if (isLoading) {
    return <Skeleton className="h-32" />;
  }

  const IconToRender = isUrgent ? AlertTriangle : Icon;
  
  const cardContent = (
      <Card className={cn("h-full flex flex-col", isUrgent && "bg-destructive/10 border-destructive text-destructive")}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <IconToRender className={cn("h-4 w-4 text-muted-foreground", isUrgent && "text-destructive")} />
        </CardHeader>
        <CardContent className="flex-1 flex flex-col justify-center">
          <div className="text-2xl font-bold">{value}</div>
          {description && <p className="text-sm text-foreground/90 pt-1">{description}</p>}
        </CardContent>
      </Card>
  );

  if (isClickable) {
    return (
        <button onClick={onClick} disabled={disabled} className={cn("text-left w-full h-full", isClickable && "transition-all hover:shadow-md hover:-translate-y-1", disabled && "opacity-50 cursor-not-allowed")}>
            {cardContent}
        </button>
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
  } = useMemo(() => {
    const totalRepairCost = repairs.reduce((sum, r) => sum + r.cost, 0);
    const totalFuelCost = fuelLogs.reduce((sum, f) => sum + f.totalCost, 0);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const allEvents = [
        ...repairs.map(item => ({...item, eventDate: new Date(item.date)})),
        ...maintenance.map(item => ({...item, eventDate: new Date(item.date)})),
        ...fuelLogs.map(item => ({...item, eventDate: new Date(item.date)}))
    ].filter(e => e.mileage > 0 && e.date && !isNaN(new Date(e.date).getTime()));
    
    // 1. Get explicitly scheduled deadlines by date
    const dateBasedDeadlines = maintenance
      .filter(m => m.nextDueDate && new Date(m.nextDueDate) >= today)
      .map(m => ({
        type: 'date' as const,
        name: m.task,
        date: new Date(m.nextDueDate!),
        cost: m.cost,
        vehicleId: m.vehicleId,
        sortValue: new Date(m.nextDueDate!).getTime()
      }));

    // 2. Get mileage-based deadlines (Vidange)
    const mileageBasedDeadlines = vehicles.map(vehicle => {
      const latestVehicleEvent = allEvents
        .filter(e => e.vehicleId === vehicle.id)
        .sort((a,b) => b.eventDate.getTime() - a.eventDate.getTime())[0];
        
      if (!latestVehicleEvent) return null;

      const lastOilChange = maintenance
        .filter(m => m.vehicleId === vehicle.id && m.task === 'Vidange' && m.nextDueMileage && m.nextDueMileage > latestVehicleEvent.mileage)
        .sort((a, b) => b.nextDueMileage! - a.nextDueMileage!)[0]; // Get the one with highest nextDueMileage (latest)
        
      if (!lastOilChange) return null;
      
      const kmRemaining = lastOilChange.nextDueMileage! - latestVehicleEvent.mileage;
      
      // Use average daily mileage to estimate a due date for sorting purposes
      const vehicleEvents = allEvents.filter(e => e.vehicleId === vehicle.id).sort((a, b) => a.eventDate.getTime() - b.eventDate.getTime());
      let estimatedDate = new Date();
      estimatedDate.setDate(estimatedDate.getDate() + 999); // Default to far future if no estimate possible
      
      if(vehicleEvents.length > 1) {
        const firstEvent = vehicleEvents[0];
        const lastEvent = vehicleEvents[vehicleEvents.length - 1];
        const totalMiles = lastEvent.mileage - firstEvent.mileage;
        const totalDays = (lastEvent.eventDate.getTime() - firstEvent.eventDate.getTime()) / (1000 * 60 * 60 * 24);
        if(totalMiles > 0 && totalDays > 0){
           const avgDailyMileage = totalMiles / totalDays;
           const daysToNextChange = Math.ceil(kmRemaining / avgDailyMileage);
           estimatedDate = new Date(lastEvent.eventDate);
           estimatedDate.setDate(estimatedDate.getDate() + daysToNextChange);
        }
      }

      return {
        type: 'mileage' as const,
        name: `${lastOilChange.task}`,
        kmRemaining,
        date: estimatedDate, // For sorting only
        vehicleId: vehicle.id,
        sortValue: estimatedDate.getTime(),
      }
    }).filter((item): item is NonNullable<typeof item> => item !== null);


    // 3. Combine and sort all deadlines
    const upcomingDeadlines = [
        ...dateBasedDeadlines,
        ...mileageBasedDeadlines
    ]
    .sort((a, b) => a.sortValue - b.sortValue);

    const nextDeadline = upcomingDeadlines[0] || null;
    const secondNextDeadline = upcomingDeadlines[1] || null;
    
    const checkUrgency = (deadline: typeof nextDeadline) => {
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
    }
  }, [vehicles, repairs, maintenance, fuelLogs]);

  const fuelConsumptions = useMemo(() => {
    const consumptions = new Map<string, number | null>();

    vehicles.forEach(vehicle => {
        // 1. Get fuel logs for this specific vehicle and sort by mileage
        const vehicleFuelLogs = fuelLogs
            .filter(log => log.vehicleId === vehicle.id && log.mileage > 0)
            .sort((a, b) => a.mileage - b.mileage);

        // 2. Need at least two logs to calculate consumption
        if (vehicleFuelLogs.length < 2) {
            consumptions.set(vehicle.id, null);
            return;
        }

        const firstLog = vehicleFuelLogs[0];
        const lastLog = vehicleFuelLogs[vehicleFuelLogs.length - 1];

        // 3. Calculate total distance covered between the first and last log
        const totalDistance = lastLog.mileage - firstLog.mileage;

        // 4. Sum up all fuel quantities *except* for the last one (as it's not yet consumed)
        let totalFuel = 0;
        for (let i = 0; i < vehicleFuelLogs.length - 1; i++) {
            totalFuel += vehicleFuelLogs[i].quantity;
        }

        // 5. Calculate and store consumption if data is valid
        if (totalDistance > 0 && totalFuel > 0) {
            const consumption = (totalFuel / totalDistance) * 100; // L/100km
            consumptions.set(vehicle.id, consumption);
        } else {
            consumptions.set(vehicle.id, null);
        }
    });

    return consumptions;
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
                <Skeleton className="h-80" />
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
  
  const getNextDeadlineValue = (deadline: typeof nextDeadline) => {
    if (!deadline) return "Aucune";
    if (deadline.type === 'date') return format(deadline.date, 'd MMM yyyy', { locale: fr });
    return `~ ${deadline.kmRemaining.toLocaleString('fr-FR')} km`;
  }
  
  const getNextDeadlineDescription = (deadline: typeof nextDeadline) => {
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
            {vehicles.length > 0 && (
                <QuickFuelLogForm vehicles={vehicles} onFuelLogAdded={fetchData} />
            )}

           <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <StatCard
                title={nextDeadline ? (isDeadlineUrgent ? "Échéance Proche !" : "Prochaine Échéance") : "Prochaine Échéance"}
                value={getNextDeadlineValue(nextDeadline)}
                icon={Bell}
                description={getNextDeadlineDescription(nextDeadline)}
                onClick={() => setVehicleForDetailView(getVehicleForStat(nextDeadline?.vehicleId) || null)}
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
                    {vehicles.map((vehicle) => (
                      <VehicleCard 
                        key={vehicle.id} 
                        vehicle={vehicle} 
                        onShowDetails={() => setVehicleForDetailView(vehicle)}
                        onDeleted={fetchData}
                        fuelConsumption={fuelConsumptions.get(vehicle.id)}
                       />
                    ))}
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

            <RepairSummaryChart repairs={repairs} totalCost={totalRepairCost} />
        </main>
      </AppLayout>

      <VehicleDetailModal 
        vehicle={vehicleForDetailView}
        open={!!vehicleForDetailView}
        onOpenChange={(isOpen) => !isOpen && setVehicleForDetailView(null)}
        onDataChange={fetchData}
      />
      
      <AddInitialMaintenanceForm
        vehicle={vehicleForInitialMaintenance}
        open={!!vehicleForInitialMaintenance}
        onOpenChange={(isOpen) => !isOpen && setVehicleForInitialMaintenance(null)}
        onFinished={handleInitialMaintenanceFinished}
      />
    </>
  );
}
