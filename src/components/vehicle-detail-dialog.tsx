'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Vehicle, Repair, Maintenance, FuelLog, Deadline } from '@/lib/types';
import { getRepairsForVehicle, getMaintenanceForVehicle, getFuelLogsForVehicle, getDeadlinesForVehicle } from '@/lib/data';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { VehicleTabs } from '@/components/vehicle-tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/auth-context';

interface VehicleDetailDialogProps {
  vehicle: Vehicle | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDataChange: () => void; // To refresh dashboard data when this dialog makes a change
}

export function VehicleDetailDialog({ vehicle, open, onOpenChange, onDataChange }: VehicleDetailDialogProps) {
  const { user } = useAuth();
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [maintenance, setMaintenance] = useState<Maintenance[]>([]);
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchVehicleData = useCallback(async () => {
    if (vehicle && user) {
        setIsLoading(true);
        const [repairsData, maintenanceData, fuelLogsData, deadlinesData] = await Promise.all([
          getRepairsForVehicle(vehicle.id, user.uid),
          getMaintenanceForVehicle(vehicle.id, user.uid),
          getFuelLogsForVehicle(vehicle.id, user.uid),
          getDeadlinesForVehicle(vehicle.id, user.uid),
        ]);
        setRepairs(repairsData);
        setMaintenance(maintenanceData);
        setFuelLogs(fuelLogsData);
        setDeadlines(deadlinesData);
        setIsLoading(false);
        // Also refresh the dashboard data in case a cost was added/changed
        onDataChange();
    }
  }, [vehicle, user, onDataChange]);

  useEffect(() => {
    if (open) {
      fetchVehicleData();
    }
  }, [open, fetchVehicleData]);

  if (!vehicle) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-2xl">{vehicle.brand} {vehicle.model}</DialogTitle>
          <DialogDescription>
            {vehicle.year} - {vehicle.licensePlate}
          </DialogDescription>
        </DialogHeader>
        <div className="grid flex-1 items-start gap-4 overflow-y-auto p-6">
            <Card>
                <CardContent className="pt-6">
                    <div className="grid gap-6 sm:grid-cols-3">
                        <div className="relative h-60 w-full sm:col-span-1 rounded-lg bg-muted/30 flex items-center justify-center p-4">
                             {/* eslint-disable-next-line @next/next/no-img-element */}
                             <img
                              src={vehicle.imageUrl || 'https://placehold.co/600x400.png'}
                              alt={`${vehicle.brand} logo`}
                              className="h-full w-full object-contain"
                              onError={(e) => { e.currentTarget.src = 'https://placehold.co/200x100.png'; e.currentTarget.onerror = null; }}
                            />
                        </div>
                        <div className="sm:col-span-2">
                            <h2 className="text-2xl font-bold mb-4">Informations Clés</h2>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div><strong className="block text-muted-foreground">Marque</strong> {vehicle.brand}</div>
                                <div><strong className="block text-muted-foreground">Modèle</strong> {vehicle.model}</div>
                                <div><strong className="block text-muted-foreground">Année</strong> {vehicle.year}</div>
                                <div><strong className="block text-muted-foreground">Plaque</strong> {vehicle.licensePlate}</div>
                                <div><strong className="block text-muted-foreground">Carburant</strong> {vehicle.fuelType}</div>
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
                vehicleId={vehicle.id}
                repairs={repairs} 
                maintenance={maintenance} 
                fuelLogs={fuelLogs}
                deadlines={deadlines}
                onDataChange={fetchVehicleData}
            />
           )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
