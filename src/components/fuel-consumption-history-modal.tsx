'use client';

import { useMemo } from 'react';
import type { Vehicle, FuelLog } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ComposedChart } from 'recharts';
import { Card, CardContent } from '@/components/ui/card';

interface FuelConsumptionHistoryModalProps {
  vehicle: Vehicle;
  fuelLogs: FuelLog[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
];

export function FuelConsumptionHistoryModal({ vehicle, fuelLogs, open, onOpenChange }: FuelConsumptionHistoryModalProps) {
  const consumptionHistory = useMemo(() => {
    const vehicleFuelLogs = fuelLogs
      .filter(log => log.vehicleId === vehicle.id && log.mileage > 0)
      .sort((a, b) => a.mileage - b.mileage);

    if (vehicleFuelLogs.length < 2) {
      return [];
    }

    // Step A: Estimate Tank Capacity
    const capacityEstimates: number[] = [];
    vehicleFuelLogs.forEach(log => {
      if (log.gaugeLevelBefore !== undefined && log.gaugeLevelBefore < 1) {
        const estimate = log.quantity / (1 - log.gaugeLevelBefore);
        if (estimate > 0 && estimate < 200) {
          capacityEstimates.push(estimate);
        }
      }
    });

    let estimatedCapacity = 0;
    if (capacityEstimates.length > 0) {
      capacityEstimates.sort((a, b) => a - b);
      const mid = Math.floor(capacityEstimates.length / 2);
      estimatedCapacity = capacityEstimates.length % 2 === 0
        ? (capacityEstimates[mid - 1] + capacityEstimates[mid]) / 2
        : capacityEstimates[mid];
    }

    // Calculate consumption for each interval
    const intervals = [];
    for (let i = 1; i < vehicleFuelLogs.length; i++) {
      const previousLog = vehicleFuelLogs[i - 1];
      const currentLog = vehicleFuelLogs[i];
      const distance = currentLog.mileage - previousLog.mileage;

      if (distance > 0) {
        let consumption = 0;

        if (estimatedCapacity > 0 && previousLog.gaugeLevelBefore !== undefined && currentLog.gaugeLevelBefore !== undefined) {
          // Use Delta V formula
          const deltaV = previousLog.quantity + (estimatedCapacity * previousLog.gaugeLevelBefore) - (estimatedCapacity * currentLog.gaugeLevelBefore);
          consumption = (deltaV / distance) * 100;
        } else {
          // Fallback method: refill at the end of interval
          consumption = (currentLog.quantity / distance) * 100;
        }

        if (consumption > 0 && consumption < 50) { // Sanity check
          // Calculate cost per 100km using the current log's price per liter
          const costPer100km = consumption * currentLog.pricePerLiter;

          intervals.push({
            date: new Date(currentLog.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
            fullDate: currentLog.date,
            consumption: parseFloat(consumption.toFixed(2)),
            costPer100km: parseFloat(costPer100km.toFixed(2)),
            distance: distance,
            pricePerLiter: currentLog.pricePerLiter,
          });
        }
      }
    }

    // Return the last 3 intervals
    return intervals.slice(-3);
  }, [vehicle.id, fuelLogs]);

  if (consumptionHistory.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Historique de Consommation</DialogTitle>
            <DialogDescription>
              {vehicle.brand} {vehicle.model} - {vehicle.licensePlate}
            </DialogDescription>
          </DialogHeader>
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">
                Pas assez de données pour afficher l'historique. Ajoutez au moins 2 pleins de carburant.
              </p>
            </CardContent>
          </Card>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Historique de Consommation - Derniers 100 km</DialogTitle>
          <DialogDescription>
            {vehicle.brand} {vehicle.model} - {vehicle.licensePlate}
          </DialogDescription>
        </DialogHeader>
        <Card>
          <CardContent className="pt-6">
            <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={consumptionHistory} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    stroke="hsl(var(--foreground))"
                    tick={{ fill: 'hsl(var(--foreground))' }}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis
                    stroke="hsl(var(--foreground))"
                    tick={{ fill: 'hsl(var(--foreground))' }}
                    label={{
                      value: 'Consommation (L/100km)',
                      angle: -90,
                      position: 'insideLeft',
                      style: { fill: 'hsl(var(--foreground))' }
                    }}
                  />
                  <Tooltip
                    cursor={{ fill: 'hsl(var(--muted))' }}
                    contentStyle={{
                      background: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 'var(--radius)',
                      color: 'hsl(var(--foreground))'
                    }}
                    formatter={(value: number, name: string, props: any) => {
                      const costInfo = props.payload.costPer100km ?
                        ` (≈ ${props.payload.costPer100km.toFixed(2)} Dt/100km)` : '';
                      return [
                        `${value.toFixed(2)} L/100km${costInfo}`,
                        `Distance: ${props.payload.distance} km`
                      ];
                    }}
                    labelFormatter={(label) => `Date: ${label}`}
                  />
                  <Bar
                    dataKey="consumption"
                    radius={[8, 8, 0, 0]}
                    maxBarSize={100}
                  >
                    {consumptionHistory.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                  <Line
                    type="monotone"
                    dataKey="consumption"
                    stroke="hsl(var(--primary))"
                    strokeWidth={3}
                    dot={{ fill: 'hsl(var(--primary))', r: 6 }}
                    activeDot={{ r: 8 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-6 grid grid-cols-3 gap-4">
              {consumptionHistory.map((item, index) => {
                // Calculate trend
                let trendIndicator = '';
                let trendColor = '';
                if (index > 0) {
                  const diff = item.consumption - consumptionHistory[index - 1].consumption;
                  if (diff > 0.5) {
                    trendIndicator = '↗️';
                    trendColor = 'text-red-500';
                  } else if (diff < -0.5) {
                    trendIndicator = '↘️';
                    trendColor = 'text-green-500';
                  } else {
                    trendIndicator = '→';
                    trendColor = 'text-blue-500';
                  }
                }

                return (
                  <div key={index} className="text-center p-3 rounded-lg border bg-card relative" style={{ borderColor: COLORS[index % COLORS.length] }}>
                    {trendIndicator && (
                      <div className={`absolute top-2 right-2 text-xl ${trendColor}`} title={
                        trendIndicator === '↗️' ? 'Consommation en hausse' :
                          trendIndicator === '↘️' ? 'Consommation en baisse' :
                            'Consommation stable'
                      }>
                        {trendIndicator}
                      </div>
                    )}
                    <div className="text-sm font-medium text-muted-foreground">{item.date}</div>
                    <div className="text-2xl font-bold mt-2" style={{ color: COLORS[index % COLORS.length] }}>
                      {item.consumption.toFixed(2)}
                    </div>
                    <div className="text-xs text-muted-foreground">L/100km</div>
                    <div className="text-sm font-semibold text-primary mt-2">
                      ≈ {item.costPer100km.toFixed(2)} Dt
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {item.distance} km
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
