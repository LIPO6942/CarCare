
'use client';

import { useState, useEffect, useCallback, useMemo, type ComponentType } from 'react';
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
import { VehicleDetailDialog } from '@/components/vehicle-detail-dialog';
import { getVehicles, getAllUserRepairs, getAllUserMaintenance, getAllUserFuelLogs } from '@/lib/data';
import { useAuth } from '@/context/auth-context';
import { Skeleton } from './ui/skeleton';
import { cn } from '@/lib/utils';


function StatCard({ title, value, icon: Icon, description, onClick, disabled }: { title: string, value: string | number, icon: ComponentType<{ className?: string }>, description?: string, onClick?: () => void, disabled?: boolean }) {
  const isClickable = !!onClick && !disabled;
  return (
    <button
      onClick={onClick}
      disabled={!isClickable}
      className={cn(
        "text-left w-full",
        isClickable && "transition-all hover:shadow-md hover:-translate-y-1"
      )}
    >
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
    </button>
  );
}

export function DashboardClient() {
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [maintenance, setMaintenance] = useState<Maintenance[]>([]);
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [initialTab, setInitialTab] = useState('history');

  const fetchData = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const [vehiclesData, repairsData, maintenanceData, fuelLogsData] = await Promise.all([
      getVehicles(user.uid),
      getAllUserRepairs(user.uid),
      getAllUserMaintenance(user.uid),
      getAllUserFuelLogs(user.uid),
    ]);
    setVehicles(vehiclesData);
    setRepairs(repairsData);
    setMaintenance(maintenanceData);
    setFuelLogs(fuelLogsData);
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    if (user) {
        fetchData();
    }
  }, [user, fetchData]);


  const handleOpenDetails = (vehicle: Vehicle, tab: string = 'history') => {
    setSelectedVehicle(vehicle);
    setInitialTab(tab);
    setIsDetailOpen(true);
  };

  const totalVehicles = vehicles.length;
  const totalRepairCost = repairs.reduce((sum, r) => sum + r.cost, 0);
  const totalFuelCost = fuelLogs.reduce((sum, f) => sum + f.totalCost, 0);
  
  const upcomingDeadlines = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deadlineTasks = ["Vidange", "Visite technique", "Assurance"];

    return maintenance
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
  }, [maintenance]);

  const nextDeadline = upcomingDeadlines[0];

  if (isLoading) {
    return (
        <AppLayout>
            <DashboardHeader title="Tableau de Bord" description="Chargement de vos données..." />
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
              />
              <StatCard
                title="Coût des Réparations"
                value={`${totalRepairCost.toLocaleString('fr-FR', { style: 'currency', currency: 'TND' })}`}
                icon={Wrench}
                description="Voir l'historique des réparations"
                onClick={() => vehicles.length > 0 && handleOpenDetails(vehicles[0], 'repairs')}
                disabled={vehicles.length === 0}
              />
              <StatCard
                title="Coût du Carburant"
                value={`${totalFuelCost.toLocaleString('fr-FR', { style: 'currency', currency: 'TND' })}`}
                icon={Fuel}
                description="Voir l'historique des pleins"
                onClick={() => vehicles.length > 0 && handleOpenDetails(vehicles[0], 'fuel')}
                disabled={vehicles.length === 0}
              />
              <StatCard
                title={nextDeadline ? nextDeadline.name : "Échéances à Venir"}
                value={nextDeadline ? format(nextDeadline.date, 'd MMM yyyy', { locale: fr }) : "Aucune"}
                icon={Bell}
                description={nextDeadline ? "Voir l'échéance" : "Aucune échéance à venir"}
                onClick={() => {
                  if (nextDeadline) {
                    const vehicleForDeadline = vehicles.find(v => v.id === nextDeadline.vehicleId);
                    if (vehicleForDeadline) {
                        handleOpenDetails(vehicleForDeadline, 'maintenance');
                    }
                  }
                }}
                disabled={!nextDeadline}
              />
            </div>

            <RepairSummaryChart repairs={repairs} />

            <div className="space-y-4">
                <h2 className="text-2xl font-bold tracking-tight">Mes Véhicules</h2>
                {vehicles.length > 0 ? (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {vehicles.map((vehicle) => (
                    <VehicleCard key={vehicle.id} vehicle={vehicle} onOpenDetails={() => handleOpenDetails(vehicle)} />
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
      {selectedVehicle && <VehicleDetailDialog vehicle={selectedVehicle} open={isDetailOpen} onOpenChange={setIsDetailOpen} onDataChange={fetchData} initialTab={initialTab} />}
    </>
  );
}
