import { PlusCircle } from 'lucide-react';
import { AppLayout } from '@/components/app-layout';
import { DashboardHeader } from '@/components/dashboard-header';
import { AddVehicleSheet } from '@/components/add-vehicle-sheet';
import { getVehicles } from '@/lib/data';
import { VehicleCard } from '@/components/vehicle-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default async function DashboardPage() {
  const vehicles = await getVehicles();

  return (
    <AppLayout>
      <DashboardHeader
        title="Mes Véhicules"
        description="Gérez tous vos véhicules en un seul endroit."
      >
        <AddVehicleSheet>
          <Button>
            <PlusCircle className="mr-2" />
            Ajouter un véhicule
          </Button>
        </AddVehicleSheet>
      </DashboardHeader>
      <div className="p-4 sm:p-6 lg:p-8 pt-0">
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
    </AppLayout>
  );
}
