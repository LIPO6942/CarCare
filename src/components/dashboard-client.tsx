'use client';

import { useState } from 'react';
import type { Vehicle } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { VehicleCard } from '@/components/vehicle-card';
import { AddVehicleSheet } from '@/components/add-vehicle-sheet';
import { VehicleDetailDialog } from '@/components/vehicle-detail-dialog';

interface DashboardClientProps {
  vehicles: Vehicle[];
}

export function DashboardClient({ vehicles }: DashboardClientProps) {
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const handleOpenDetails = (vehicle: Vehicle) => {
    setSelectedVehicle(vehicle);
    setIsDetailOpen(true);
  };

  return (
    <>
      <div className="space-y-4">
        <h2 className="text-2xl font-bold tracking-tight">Mes Véhicules</h2>
        {vehicles.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {vehicles.map((vehicle) => (
              <VehicleCard key={vehicle.id} vehicle={vehicle} onOpenDetails={handleOpenDetails} />
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
              <AddVehicleSheet>
                <Button>
                  <PlusCircle className="mr-2" />
                  Ajouter un véhicule
                </Button>
              </AddVehicleSheet>
            </CardContent>
          </Card>
        )}
      </div>
      <VehicleDetailDialog vehicle={selectedVehicle} open={isDetailOpen} onOpenChange={setIsDetailOpen} />
    </>
  );
}
