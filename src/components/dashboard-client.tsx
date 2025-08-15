
'use client';

import { useState, useEffect, useCallback, useMemo, type ComponentType, type FormEvent, useRef } from 'react';
import type { Vehicle, Repair, Maintenance, FuelLog } from '@/lib/types';
import { AppLayout } from '@/components/app-layout';
import { DashboardHeader } from '@/components/dashboard-header';
import { AddVehicleSheet } from '@/components/add-vehicle-sheet';
import { Button } from '@/components/ui/button';
import { PlusCircle, Car, Wrench, Bell, Fuel, AlertTriangle, CheckCircle2 } from 'lucide-react';
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
    
    const dateBasedDeadlines: Deadline[] = maintenance
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
        .sort((a,b) => b.eventDate.getTime() - a.eventDate.getTime())[0];
        
      if (!latestVehicleEvent) return null;

      const lastOilChange = maintenance
        .filter(m => m.vehicleId === vehicle.id && m.task === 'Vidange' && m.nextDueMileage && m.nextDueMileage > 0)
        .sort((a, b) => b.mileage! - a.mileage!)[0]; 
        
      if (!lastOilChange) return null;
      
      const kmRemaining = lastOilChange.nextDueMileage! - latestVehicleEvent.mileage;
      
      let estimatedDate = new Date();
      if (kmRemaining > 0) {
          const vehicleEvents = allEvents.filter(e => e.vehicleId === vehicle.id).sort((a, b) => a.eventDate.getTime() - b.eventDate.getTime());
          estimatedDate.setDate(estimatedDate.getDate() + 999);
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
    }).filter((item): item is Deadline => item !== null);


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
    }
  }, [vehicles, repairs, maintenance, fuelLogs]);

  const fuelConsumptions = useMemo(() => {
    const consumptions = new Map<string, number | null>();

    vehicles.forEach(vehicle => {
        const vehicleFuelLogs = fuelLogs
            .filter(log => log.vehicleId === vehicle.id && log.mileage > 0)
            .sort((a, b) => a.mileage - b.mileage);

        if (vehicleFuelLogs.length < 2) {
            consumptions.set(vehicle.id, null);
            return;
        }

        const firstLog = vehicleFuelLogs[0];
        const lastLog = vehicleFuelLogs[vehicleFuelLogs.length - 1];

        const totalDistance = lastLog.mileage - firstLog.mileage;

        let totalFuel = 0;
        for (let i = 0; i < vehicleFuelLogs.length - 1; i++) {
            totalFuel += vehicleFuelLogs[i].quantity;
        }

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
            {vehicles.length > 0 && (
                <QuickFuelLogForm vehicles={vehicles} onFuelLogAdded={() => fetchData(false)} />
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
                    {vehicles.map((vehicle) => (
                      <VehicleCard 
                        key={vehicle.id} 
                        vehicle={vehicle} 
                        onShowDetails={() => setVehicleForDetailView(vehicle)}
                        onDeleted={() => fetchData(true)}
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


function CompleteDeadlineDialog({ deadline, open, onOpenChange, onComplete, vehicles }: { deadline: Deadline | null, open: boolean, onOpenChange: (open: boolean) => void, onComplete: () => void, vehicles: Vehicle[] }) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const formRef = useRef<HTMLFormElement>(null);

    const vehicle = useMemo(() => vehicles.find(v => v.id === deadline?.vehicleId), [vehicles, deadline]);

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
        const mileage = parseInt(formData.get('mileage') as string || '0', 10);

        try {
            const today = new Date();
            const newMaintenance: Omit<Maintenance, 'id' | 'userId'> = {
                vehicleId: vehicle.id,
                task: deadline.name,
                date: today.toISOString().split('T')[0],
                cost: 0,
                mileage: 0,
            };

            if (needsCost) newMaintenance.cost = cost;
            if (needsMileage) {
                if (!mileage || mileage <= 0) {
                    toast({ title: "Erreur", description: "Le kilométrage est requis pour une vidange.", variant: "destructive" });
                    setIsSubmitting(false);
                    return;
                }
                newMaintenance.mileage = mileage;
            } else {
                 newMaintenance.mileage = deadline.originalTask.mileage;
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

            if (deadline.name === 'Vidange') {
                newMaintenance.nextDueMileage = mileage + 10000;
            } else if (deadline.originalTask.nextDueDate) {
                const oldDueDate = new Date(deadline.originalTask.nextDueDate);
                const nextDueDate = new Date(oldDueDate);

                if (deadline.name === 'Visite technique' || deadline.name === 'Vignette') {
                    nextDueDate.setFullYear(oldDueDate.getFullYear() + 1);
                } else if (deadline.name === 'Paiement Assurance') {
                     const oldDate = new Date(deadline.originalTask.date);
                     const monthDiff = (oldDueDate.getFullYear() - oldDate.getFullYear()) * 12 + (oldDueDate.getMonth() - oldDate.getMonth());
                     const isAnnual = monthDiff > 8;
                     nextDueDate.setMonth(oldDueDate.getMonth() + (isAnnual ? 12 : 6));
                }
                newMaintenance.nextDueDate = nextDueDate.toISOString().split('T')[0];
            }
            
            await updateMaintenance(deadline.originalTask.id, { nextDueDate: null, nextDueMileage: null });

            await addMaintenance(newMaintenance, user.uid);
            
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
                        <br/>
                        <span className="font-semibold text-foreground">{deadline.name}</span>
                    </DialogDescription>
                </DialogHeader>
                <form ref={formRef} onSubmit={handleSubmit}>
                    <div className="space-y-4 py-4">
                        {needsMileage && (
                            <div className="space-y-2">
                                <Label htmlFor="mileage">Kilométrage actuel</Label>
                                <Input id="mileage" name="mileage" type="number" required placeholder="ex: 125000" />
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
                                Un nouvel enregistrement sera créé à la date d'aujourd'hui pour confirmer cette action.
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
    

    

