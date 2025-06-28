'use client';

import { useMemo } from 'react';
import type { Repair } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';

interface RepairSummaryChartProps {
  repairs: Repair[];
}

export function RepairSummaryChart({ repairs }: RepairSummaryChartProps) {
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
        <CardDescription>Visualisation des dépenses par catégorie de réparation.</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={costByCategory} layout="vertical" margin={{ left: 20, right: 20 }}>
            <XAxis type="number" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value: number) => `${value.toLocaleString('fr-FR')} TND`} />
            <YAxis type="category" dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} width={100} interval={0} />
            <Tooltip 
              cursor={{fill: 'hsl(var(--muted))'}}
              contentStyle={{background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)'}}
              formatter={(value: number) => `${value.toLocaleString('fr-FR', { style: 'currency', currency: 'TND' })}`}
            />
            <Bar dataKey="Coût" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
