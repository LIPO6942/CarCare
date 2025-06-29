'use client';

import { useMemo, useEffect, useState } from 'react';
import type { Repair, FuelLog } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { DollarSign, Fuel, Wrench, Route } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { getAllUserRepairs, getAllUserFuelLogs } from '@/lib/data';
import { Skeleton } from './ui/skeleton';

export function ReportsClient() {
  const { user } = useAuth();
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
        if (!user) return;
        setIsLoading(true);
        const [repairsData, fuelLogsData] = await Promise.all([
            getAllUserRepairs(user.uid),
            getAllUserFuelLogs(user.uid)
        ]);
        setRepairs(repairsData);
        setFuelLogs(fuelLogsData);
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
      repairCategories[repair.category] = (repairCategories[repair.category] || 0) + repair.cost;
    });

    const costData = [
      { name: 'Carburant', Coût: totalFuelCost, fill: 'hsl(var(--chart-1))' },
      ...Object.entries(repairCategories).map(([name, cost]) => ({
        name,
        Coût: cost,
        fill: 'hsl(var(--chart-2))',
      })),
    ];
    
    const maxMileage = Math.max(
        ...repairs.map(r => r.mileage), 
        ...fuelLogs.map(f => f.mileage),
        0
    );

    return { totalCost, totalFuelCost, totalRepairCost, costData, maxMileage };
  }, [repairs, fuelLogs]);
  
  const costPerKm = maxMileage > 0 ? (totalCost / maxMileage) : 0;

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
              {costPerKm.toLocaleString('fr-FR', { style: 'currency', currency: 'TND' })} / km
            </div>
            <p className="text-xs text-muted-foreground">Basé sur {maxMileage.toLocaleString('fr-FR')} km parcourus</p>
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
    </div>
  );
}
