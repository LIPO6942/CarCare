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
                <Skeleton className="h-40 w-full" />
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
                        <div className="flex flex-col sm:flex-row gap-4 items-center">
                            <div className="relative h-32 w-full sm:w-32 flex-shrink-0 rounded-lg bg-muted/30 flex items-center justify-center p-2 mx-auto">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                src={vehicle.imageUrl || 'https://placehold.co/600x400.png'}
                                alt={`${vehicle.brand || ''} ${vehicle.model || ''}`}
                                className="h-full w-full object-contain"
                                onError={(e) => { e.currentTarget.src = 'https://placehold.co/200x100.png'; e.currentTarget.onerror = null; }}
                                />
                            </div>
                            <div className="flex-grow w-full">
                                <h2 className="text-xl font-bold mb-2">Informations Clés</h2>
                                <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                                    <div className="flex items-baseline gap-1.5">
                                        <strong className="text-muted-foreground font-medium">Marque:</strong>
                                        <span className="font-semibold">{vehicle.brand || 'N/A'}</span>
                                    </div>
                                    <div className="flex items-baseline gap-1.5">
                                        <strong className="text-muted-foreground font-medium">Modèle:</strong>
                                        <span className="font-semibold">{vehicle.model || 'N/A'}</span>
                                    </div>
                                    <div className="flex items-baseline gap-1.5">
                                        <strong className="text-muted-foreground font-medium">Année:</strong>
                                        <span className="font-semibold">{vehicle.year || 'N/A'}</span>
                                    </div>
                                    <div className="flex items-baseline gap-1.5">
                                        <strong className="text-muted-foreground font-medium">Plaque:</strong>
                                        <span className="font-semibold">{vehicle.licensePlate || 'N/A'}</span>
                                    </div>
                                    <div className="flex items-baseline gap-1.5">
                                        <strong className="text-muted-foreground font-medium">Carburant:</strong>
                                        <span className="font-semibold">{vehicle.fuelType || 'N/A'}</span>
                                    </div>
                                    <div className="flex items-baseline gap-1.5">
                                        <strong className="text-muted-foreground font-medium">CV:</strong>
                                        <span className="font-semibold">{vehicle.fiscalPower ? `${vehicle.fiscalPower}` : 'N/A'}</span>
                                    </div>
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
