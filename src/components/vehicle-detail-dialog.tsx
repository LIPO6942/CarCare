'use client';

import { useState, useEffect } from 'react';
import type { Vehicle, Repair, Maintenance, FuelLog, Deadline } from '@/lib/types';
import { getRepairsForVehicle, getMaintenanceForVehicle, getFuelLogsForVehicle, getDeadlinesForVehicle } from '@/lib/data';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { VehicleTabs } from '@/components/vehicle-tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface VehicleDetailDialogProps {
  vehicle: Vehicle | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VehicleDetailDialog({ vehicle, open, onOpenChange }: VehicleDetailDialogProps) {
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [maintenance, setMaintenance] = useState<Maintenance[]>([]);
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (vehicle && open) {
      const fetchData = async () => {
        setIsLoading(true);
        const [repairsData, maintenanceData, fuelLogsData, deadlinesData] = await Promise.all([
          getRepairsForVehicle(vehicle.id),
          getMaintenanceForVehicle(vehicle.id),
          getFuelLogsForVehicle(vehicle.id),
          getDeadlinesForVehicle(vehicle.id),
        ]);
        setRepairs(repairsData);
        setMaintenance(maintenanceData);
        setFuelLogs(fuelLogsData);
        setDeadlines(deadlinesData);
        setIsLoading(false);
      };
      fetchData();
    }
  }, [vehicle, open]);

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
                        <div className="relative h-60 w-full sm:col-span-1 rounded-lg overflow-hidden">
                             <img
                              src={vehicle.imageUrl || 'https://images.unsplash.com/photo-1683729748363-4622bd9f1e3a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3NDE5ODJ8MHwxfHNlYXJjaHwxMXx8cGV1Z2VvdHxlbnwwfHx8fDE3NTExNTUwOTd8MA&ixlib=rb-4.1.0&q=80&w=1080'}
                              alt={`${vehicle.brand} ${vehicle.model}`}
                              data-ai-hint="front view car"
                              className="absolute inset-0 h-full w-full object-cover"
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
            />
           )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
