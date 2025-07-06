'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Vehicle, Repair, Maintenance, FuelLog } from '@/lib/types';
import { getRepairsForVehicle, getMaintenanceForVehicle, getFuelLogsForVehicle } from '@/lib/data';
import { VehicleTabs } from '@/components/vehicle-tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/auth-context';
import ErrorBoundary from './error-boundary';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { X } from 'lucide-react';
import { Button } from './ui/button';

interface VehicleDetailModalProps {
  vehicle: Vehicle | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDataChange: () => void;
}

export function VehicleDetailModal({ vehicle, open, onOpenChange, onDataChange }: VehicleDetailModalProps) {
  const { user } = useAuth();
  
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [maintenance, setMaintenance] = useState<Maintenance[]>([]);
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const fetchVehicleSubCollections = useCallback(async () => {
    if (user && vehicle) {
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
        console.error("Failed to fetch vehicle details.", error);
      } finally {
        setIsLoading(false);
      }
    }
  }, [vehicle, user]);

  useEffect(() => {
    if (open && vehicle) {
      fetchVehicleSubCollections();
    }
  }, [open, vehicle, fetchVehicleSubCollections]);

  const handleDataChange = () => {
    fetchVehicleSubCollections();
    onDataChange(); // Also refetch dashboard data
  }


  if (!open || !vehicle) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 max-w-full w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-4xl flex flex-col">
        <DialogHeader className="p-4 border-b flex-row items-center justify-between space-y-0">
          <div>
            <DialogTitle className="text-xl sm:text-2xl">{`${vehicle.brand || 'Marque'} ${vehicle.model || 'Modèle'}`}</DialogTitle>
            <DialogDescription>{`${vehicle.year || 'N/A'} - ${vehicle.licensePlate || 'N/A'}`}</DialogDescription>
          </div>
           <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} className="flex-shrink-0">
             <X className="h-5 w-5" />
             <span className="sr-only">Fermer</span>
           </Button>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <ErrorBoundary>
            {isLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-64 w-full" />
                </div>
            ) : (
              <VehicleTabs 
                  vehicle={vehicle}
                  repairs={repairs} 
                  maintenance={maintenance} 
                  fuelLogs={fuelLogs}
                  onDataChange={handleDataChange}
              />
            )}
          </ErrorBoundary>
        </div>
      </DialogContent>
    </Dialog>
  );
}
