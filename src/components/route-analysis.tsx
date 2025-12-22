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

        // Compute Global Split
        let totalWorkKm = 0;
        let totalLeisureKm = 0;

        patterns.forEach(p => {
            if (p.analysis) {
                totalWorkKm += p.analysis.workDistance;
                totalLeisureKm += p.analysis.leisureDistance;
            } else {
                // Fallback if analysis missing (shouldn't happen with new logic)
                if (p.detectedPattern === 'daily_commute') totalWorkKm += p.estimatedDistance;
                else totalLeisureKm += p.estimatedDistance;
            }

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

        return { chartData, averages, totalWorkKm, totalLeisureKm };
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
                        <div className="space-y-4 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                            {patterns.slice(0, 10).map(pattern => {
                                const key = pattern.matchedPlaceId || pattern.detectedPattern || 'unknown';
                                const avg = stats.averages[key] || 0;
                                const diff = pattern.consumption - avg;
                                const isEfficient = diff < -0.2; // 0.2L tolerance
                                const isInefficient = diff > 0.2;
                                const workRatio = pattern.analysis?.workRatio || 0;

                                return (
                                    <div key={pattern.id} className="group relative flex flex-col p-4 border rounded-xl bg-card hover:bg-accent/5 transition-all duration-200">
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg shadow-sm ${pattern.detectedPattern === 'daily_commute' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' :
                                                    pattern.detectedPattern === 'weekend_trip' ? 'bg-green-100 dark:bg-green-900/30 text-green-600' :
                                                        pattern.detectedPattern === 'mixed' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600' :
                                                            'bg-gray-100 dark:bg-gray-800 text-gray-500'
                                                    }`}>
                                                    {pattern.detectedPattern === 'daily_commute' && '🏢'}
                                                    {pattern.detectedPattern === 'weekend_trip' && '🌴'}
                                                    {pattern.detectedPattern === 'mixed' && '⚖️'}
                                                    {pattern.detectedPattern === 'occasional' && '🚗'}
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-semibold text-sm">
                                                            {pattern.matchedPlaceName ||
                                                                (pattern.detectedPattern === 'daily_commute' ? 'Trajet Quotidien' :
                                                                    pattern.detectedPattern === 'mixed' ? 'Trajet Mixte' :
                                                                        pattern.detectedPattern === 'weekend_trip' ? 'Sortie Week-end' : 'Autre Trajet')}
                                                        </span>
                                                        {pattern.detectedPattern === 'mixed' && (
                                                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 font-medium">
                                                                {Math.round(workRatio * 100)}% Pro
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                                        {new Date(pattern.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} • {pattern.estimatedDistance.toFixed(0)} km
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <div className="font-bold text-primary text-base">
                                                        {pattern.consumption.toFixed(1)} <span className="text-[10px] font-normal text-muted-foreground uppercase">L/100</span>
                                                    </div>
                                                    {/* Efficiency Indicator */}
                                                    <div className={`flex items-center justify-center w-6 h-6 rounded-full bg-secondary/50 ${isEfficient ? 'text-green-500' : isInefficient ? 'text-red-500' : 'text-gray-400'}`} title={`${diff > 0 ? '+' : ''}${diff.toFixed(1)} L/100km vs Habituel`}>
                                                        {isEfficient ? <TrendingDown className="h-3.5 w-3.5" /> : isInefficient ? <TrendingUp className="h-3.5 w-3.5" /> : <Minus className="h-3 w-3" />}
                                                    </div>
                                                </div>
                                                <div className="text-xs text-muted-foreground font-medium">
                                                    {pattern.cost.toFixed(0)} Dt
                                                </div>
                                            </div>
                                        </div>

                                        {/* Progressive Bar for Mixed/Work Context */}
                                        {pattern.analysis && (pattern.detectedPattern === 'mixed' || pattern.detectedPattern === 'daily_commute') && (
                                            <div className="mt-1 space-y-1.5">
                                                <div className="relative w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                                    <div className="absolute top-0 left-0 h-full bg-blue-500 transition-all duration-500" style={{ width: `${workRatio * 100}%` }} />
                                                    <div className="absolute top-0 right-0 h-full bg-green-500 transition-all duration-500" style={{ width: `${100 - (workRatio * 100)}%` }} />
                                                </div>
                                                <div className="flex justify-between text-[10px] font-medium text-muted-foreground px-1">
                                                    <span className="text-blue-600 dark:text-blue-400">{pattern.analysis.workDistance.toFixed(0)} km Travail</span>
                                                    <span className="text-green-600 dark:text-green-400">{pattern.analysis.leisureDistance.toFixed(0)} km Loisirs</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </CardContent>
                </Card>
                <Card className="md:col-span-2 lg:col-span-1">
                    <CardHeader>
                        <CardTitle>Répartition Globale Pro / Perso</CardTitle>
                        <CardDescription>Basé sur la distance totale parcourue ({stats.totalWorkKm.toFixed(0)} km pro vs {stats.totalLeisureKm.toFixed(0)} km perso)</CardDescription>
                    </CardHeader>
                    <CardContent className="flex justify-center">
                        <div className="h-[200px] w-full max-w-[300px] relative">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={[
                                            { name: 'Travail', value: stats.totalWorkKm, fill: '#3b82f6' },
                                            { name: 'Loisirs', value: stats.totalLeisureKm, fill: '#22c55e' },
                                        ]}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        <Cell key="cell-work" fill="#3b82f6" />
                                        <Cell key="cell-leisure" fill="#22c55e" />
                                    </Pie>
                                    <Tooltip
                                        formatter={(val: number) => [`${val.toFixed(0)} km`, 'Distance']}
                                        contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                                    />
                                    <Legend verticalAlign="bottom" height={36} />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <span className="text-sm font-bold text-muted-foreground">
                                    {(stats.totalWorkKm / ((stats.totalWorkKm + stats.totalLeisureKm) || 1) * 100).toFixed(0)}% Pro
                                </span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
