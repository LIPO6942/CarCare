'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Vehicle, Repair, Maintenance, FuelLog } from '@/lib/types';
import { getVehicleById, getRepairsForVehicle, getMaintenanceForVehicle, getFuelLogsForVehicle } from '@/lib/data';
import { VehicleTabs } from '@/components/vehicle-tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/auth-context';
import ErrorBoundary from './error-boundary';
import { DashboardHeader } from './dashboard-header';

function VehicleDetailContent({ vehicleId }: { vehicleId: string }) {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'history';

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [maintenance, setMaintenance] = useState<Maintenance[]>([]);
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchVehicleData = useCallback(async () => {
    if (user) {
      setIsLoading(true);
      try {
        const [vehicleData, repairsData, maintenanceData, fuelLogsData] = await Promise.all([
          getVehicleById(vehicleId),
          getRepairsForVehicle(vehicleId, user.uid),
          getMaintenanceForVehicle(vehicleId, user.uid),
          getFuelLogsForVehicle(vehicleId, user.uid),
        ]);
        setVehicle(vehicleData || null);
        setRepairs(repairsData);
        setMaintenance(maintenanceData);
        setFuelLogs(fuelLogsData);
      } catch (error) {
        console.error("Failed to fetch vehicle details due to an error.", error);
        setVehicle(null);
        setRepairs([]);
        setMaintenance([]);
        setFuelLogs([]);
      } finally {
        setIsLoading(false);
      }
    }
  }, [vehicleId, user]);

  useEffect(() => {
    fetchVehicleData();
  }, [fetchVehicleData]);


  if (isLoading) {
    return (
        <>
            <DashboardHeader title="Chargement..." description="Veuillez patienter..." />
            <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-4">
                <Skeleton className="h-52 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-64 w-full" />
            </main>
        </>
    );
  }

  if (!vehicle) {
    return (
      <>
        <DashboardHeader title="Véhicule non trouvé" description="Ce véhicule n'existe pas ou vous n'avez pas la permission de le voir." />
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
            <p>Veuillez vérifier le lien ou retourner à votre tableau de bord.</p>
        </main>
      </>
    )
  }

  return (
    <>
        <DashboardHeader
          title={`${vehicle.brand || 'Marque Inconnue'} ${vehicle.model || 'Modèle Inconnu'}`}
          description={`${vehicle.year || 'N/A'} - ${vehicle.licensePlate || 'N/A'}`}
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
            <ErrorBoundary>
                <div className="grid items-start gap-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="grid gap-6 sm:grid-cols-3">
                            <div className="relative h-60 w-full sm:col-span-1 rounded-lg bg-muted/30 flex items-center justify-center p-4">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                src={vehicle.imageUrl || 'https://placehold.co/600x400.png'}
                                alt={`${vehicle.brand || ''} ${vehicle.model || ''}`}
                                className="h-full w-full object-contain"
                                onError={(e) => { e.currentTarget.src = 'https://placehold.co/200x100.png'; e.currentTarget.onerror = null; }}
                                />
                            </div>
                            <div className="sm:col-span-2">
                                <h2 className="text-2xl font-bold mb-4">Informations Clés</h2>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div><strong className="block text-muted-foreground">Marque</strong> {vehicle.brand || 'N/A'}</div>
                                    <div><strong className="block text-muted-foreground">Modèle</strong> {vehicle.model || 'N/A'}</div>
                                    <div><strong className="block text-muted-foreground">Année</strong> {vehicle.year || 'N/A'}</div>
                                    <div><strong className="block text-muted-foreground">Plaque</strong> {vehicle.licensePlate || 'N/A'}</div>
                                    <div><strong className="block text-muted-foreground">Carburant</strong> {vehicle.fuelType || 'N/A'}</div>
                                    <div><strong className="block text-muted-foreground">Puissance Fiscale</strong> {vehicle.fiscalPower ? `${vehicle.fiscalPower} CV` : 'N/A'}</div>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <VehicleTabs 
                    vehicle={vehicle}
                    repairs={repairs} 
                    maintenance={maintenance} 
                    fuelLogs={fuelLogs}
                    onDataChange={fetchVehicleData}
                    initialTab={initialTab}
                />
                </div>
            </ErrorBoundary>
        </main>
    </>
  );
}


export default function VehicleDetailClient({ vehicleId }: { vehicleId: string }) {
    return (
        <Suspense fallback={<DashboardHeader title="Chargement..." />}>
            <VehicleDetailContent vehicleId={vehicleId} />
        </Suspense>
    )
}
