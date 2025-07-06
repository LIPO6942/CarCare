
'use client';

import { useMemo } from 'react';
import type { Repair } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Pie, PieChart, ResponsiveContainer, Tooltip, Legend, Cell } from 'recharts';

interface RepairSummaryChartProps {
  repairs: Repair[];
  totalCost: number;
}

const COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

export function RepairSummaryChart({ repairs, totalCost }: RepairSummaryChartProps) {
  const costByCategory = useMemo(() => {
    if (!repairs || repairs.length === 0) {
      return [];
    }
    const categoryMap: { [key: string]: number } = {};
    repairs.forEach(repair => {
      const category = repair.category || 'Non classé';
      categoryMap[category] = (categoryMap[category] || 0) + repair.cost;
    });

    return Object.entries(categoryMap)
        .map(([name, cost]) => ({ name, 'Coût': cost }))
        .sort((a,b) => b['Coût'] - a['Coût']);

  }, [repairs]);

  if (costByCategory.length === 0) {
    return null; 
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Répartition des Coûts de Réparation</CardTitle>
        <CardDescription>Dépenses par catégorie.</CardDescription>
      </CardHeader>
      <CardContent className="h-[250px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip
                cursor={{ fill: 'hsl(var(--muted))' }}
                contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)' }}
                formatter={(value: number) => value.toLocaleString('fr-FR', { style: 'currency', currency: 'TND' })}
            />
            <Legend 
                layout="vertical" 
                align="right" 
                verticalAlign="middle" 
                iconSize={10} 
                wrapperStyle={{lineHeight: '24px', paddingLeft: '20px'}}
            />
            <Pie
              data={costByCategory}
              dataKey="Coût"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={100}
              innerRadius={70}
              paddingAngle={2}
              labelLine={false}
            >
              {costByCategory.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} className="focus:outline-none ring-0 border-0 focus:ring-0" stroke="hsl(var(--background))" />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
      <CardFooter className="flex-col items-center border-t pt-4">
        <div className="text-sm text-muted-foreground">Total des réparations</div>
        <div className="text-2xl font-bold">
          {totalCost.toLocaleString('fr-FR', { style: 'currency', currency: 'TND' })}
        </div>
      </CardFooter>
    </Card>
  );
}
