'use client';

import { useState, useEffect, useMemo } from 'react';
import { RoutePattern } from '@/lib/types';
import { analyzeRoutes } from '@/lib/data';
import { useAuth } from '@/context/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ArrowRight, TrendingUp, TrendingDown, Minus, Gauge, Info } from 'lucide-react';
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
        const byType: Record<string, { count: number; totalCons: number; totalDist: number }> = {
            'daily_commute': { count: 0, totalCons: 0, totalDist: 0 },
            'occasional': { count: 0, totalCons: 0, totalDist: 0 },
            'weekend_trip': { count: 0, totalCons: 0, totalDist: 0 },
            'unknown': { count: 0, totalCons: 0, totalDist: 0 },
        };

        let totalWorkKm = 0;
        let totalLeisureKm = 0;
        let totalWorkCost = 0;
        let totalLeisureCost = 0;

        patterns.forEach(p => {
            if (p.analysis) {
                totalWorkKm += p.analysis.workDistance;
                totalLeisureKm += p.analysis.leisureDistance;
                totalWorkCost += p.analysis.workCost;
                totalLeisureCost += p.analysis.leisureCost;
            }

            const type = p.detectedPattern || 'unknown';
            if (!byType[type]) byType[type] = { count: 0, totalCons: 0, totalDist: 0 };
            byType[type].count++;
            byType[type].totalCons += p.consumption;
            byType[type].totalDist += p.estimatedDistance;
        });

        const chartData = Object.entries(byType).map(([key, data]) => ({
            name: key === 'daily_commute' ? 'Pro' :
                key === 'occasional' ? 'Occasionnel' :
                    key === 'weekend_trip' ? 'Perso' :
                        key === 'mixed' ? 'Mixte' : 'Inconnu',
            type: key,
            avgConsumption: data.count > 0 ? (data.totalCons / data.count) : 0,
            count: data.count,
        })).filter(d => d.count > 0 && d.name !== 'Inconnu');

        return { chartData, totalWorkKm, totalLeisureKm, totalWorkCost, totalLeisureCost };
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
        'daily_commute': '#3b82f6',
        'occasional': '#10b981',
        'weekend_trip': '#f59e0b',
        'unknown': '#94a3b8',
    };

    return (
        <div className="space-y-6">
            {/* Global Cost Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/10 border-blue-200 dark:border-blue-800 shadow-sm relative overflow-hidden">
                    <CardContent className="pt-6">
                        <div className="flex justify-between items-start relative z-10">
                            <div>
                                <p className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-1">Impact Financier Pro</p>
                                <h4 className="text-2xl font-black text-blue-900 dark:text-blue-100">
                                    {stats.totalWorkCost.toLocaleString('fr-FR', { style: 'currency', currency: 'TND' })}
                                </h4>
                                <p className="text-[10px] text-blue-700/60 dark:text-blue-400/60 font-bold mt-1 tracking-tight">({stats.totalWorkKm.toLocaleString('fr-FR')} km)</p>
                            </div>
                            <div className="p-2 bg-blue-500 rounded-lg shadow-lg shadow-blue-500/30">
                                <TrendingUp className="h-4 w-4 text-white" />
                            </div>
                        </div>
                        <div className="mt-4 flex items-center gap-2 relative z-10">
                            <div className="h-1.5 flex-1 bg-blue-200 dark:bg-blue-800 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-600" style={{ width: `${(stats.totalWorkCost / ((stats.totalWorkCost + stats.totalLeisureCost) || 1)) * 100}%` }} />
                            </div>
                        </div>
                        {/* Background Decor */}
                        <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl" />
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/10 border-emerald-200 dark:border-emerald-800 shadow-sm relative overflow-hidden">
                    <CardContent className="pt-6">
                        <div className="flex justify-between items-start relative z-10">
                            <div>
                                <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">Impact Financier Perso</p>
                                <h4 className="text-2xl font-black text-emerald-900 dark:text-emerald-100">
                                    {stats.totalLeisureCost.toLocaleString('fr-FR', { style: 'currency', currency: 'TND' })}
                                </h4>
                                <p className="text-[10px] text-emerald-700/60 dark:text-emerald-400/60 font-bold mt-1 tracking-tight">({stats.totalLeisureKm.toLocaleString('fr-FR')} km)</p>
                            </div>
                            <div className="p-2 bg-emerald-500 rounded-lg shadow-lg shadow-emerald-500/30">
                                <ArrowRight className="h-4 w-4 text-white" />
                            </div>
                        </div>
                        <div className="mt-4 flex items-center gap-2 relative z-10">
                            <div className="h-1.5 flex-1 bg-emerald-200 dark:bg-emerald-800 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-600" style={{ width: `${(stats.totalLeisureCost / ((stats.totalWorkCost + stats.totalLeisureCost) || 1)) * 100}%` }} />
                            </div>
                        </div>
                        {/* Background Decor */}
                        <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl" />
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <div>
                            <CardTitle className="text-lg">Derniers Trajets</CardTitle>
                            <CardDescription>Analyse détaillée des 10 dernières périodes</CardDescription>
                        </div>
                        <div className="flex gap-2">
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-blue-600 uppercase">
                                <div className="w-2 h-2 rounded-full bg-blue-500" /> Pro
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 uppercase">
                                <div className="w-2 h-2 rounded-full bg-emerald-500" /> Perso
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                            {patterns.slice(0, 10).map(pattern => {
                                const workRatio = pattern.analysis?.workRatio || 0;
                                const efficiency = pattern.analysis?.commuteEfficiency || 0;
                                const isEfficient = efficiency < -0.1;
                                const isInefficient = efficiency > 0.1;

                                return (
                                    <div key={pattern.id} className="group flex flex-col p-4 border rounded-xl bg-card hover:border-primary/30 transition-all duration-200">
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xl shadow-inner ${pattern.detectedPattern === 'daily_commute' ? 'bg-blue-500 text-white' :
                                                    pattern.detectedPattern === 'weekend_trip' ? 'bg-emerald-500 text-white' :
                                                        pattern.detectedPattern === 'mixed' ? 'bg-indigo-500 text-white' :
                                                            'bg-slate-200 dark:bg-slate-800 text-slate-500'
                                                    }`}>
                                                    {pattern.detectedPattern === 'daily_commute' && '💼'}
                                                    {pattern.detectedPattern === 'weekend_trip' && '🏡'}
                                                    {pattern.detectedPattern === 'mixed' && '⚖️'}
                                                    {pattern.detectedPattern === 'occasional' && '🚙'}
                                                </div>
                                                <div>
                                                    <div className="font-extrabold text-sm tracking-tight text-foreground">
                                                        {pattern.matchedPlaceName ||
                                                            (pattern.detectedPattern === 'daily_commute' ? 'Routine Travail' :
                                                                pattern.detectedPattern === 'weekend_trip' ? 'Loisirs & Sorties' : 'Trajet Mixte')}
                                                    </div>
                                                    <div className="text-[11px] font-medium text-muted-foreground mt-0.5">
                                                        {new Date(pattern.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} • {pattern.estimatedDistance.toFixed(0)} km
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="text-right">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${isEfficient ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                                                        isInefficient ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' :
                                                            'bg-slate-100 text-slate-600 dark:bg-slate-800'
                                                        }`}>
                                                        {pattern.consumption.toFixed(1)} L
                                                    </span>
                                                    <div className={`text-[11px] font-black ${isEfficient ? 'text-emerald-500' : isInefficient ? 'text-rose-500' : 'text-slate-400'}`}>
                                                        {efficiency > 0 ? '+' : ''}{efficiency.toFixed(1)}
                                                    </div>
                                                </div>
                                                <div className="text-[10px] font-bold text-muted-foreground italic mt-1">
                                                    {pattern.cost.toFixed(0)} DT
                                                </div>
                                            </div>
                                        </div>

                                        <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                                            <div className="h-full bg-blue-500 border-r border-white/20" style={{ width: `${workRatio * 100}%` }} />
                                            <div className="h-full bg-emerald-500" style={{ width: `${(1 - workRatio) * 100}%` }} />
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </CardContent>
                </Card>

                <div className="space-y-6">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm uppercase tracking-widest text-muted-foreground font-bold italic">Répartition Km</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col items-center">
                            <div className="h-[200px] w-full relative">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={[
                                                { name: 'Pro', value: stats.totalWorkKm, fill: '#3b82f6' },
                                                { name: 'Perso', value: stats.totalLeisureKm, fill: '#10b981' },
                                            ]}
                                            cx="50%" cy="50%" innerRadius={55} outerRadius={75} paddingAngle={8} dataKey="value"
                                        >
                                            <Cell fill="#3b82f6" />
                                            <Cell fill="#10b981" />
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{ background: 'hsl(var(--background))', border: 'none', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                            formatter={(p: number) => [`${p.toFixed(0)} km`, '']}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                    <span className="text-2xl font-black text-foreground">
                                        {Math.round((stats.totalWorkKm / ((stats.totalWorkKm + stats.totalLeisureKm) || 1)) * 100)}%
                                    </span>
                                    <span className="text-[10px] font-bold text-blue-500 uppercase tracking-tighter">Pro</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm uppercase tracking-widest text-muted-foreground font-bold italic">Consommation / Type</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[180px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={stats.chartData} margin={{ left: -30 }}>
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={10} fontWeight="bold" />
                                        <YAxis axisLine={false} tickLine={false} fontSize={10} />
                                        <Tooltip
                                            cursor={{ fill: 'transparent' }}
                                            contentStyle={{ background: 'hsl(var(--background))', borderRadius: '8px' }}
                                        />
                                        <Bar dataKey="avgConsumption" radius={[4, 4, 0, 0]} barSize={24}>
                                            {stats.chartData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[entry.type as keyof typeof COLORS] || '#94a3b8'} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
