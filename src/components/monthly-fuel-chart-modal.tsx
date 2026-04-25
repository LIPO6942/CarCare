import { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface MonthlyFuelChartModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  monthlyFuelLogs: { totalCost: number; totalQuantity: number; date: Date }[];
  vehicleName: string;
}

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))'];

export function MonthlyFuelChartModal({ open, onOpenChange, monthlyFuelLogs, vehicleName }: MonthlyFuelChartModalProps) {
  const chartData = useMemo(() => {
    // We reverse it to show chronological order from left to right on the chart
    return [...monthlyFuelLogs].reverse().map(log => ({
      month: format(log.date, 'MMM yy', { locale: fr }),
      quantite: parseFloat(log.totalQuantity.toFixed(2)),
      cout: parseFloat(log.totalCost.toFixed(2)),
      fullDate: format(log.date, 'MMMM yyyy', { locale: fr })
    }));
  }, [monthlyFuelLogs]);

  if (chartData.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md w-[95vw]">
          <DialogHeader>
            <DialogTitle>Évolution mensuelle</DialogTitle>
            <DialogDescription>{vehicleName}</DialogDescription>
          </DialogHeader>
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">
                Pas assez de données pour afficher l'évolution.
              </p>
            </CardContent>
          </Card>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[95vw] overflow-hidden p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-lg sm:text-xl">Consommation par mois</DialogTitle>
          <DialogDescription className="text-sm sm:text-base">{vehicleName}</DialogDescription>
        </DialogHeader>
        <Card className="border-0 shadow-none">
          <CardContent className="p-0 sm:pt-4">
            <div className="h-[250px] sm:h-[350px] w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="month"
                    stroke="hsl(var(--foreground))"
                    tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    dy={10}
                  />
                  <YAxis
                    yAxisId="left"
                    stroke="hsl(var(--chart-1))"
                    tick={{ fill: 'hsl(var(--chart-1))', fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${value}L`}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="hsl(var(--chart-2))"
                    tick={{ fill: 'hsl(var(--chart-2))', fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${value}Dt`}
                  />
                  <Tooltip
                    cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                    contentStyle={{
                      background: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 'var(--radius)',
                      color: 'hsl(var(--foreground))',
                      fontSize: '12px'
                    }}
                    formatter={(value: number, name: string) => {
                      if (name === 'quantite') return [`${value} L`, 'Quantité'];
                      if (name === 'cout') return [`${value} Dt`, 'Coût Total'];
                      return [value, name];
                    }}
                    labelFormatter={(label, payload) => {
                      if (payload && payload.length > 0) {
                        return payload[0].payload.fullDate;
                      }
                      return label;
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                  <Bar yAxisId="left" dataKey="quantite" name="Quantité (L)" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  <Bar yAxisId="right" dataKey="cout" name="Coût (Dt)" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
