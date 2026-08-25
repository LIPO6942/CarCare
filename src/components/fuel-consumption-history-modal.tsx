'use client';

import { useMemo } from 'react';
import type { Vehicle, FuelLog } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ComposedChart } from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { getVehicleTankCapacity, calculateIntervalConsumption, calculateAverageRefillGaugeLevel, getRefillHabitDescription } from '@/lib/fuel-utils';
import { Fuel, Gauge, Droplets } from 'lucide-react';

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
  const { consumptionHistory, avgRefillGauge, refillHabit, estimatedCapacity } = useMemo(() => {
    const vehicleFuelLogs = fuelLogs
      .filter(log => log.vehicleId === vehicle.id && log.mileage > 0)
      .sort((a, b) => a.mileage - b.mileage);

    const estimatedCapacity = getVehicleTankCapacity(vehicle, vehicleFuelLogs);
    const avgRefillGauge = calculateAverageRefillGaugeLevel(vehicleFuelLogs);
    const refillHabit = avgRefillGauge !== null ? getRefillHabitDescription(avgRefillGauge) : null;

    if (vehicleFuelLogs.length < 2) {
      return { consumptionHistory: [], avgRefillGauge, refillHabit, estimatedCapacity };
    }

    // Calculate consumption for each interval
    const intervals = [];
    for (let i = 1; i < vehicleFuelLogs.length; i++) {
      const previousLog = vehicleFuelLogs[i - 1];
      const currentLog = vehicleFuelLogs[i];
      const intervalResult = calculateIntervalConsumption(previousLog, currentLog, estimatedCapacity);

      if (intervalResult) {
        const { consumption, distance } = intervalResult;
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

    return {
      consumptionHistory: intervals.slice(-3),
      avgRefillGauge,
      refillHabit,
      estimatedCapacity
    };
  }, [vehicle, fuelLogs]);

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

        {avgRefillGauge !== null && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 my-1">
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 flex flex-col justify-between">
              <div className="flex items-center gap-1.5 text-primary text-xs font-medium">
                <Fuel className="h-3.5 w-3.5 shrink-0" />
                <span>Niveau moyen avant plein</span>
              </div>
              <div className="mt-1">
                <span className="text-lg font-bold text-primary">~{avgRefillGauge}%</span>
                <span className="ml-1 text-xs text-muted-foreground">{refillHabit?.icon} {refillHabit?.label}</span>
              </div>
              <span className="text-[10px] text-muted-foreground mt-0.5">{refillHabit?.text}</span>
            </div>

            <div className="p-3 rounded-lg bg-muted/40 border flex flex-col justify-between">
              <div className="flex items-center gap-1.5 text-muted-foreground text-xs font-medium">
                <Gauge className="h-3.5 w-3.5 shrink-0" />
                <span>Capacité réservoir</span>
              </div>
              <div className="mt-1">
                <span className="text-lg font-bold text-foreground">{estimatedCapacity} Litres</span>
              </div>
              <span className="text-[10px] text-muted-foreground mt-0.5">Calibrée avec la jauge</span>
            </div>

            <div className="p-3 rounded-lg bg-muted/40 border flex flex-col justify-between col-span-2 sm:col-span-1">
              <div className="flex items-center gap-1.5 text-muted-foreground text-xs font-medium">
                <Droplets className="h-3.5 w-3.5 shrink-0" />
                <span>Derniers trajets</span>
              </div>
              <div className="mt-1">
                <span className="text-lg font-bold text-foreground">{consumptionHistory.length}</span>
                <span className="text-xs text-muted-foreground ml-1">intervalles analysés</span>
              </div>
              <span className="text-[10px] text-muted-foreground mt-0.5">Calcul précis jauge + plein</span>
            </div>
          </div>
        )}

        <Card>
          <CardContent className="pt-6">
            <div className="h-[320px] w-full">
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
