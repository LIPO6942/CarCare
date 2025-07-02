
'use client';

import { useState, useEffect, useCallback, useMemo, type ComponentType } from 'react';
import { useRouter } from 'next/navigation';
import type { Vehicle, Repair, Maintenance, FuelLog } from '@/lib/types';
import { AppLayout } from '@/components/app-layout';
import { DashboardHeader } from '@/components/dashboard-header';
import { AddVehicleSheet } from '@/components/add-vehicle-sheet';
import { Button } from '@/components/ui/button';
import { PlusCircle, Car, Wrench, Bell, Fuel } from 'lucide-react';
import { format } from "date-fns"
import { fr } from "date-fns/locale"
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RepairSummaryChart } from '@/components/repair-summary-chart';
import { VehicleCard } from '@/components/vehicle-card';
import { getVehicles, getAllUserRepairs, getAllUserMaintenance, getAllUserFuelLogs } from '@/lib/data';
import { useAuth } from '@/context/auth-context';
import { Skeleton } from './ui/skeleton';
import { cn } from '@/lib/utils';
import Link from 'next/link';


function StatCard({ title, value, icon: Icon, description, href, disabled, isLoading }: { title: string, value: string | number, icon: ComponentType<{ className?: string }>, description?: string, href?: string, disabled?: boolean, isLoading?: boolean }) {
  const isClickable = !!href && !disabled;
  
  if (isLoading) {
    return <Skeleton className="h-28" />;
  }
  
  const content = (
      <Card className="h-full">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{value}</div>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </CardContent>
      </Card>
  )

  if (isClickable) {
    return (
        <Link href={href} target="_blank" rel="noopener noreferrer" className={cn("text-left w-full", isClickable && "transition-all hover:shadow-md hover:-translate-y-1")}>
            {content}
        </Link>
    )
  }

  return (
    <div className={cn("text-left w-full", disabled && "opacity-50")}>
       {content}
    </div>
  );
}

export function DashboardClient() {
  const { user } = useAuth();
  const router = useRouter();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [maintenance, setMaintenance] = useState<Maintenance[]>([]);
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [isVehiclesLoading, setIsVehiclesLoading] = useState(true);
  const [isStatsLoading, setIsStatsLoading] = useState(true);
  
  const fetchData = useCallback(async () => {
    if (!user) return;
    setIsVehiclesLoading(true);
    setIsStatsLoading(true);
    
    // Phase 1: Fetch vehicles for a quick initial render
    const vehiclesData = await getVehicles(user.uid);
    setVehicles(vehiclesData);
    setIsVehiclesLoading(false);

    // Phase 2: Fetch all other data for stats
    const [repairsData, maintenanceData, fuelLogsData] = await Promise.all([
      getAllUserRepairs(user.uid),
      getAllUserMaintenance(user.uid),
      getAllUserFuelLogs(user.uid),
    ]);
    setRepairs(repairsData);
    setMaintenance(maintenanceData);
    setFuelLogs(fuelLogsData);
    setIsStatsLoading(false);
  }, [user]);

  useEffect(() => {
    if (user) {
        fetchData();
    }
  }, [user, fetchData]);

  const { totalVehicles, totalRepairCost, totalFuelCost, nextDeadline } = useMemo(() => {
    const totalVehicles = vehicles.length;
    const totalRepairCost = repairs.reduce((sum, r) => sum + r.cost, 0);
    const totalFuelCost = fuelLogs.reduce((sum, f) => sum + f.totalCost, 0);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deadlineTasks = ["Vidange", "Visite technique", "Assurance"];

    const upcomingDeadlines = maintenance
      .filter(m => 
        deadlineTasks.includes(m.task) && 
        m.nextDueDate && 
        new Date(m.nextDueDate) >= today
      )
      .map(m => ({
        name: m.task,
        date: new Date(m.nextDueDate!),
        vehicleId: m.vehicleId
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    return {
        totalVehicles,
        totalRepairCost,
        totalFuelCost,
        nextDeadline: upcomingDeadlines[0],
    }
  }, [vehicles, repairs, maintenance, fuelLogs]);


  if (isVehiclesLoading) {
    return (
        <AppLayout>
            <DashboardHeader title="Tableau de Bord" description="Chargement de vos données..." showLogo={true} />
            <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-8">
                 <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                    <Skeleton className="h-28" />
                    <Skeleton className="h-28" />
                    <Skeleton className="h-28" />
                    <Skeleton className="h-28" />
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

  return (
    <>
      <AppLayout>
        <DashboardHeader
          title="Tableau de Bord"
          description="Vue d'ensemble de votre flotte de véhicules."
          showLogo={true}
        >
          <AddVehicleSheet onVehicleAdded={fetchData}>
            <Button>
              <PlusCircle className="mr-2" />
              Ajouter un véhicule
            </Button>
          </AddVehicleSheet>
        </DashboardHeader>
        <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-8">
           <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <StatCard
                title="Total des Véhicules"
                value={totalVehicles}
                icon={Car}
                description="Nombre de véhicules gérés"
                disabled
                isLoading={isStatsLoading}
              />
              <StatCard
                title="Coût des Réparations"
                value={`${totalRepairCost.toLocaleString('fr-FR', { style: 'currency', currency: 'TND' })}`}
                icon={Wrench}
                description="Voir l'historique des réparations"
                href={vehicles.length > 0 ? `/vehicle/${vehicles[0].id}?tab=repairs` : undefined}
                disabled={vehicles.length === 0}
                isLoading={isStatsLoading}
              />
              <StatCard
                title="Coût du Carburant"
                value={`${totalFuelCost.toLocaleString('fr-FR', { style: 'currency', currency: 'TND' })}`}
                icon={Fuel}
                description="Voir l'historique des pleins"
                href={vehicles.length > 0 ? `/vehicle/${vehicles[0].id}?tab=fuel` : undefined}
                disabled={vehicles.length === 0}
                isLoading={isStatsLoading}
              />
               <StatCard
                title={nextDeadline ? nextDeadline.name : "Échéances à Venir"}
                value={nextDeadline ? format(nextDeadline.date, 'd MMM yyyy', { locale: fr }) : "Aucune"}
                icon={Bell}
                description={nextDeadline ? "Voir l'échéance" : "Aucune échéance à venir"}
                href={(() => {
                    if (!nextDeadline) return undefined;
                    const vehicleForDeadline = vehicles.find(v => v.id === nextDeadline.vehicleId);
                    return vehicleForDeadline ? `/vehicle/${vehicleForDeadline.id}?tab=maintenance` : undefined;
                })()}
                disabled={!nextDeadline}
                isLoading={isStatsLoading}
              />
            </div>

            <RepairSummaryChart repairs={repairs} />

            <div className="space-y-4">
                <h2 className="text-2xl font-bold tracking-tight">Mes Véhicules</h2>
                {vehicles.length > 0 ? (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {vehicles.map((vehicle) => (
                    <VehicleCard key={vehicle.id} vehicle={vehicle} />
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
                    <AddVehicleSheet onVehicleAdded={fetchData}>
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
    </>
  );
}
