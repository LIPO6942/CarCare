import { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
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
    return [...monthlyFuelLogs].reverse().map(log => {
      let m = format(log.date, 'MMM', { locale: fr }).replace('.', '');
      m = m.charAt(0).toUpperCase() + m.slice(1);
      return {
        month: m,
        cout: parseFloat(log.totalCost.toFixed(2)),
        fullDate: format(log.date, 'MMMM yyyy', { locale: fr })
      };
    });
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
                <LineChart data={chartData} margin={{ top: 20, right: 20, left: -10, bottom: 20 }}>
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
                    stroke="hsl(var(--primary))"
                    tick={{ fill: 'hsl(var(--primary))', fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${value}Dt`}
                  />
                  <Tooltip
                    cursor={{ stroke: 'hsl(var(--muted))', strokeWidth: 2 }}
                    contentStyle={{
                      background: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 'var(--radius)',
                      color: 'hsl(var(--foreground))',
                      fontSize: '12px'
                    }}
                    formatter={(value: number, name: string) => {
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
                  <Line 
                    type="monotone" 
                    dataKey="cout" 
                    name="Tendance" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={4} 
                    dot={{ fill: 'hsl(var(--background))', stroke: 'hsl(var(--primary))', strokeWidth: 2, r: 5 }} 
                    activeDot={{ fill: 'hsl(var(--primary))', stroke: 'hsl(var(--background))', strokeWidth: 2, r: 8 }} 
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
