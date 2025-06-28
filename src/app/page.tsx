import { PlusCircle, Car, Wrench, Bell } from 'lucide-react';
import type { ComponentType } from 'react';
import { AppLayout } from '@/components/app-layout';
import { DashboardHeader } from '@/components/dashboard-header';
import { AddVehicleSheet } from '@/components/add-vehicle-sheet';
import { getVehicles, getAllRepairs, getAllDeadlines } from '@/lib/data';
import { VehicleCard } from '@/components/vehicle-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

function StatCard({ title, value, icon: Icon, description }: { title: string, value: string | number, icon: ComponentType<{ className?: string }>, description?: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const [vehicles, repairs, deadlines] = await Promise.all([
    getVehicles(),
    getAllRepairs(),
    getAllDeadlines()
  ]);

  const totalVehicles = vehicles.length;
  const totalRepairCost = repairs.reduce((sum, r) => sum + r.cost, 0);
  const upcomingDeadlinesCount = deadlines.filter(d => new Date(d.date) >= new Date()).length;

  return (
    <AppLayout>
      <DashboardHeader
        title="Tableau de Bord"
        description="Vue d'ensemble de votre flotte de véhicules."
      >
        <AddVehicleSheet>
          <Button>
            <PlusCircle className="mr-2" />
            Ajouter un véhicule
          </Button>
        </AddVehicleSheet>
      </DashboardHeader>
      <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-8">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <StatCard
            title="Total des Véhicules"
            value={totalVehicles}
            icon={Car}
            description="Nombre de véhicules gérés"
          />
          <StatCard
            title="Coût total des Réparations"
            value={`${totalRepairCost.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}`}
            icon={Wrench}
            description="Sur tous les véhicules"
          />
          <StatCard
            title="Échéances à Venir"
            value={upcomingDeadlinesCount}
            icon={Bell}
            description="Contrôles techniques, assurances..."
          />
        </div>
        
        <div className="space-y-4">
          <h2 className="text-2xl font-bold tracking-tight">Mes Véhicules</h2>
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
      </main>
    </AppLayout>
  );
}
