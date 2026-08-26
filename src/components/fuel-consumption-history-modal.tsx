'use client';

import { useMemo } from 'react';
import type { Vehicle, FuelLog } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ComposedChart, Line } from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { getVehicleTankCapacity, calculateIntervalConsumption } from '@/lib/fuel-utils';
import { Fuel } from 'lucide-react';

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
  const { consumptionHistory, estimatedCapacity } = useMemo(() => {
    const vehicleFuelLogs = fuelLogs
      .filter(log => log.vehicleId === vehicle.id && log.mileage > 0)
      .sort((a, b) => a.mileage - b.mileage);

    const estimatedCapacity = getVehicleTankCapacity(vehicle, vehicleFuelLogs);

    if (vehicleFuelLogs.length < 2) {
      return { consumptionHistory: [], estimatedCapacity };
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

    return { consumptionHistory: intervals.slice(-3), estimatedCapacity };
  }, [vehicle, fuelLogs]);

  if (consumptionHistory.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Historique de Consommation</DialogTitle>
            <DialogDescription>
              {vehicle.brand} {vehicle.model} - {vehicle.licensePlate}
            </DialogDescription>
          </DialogHeader>
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-sm text-muted-foreground">
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
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-4 sm:p-6 overflow-hidden">
        <DialogHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap pr-6">
            <DialogTitle className="text-base sm:text-lg">3 Derniers Pleins & Consommations</DialogTitle>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted/80 text-muted-foreground border">
              <Fuel className="h-3 w-3 text-primary shrink-0" />
              Réservoir : <strong className="text-foreground font-semibold">{estimatedCapacity} L</strong>
            </span>
          </div>
          <DialogDescription className="text-xs">
            {vehicle.brand} {vehicle.model} - {vehicle.licensePlate}
          </DialogDescription>
        </DialogHeader>

        <Card className="flex-1 border overflow-hidden">
          <CardContent className="p-3 sm:p-4 space-y-3">
            <div className="h-[220px] sm:h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={consumptionHistory} margin={{ top: 15, right: 20, left: 10, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    stroke="hsl(var(--foreground))"
                    tick={{ fill: 'hsl(var(--foreground))', fontSize: 11 }}
                  />
                  <YAxis
                    stroke="hsl(var(--foreground))"
                    tick={{ fill: 'hsl(var(--foreground))', fontSize: 11 }}
                    label={{
                      value: 'L/100km',
                      angle: -90,
                      position: 'insideLeft',
                      style: { fill: 'hsl(var(--foreground))', fontSize: 11 }
                    }}
                  />
                  <Tooltip
                    cursor={{ fill: 'hsl(var(--muted))' }}
                    contentStyle={{
                      background: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 'var(--radius)',
                      color: 'hsl(var(--foreground))',
                      fontSize: '12px',
                      padding: '8px'
                    }}
                    formatter={(value: number, name: string, props: any) => {
                      const costInfo = props.payload.costPer100km ?
                        ` (≈ ${props.payload.costPer100km.toFixed(2)} Dt/100km)` : '';
                      return [
                        `${value.toFixed(2)} L/100km${costInfo}`,
                        `Distance: ${props.payload.distance} km`
                      ];
                    }}
                    labelFormatter={(label) => `Plein du : ${label}`}
                  />
                  <Bar
                    dataKey="consumption"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={60}
                  >
                    {consumptionHistory.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                  <Line
                    type="monotone"
                    dataKey="consumption"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2.5}
                    dot={{ fill: 'hsl(var(--primary))', r: 5 }}
                    activeDot={{ r: 7 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-3">
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
                  <div key={index} className="text-center p-2 sm:p-2.5 rounded-lg border bg-card relative" style={{ borderColor: COLORS[index % COLORS.length] }}>
                    {trendIndicator && (
                      <div className={`absolute top-1.5 right-1.5 text-xs sm:text-sm ${trendColor}`} title={
                        trendIndicator === '↗️' ? 'Consommation en hausse' :
                          trendIndicator === '↘️' ? 'Consommation en baisse' :
                            'Consommation stable'
                      }>
                        {trendIndicator}
                      </div>
                    )}
                    <div className="text-[11px] font-medium text-muted-foreground">{item.date}</div>
                    <div className="text-lg sm:text-xl font-bold mt-0.5" style={{ color: COLORS[index % COLORS.length] }}>
                      {item.consumption.toFixed(2)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">L/100km</div>
                    <div className="text-xs font-semibold text-primary mt-1">
                      ≈ {item.costPer100km.toFixed(2)} Dt
                    </div>
                    <div className="text-[10px] text-muted-foreground">
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
