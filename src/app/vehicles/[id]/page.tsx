import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getVehicleById, getRepairsForVehicle, getMaintenanceForVehicle, getFuelLogsForVehicle, getDeadlinesForVehicle } from '@/lib/data';
import { AppLayout } from '@/components/app-layout';
import { DashboardHeader } from '@/components/dashboard-header';
import { VehicleTabs } from '@/components/vehicle-tabs';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';

export default async function VehicleDetailPage({ params }: { params: { id: string } }) {
  const vehicle = await getVehicleById(params.id);
  if (!vehicle) {
    notFound();
  }

  const [repairs, maintenance, fuelLogs, deadlines] = await Promise.all([
    getRepairsForVehicle(params.id),
    getMaintenanceForVehicle(params.id),
    getFuelLogsForVehicle(params.id),
    getDeadlinesForVehicle(params.id)
  ]);

  return (
    <AppLayout>
      <DashboardHeader title={`${vehicle.brand} ${vehicle.model}`}>
        <Button variant="outline" asChild>
          <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour
          </Link>
        </Button>
      </DashboardHeader>
      <main className="grid flex-1 items-start gap-4 p-4 sm:px-6 sm:py-0 md:gap-8">
        <div className="grid auto-rows-max items-start gap-4 md:gap-8 lg:col-span-2">
            <Card>
                <CardContent className="pt-6">
                    <div className="grid gap-6 sm:grid-cols-3">
                        <div className="relative h-60 w-full sm:col-span-1 rounded-lg overflow-hidden">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                             <img
                              src={vehicle.imageUrl || 'https://placehold.co/600x400.png'}
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
           <VehicleTabs 
                vehicleId={vehicle.id}
                repairs={repairs} 
                maintenance={maintenance} 
                fuelLogs={fuelLogs}
                deadlines={deadlines}
            />
        </div>
      </main>
    </AppLayout>
  );
}
