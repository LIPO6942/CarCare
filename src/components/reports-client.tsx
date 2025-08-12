
'use client';

import { useMemo, useEffect, useState } from 'react';
import type { Repair, FuelLog, Maintenance, Vehicle } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { DollarSign, Fuel, Wrench, Route, Milestone } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { getAllUserRepairs, getAllUserFuelLogs, getAllUserMaintenance, getVehicles } from '@/lib/data';
import { Skeleton } from './ui/skeleton';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const safeFormatDate = (dateInput: any, formatString: string = 'd MMM yyyy') => {
  try {
    if (!dateInput) return 'N/A';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return 'Date invalide';
    return format(date, formatString, { locale: fr });
  } catch (error) {
    return 'Erreur date';
  }
};


export function ReportsClient() {
  const { user } = useAuth();
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [maintenance, setMaintenance] = useState<Maintenance[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
        if (!user) return;
        setIsLoading(true);
        const [repairsData, fuelLogsData, maintenanceData, vehiclesData] = await Promise.all([
            getAllUserRepairs(user.uid),
            getAllUserFuelLogs(user.uid),
            getAllUserMaintenance(user.uid),
            getVehicles(user.uid)
        ]);
        setRepairs(repairsData);
        setFuelLogs(fuelLogsData);
        setMaintenance(maintenanceData);
        setVehicles(vehiclesData);
        setIsLoading(false);
    }
    fetchData();
  }, [user]);

  const { totalCost, totalFuelCost, totalRepairCost, costData, maxMileage } = useMemo(() => {
    const totalRepairCost = repairs.reduce((acc, r) => acc + r.cost, 0);
    const totalFuelCost = fuelLogs.reduce((acc, f) => acc + f.totalCost, 0);
    const totalCost = totalRepairCost + totalFuelCost;

    const repairCategories: { [key: string]: number } = {};
    repairs.forEach(repair => {
      const category = repair.category || 'Non classé';
      repairCategories[category] = (repairCategories[category] || 0) + repair.cost;
    });
    
    const aggregatedCosts = new Map<string, { cost: number; fill: string }>();
    aggregatedCosts.set('Carburant', { cost: totalFuelCost, fill: 'hsl(var(--chart-1))' });

    Object.entries(repairCategories).forEach(([name, cost]) => {
        aggregatedCosts.set(name, { cost, fill: 'hsl(var(--chart-2))' });
    });
    
    const costData = Array.from(aggregatedCosts.entries()).map(([name, data]) => ({
        name,
        Coût: data.cost,
        fill: data.fill,
    }));
    
    const maxMileage = Math.max(
        ...repairs.map(r => r.mileage || 0), 
        ...fuelLogs.map(f => f.mileage || 0),
        0
    );

    return { totalCost, totalFuelCost, totalRepairCost, costData, maxMileage };
  }, [repairs, fuelLogs]);
  
  const costPerKm = maxMileage > 0 ? (totalCost / maxMileage) : 0;
  
  const oilChangeDistances = useMemo(() => {
    return vehicles.map(vehicle => {
      const vehicleOilChanges = maintenance
        .filter(m => m.vehicleId === vehicle.id && m.task === 'Vidange' && m.mileage > 0)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      if (vehicleOilChanges.length < 2) {
        return null;
      }
      
      const lastChange = vehicleOilChanges[vehicleOilChanges.length - 1];
      const previousChange = vehicleOilChanges[vehicleOilChanges.length - 2];
      
      const distance = lastChange.mileage - previousChange.mileage;

      if (distance <= 0) return null;

      return {
        vehicleId: vehicle.id,
        vehicleName: `${vehicle.brand} ${vehicle.model}`,
        distance,
        lastDate: lastChange.date,
        previousDate: previousChange.date,
      };
    }).filter(item => item !== null) as { vehicleId: string; vehicleName: string; distance: number; lastDate: string; previousDate: string; }[];
  }, [vehicles, maintenance]);


  if (isLoading) {
      return (
          <div className="grid gap-6">
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                  <Skeleton className="h-28" />
                  <Skeleton className="h-28" />
                  <Skeleton className="h-28" />
                  <Skeleton className="h-28" />
              </div>
              <Skeleton className="h-96" />
              <Skeleton className="h-48" />
          </div>
      )
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Coût Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalCost.toLocaleString('fr-FR', { style: 'currency', currency: 'TND' })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Coût Carburant</CardTitle>
            <Fuel className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalFuelCost.toLocaleString('fr-FR', { style: 'currency', currency: 'TND' })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Coût Réparations</CardTitle>
            <Wrench className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalRepairCost.toLocaleString('fr-FR', { style: 'currency', currency: 'TND' })}
            </div>
          </CardContent>
        </Card>
         <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Coût par Kilomètre</CardTitle>
            <Route className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {costPerKm > 0 ? `${costPerKm.toLocaleString('fr-FR', { style: 'currency', currency: 'TND', minimumFractionDigits: 3 })} / km` : 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground">{maxMileage > 0 ? `Basé sur ${maxMileage.toLocaleString('fr-FR')} km parcourus` : 'Données insuffisantes'}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dépenses par Catégorie</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={costData}>
              <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value: number) => `${value.toLocaleString('fr-FR')} TND`} />
              <Tooltip 
                cursor={{fill: 'hsl(var(--muted))'}}
                contentStyle={{background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)'}}
                formatter={(value: number) => `${value.toLocaleString('fr-FR', { style: 'currency', currency: 'TND' })}`}
              />
              <Legend />
              <Bar dataKey="Coût" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      
      {oilChangeDistances.length > 0 && (
        <Card>
            <CardHeader>
                <CardTitle>Distance entre Vidanges</CardTitle>
                <CardDescription>Kilométrage réel parcouru entre les deux derniers changements d'huile.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
                {oilChangeDistances.map((item) => (
                    <div key={item.vehicleId} className="p-4 border rounded-lg flex items-center gap-4">
                        <div className="p-3 bg-primary/10 rounded-full">
                            <Milestone className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                            <p className="font-semibold text-muted-foreground">{item.vehicleName}</p>
                            <p className="text-2xl font-bold">{item.distance.toLocaleString('fr-FR')} km</p>
                            <p className="text-xs text-muted-foreground">
                                Entre le {safeFormatDate(item.previousDate)} et le {safeFormatDate(item.lastDate)}
                            </p>
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
      )}

    </div>
  );
}
