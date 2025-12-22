'use client';

import { useState, useEffect, useMemo } from 'react';
import { RoutePattern } from '@/lib/types';
import { analyzeRoutes } from '@/lib/data';
import { useAuth } from '@/context/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ArrowRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, PieChart, Pie, Legend } from 'recharts';

export function RouteAnalysis({ vehicleId }: { vehicleId: string }) {
    const { user } = useAuth();
    const [patterns, setPatterns] = useState<RoutePattern[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function loadData() {
            if (!user || !vehicleId) return;
            try {
                const data = await analyzeRoutes(user.uid, vehicleId);
                // Sort by date desc
                data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                setPatterns(data);
            } catch (error) {
                console.error("Failed to analyze routes", error);
            } finally {
                setIsLoading(false);
            }
        }
        loadData();
    }, [user, vehicleId]);

    const stats = useMemo(() => {
        // Group by detailed key (Place ID or Pattern Type) to get specific averages
        const byKey: Record<string, { count: number; totalCons: number; totalDist: number }> = {};
        const byType: Record<string, { count: number; totalCons: number; totalDist: number }> = {
            'daily_commute': { count: 0, totalCons: 0, totalDist: 0 },
            'occasional': { count: 0, totalCons: 0, totalDist: 0 },
            'weekend_trip': { count: 0, totalCons: 0, totalDist: 0 },
            'unknown': { count: 0, totalCons: 0, totalDist: 0 },
        };

        patterns.forEach(p => {
            // General Type Stats
            const type = p.detectedPattern || 'unknown';
            if (!byType[type]) byType[type] = { count: 0, totalCons: 0, totalDist: 0 };
            byType[type].count++;
            byType[type].totalCons += p.consumption;
            byType[type].totalDist += p.estimatedDistance;

            // Specific Route Stats (for deviation analysis)
            // If matched place, use ID, otherwise use pattern type
            const key = p.matchedPlaceId || type;
            if (!byKey[key]) byKey[key] = { count: 0, totalCons: 0, totalDist: 0 };
            byKey[key].count++;
            byKey[key].totalCons += p.consumption;
            byKey[key].totalDist += p.estimatedDistance;
        });

        // Compute averages for chart
        const chartData = Object.entries(byType).map(([key, data]) => ({
            name: key === 'daily_commute' ? 'Trajet Quotidien' :
                key === 'occasional' ? 'Occasionnel' :
                    key === 'weekend_trip' ? 'Weekend' : 'Inconnu',
            type: key,
            avgConsumption: data.count > 0 ? (data.totalCons / data.count) : 0,
            count: data.count,
        })).filter(d => d.count > 0);

        // Compute averages map for easy lookup
        const averages: Record<string, number> = {};
        Object.entries(byKey).forEach(([k, v]) => {
            if (v.count > 0) averages[k] = v.totalCons / v.count;
        });

        return { chartData, averages };
    }, [patterns]);

    if (isLoading) {
        return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    if (patterns.length === 0) {
        return (
            <Card>
                <CardContent className="pt-6 text-center text-muted-foreground">
                    Pas assez de données pour analyser les trajets sur ce véhicule.
                </CardContent>
            </Card>
        );
    }

    const COLORS = {
        'daily_commute': 'hsl(var(--chart-1))',
        'occasional': 'hsl(var(--chart-2))',
        'weekend_trip': 'hsl(var(--chart-3))',
        'unknown': 'hsl(var(--muted))',
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Consommation par Type de Trajet</CardTitle>
                        <CardDescription>Moyenne L/100km selon le type de déplacement détecté</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[250px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={stats.chartData} layout="vertical" margin={{ left: 40 }}>
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12 }} />
                                    <Tooltip
                                        cursor={{ fill: 'hsl(var(--muted))', opacity: 0.2 }}
                                        contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                                        formatter={(val: number) => [`${val.toFixed(2)} L/100km`, 'Moyenne']}
                                    />
                                    <Bar dataKey="avgConsumption" radius={[0, 4, 4, 0]} barSize={32}>
                                        {stats.chartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[entry.type as keyof typeof COLORS] || COLORS['unknown']} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Derniers Trajets & Performance</CardTitle>
                        <CardDescription>Comparé à la moyenne de ce trajet spécifique</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4 max-h-[250px] overflow-y-auto pr-2">
                            {patterns.slice(0, 5).map(pattern => {
                                const key = pattern.matchedPlaceId || pattern.detectedPattern || 'unknown';
                                const avg = stats.averages[key] || 0;
                                const diff = pattern.consumption - avg;
                                const isEfficient = diff < -0.2; // 0.2L tolerance
                                const isInefficient = diff > 0.2;

                                return (
                                    <div key={pattern.id} className="flex items-center justify-between p-3 border rounded-lg bg-card/50">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className={`w-2 h-2 rounded-full ${pattern.detectedPattern === 'daily_commute' ? 'bg-[hsl(var(--chart-1))]' : pattern.detectedPattern === 'occasional' ? 'bg-[hsl(var(--chart-2))]' : 'bg-gray-400'}`} />
                                                <span className="font-medium text-sm">
                                                    {pattern.matchedPlaceName ? (
                                                        <span className="flex items-center gap-1">
                                                            {pattern.detectedPattern === 'daily_commute' && '🏢'}
                                                            {pattern.detectedPattern === 'weekend_trip' && '🌴'}
                                                            {pattern.matchedPlaceName}
                                                        </span>
                                                    ) : (
                                                        pattern.detectedPattern === 'daily_commute' ? 'Trajet Quotidien' :
                                                            pattern.detectedPattern === 'occasional' ? 'Long Trajet' : 'Trajet Mixte'
                                                    )}
                                                </span>
                                            </div>
                                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                                                {new Date(pattern.date).toLocaleDateString()} • {pattern.estimatedDistance.toFixed(0)} km
                                            </div>
                                        </div>
                                        <div className="text-right flex items-center gap-3">
                                            <div>
                                                <div className="font-bold text-primary">
                                                    {pattern.consumption.toFixed(1)} <span className="text-xs font-normal text-muted-foreground">L/100</span>
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                    {pattern.cost.toFixed(0)} Dt
                                                </div>
                                            </div>

                                            {/* Performance Indicator */}
                                            <div className="flex items-center justify-center w-8" title={`${diff > 0 ? '+' : ''}${diff.toFixed(1)} L/100km vs Moyenne`}>
                                                {isEfficient ? (
                                                    <TrendingDown className="h-5 w-5 text-green-500" />
                                                ) : isInefficient ? (
                                                    <TrendingUp className="h-5 w-5 text-red-500" />
                                                ) : (
                                                    <Minus className="h-4 w-4 text-muted-foreground/50" />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
