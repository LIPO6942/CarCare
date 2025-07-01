'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Vehicle, Repair, Maintenance, FuelLog } from '@/lib/types';
import { getRepairsForVehicle, getMaintenanceForVehicle, getFuelLogsForVehicle } from '@/lib/data';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { VehicleTabs } from '@/components/vehicle-tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/auth-context';
import ErrorBoundary from './error-boundary';

interface VehicleDetailDialogProps {
  vehicle: Vehicle | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDataChange: () => void;
  initialTab?: string;
}

export function VehicleDetailDialog({ vehicle, open, onOpenChange, onDataChange, initialTab }: VehicleDetailDialogProps) {
  const { user } = useAuth();
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [maintenance, setMaintenance] = useState<Maintenance[]>([]);
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchVehicleData = useCallback(async () => {
    if (vehicle && user) {
      setIsLoading(true);
      try {
        const [repairsData, maintenanceData, fuelLogsData] = await Promise.all([
          getRepairsForVehicle(vehicle.id, user.uid),
          getMaintenanceForVehicle(vehicle.id, user.uid),
          getFuelLogsForVehicle(vehicle.id, user.uid),
        ]);
        setRepairs(repairsData);
        setMaintenance(maintenanceData);
        setFuelLogs(fuelLogsData);
      } catch (error) {
        console.error("Failed to fetch vehicle details due to an error. Displaying empty data.", error);
        setRepairs([]);
        setMaintenance([]);
        setFuelLogs([]);
      } finally {
        setIsLoading(false);
      }
    }
  }, [vehicle, user]);

  useEffect(() => {
    if (open) {
      fetchVehicleData();
    }
  }, [open, fetchVehicleData]);

  const handleDataChange = () => {
    fetchVehicleData();
    onDataChange();
  };

  if (!vehicle) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-2xl">{vehicle.brand || 'Marque Inconnue'} {vehicle.model || 'Modèle Inconnu'}</DialogTitle>
          <DialogDescription>
            {vehicle.year || 'N/A'} - {vehicle.licensePlate || 'N/A'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6">
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
            {isLoading ? (
              <div className="space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-40 w-full" />
              </div>
            ) : (
              <VehicleTabs 
                  vehicle={vehicle}
                  repairs={repairs} 
                  maintenance={maintenance} 
                  fuelLogs={fuelLogs}
                  onDataChange={handleDataChange}
                  initialTab={initialTab}
              />
            )}
            </div>
          </ErrorBoundary>
        </div>
      </DialogContent>
    </Dialog>
  );
}
