'use client';

import { useState, useEffect, useMemo } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { getSettings, saveSettings, type AppSettings, type VignetteCost } from '@/lib/settings';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import type { Vehicle } from '@/lib/types';
import { getVehicles } from '@/lib/data';
import { useAuth } from '@/context/auth-context';
import { Skeleton } from './ui/skeleton';
import { useNotifications } from '@/hooks/use-notifications';


const VignetteCostSchema = z.object({
  range: z.string(),
  cost: z.coerce.number().min(0),
});

const SettingsSchema = z.object({
  priceEssence: z.coerce.number().min(0, 'Le prix doit être positif'),
  priceDiesel: z.coerce.number().min(0, 'Le prix doit être positif'),
  costVisiteTechnique: z.coerce.number().min(0, 'Le coût doit être positif'),
  vignetteEssence: z.array(VignetteCostSchema),
  vignetteDiesel: z.array(VignetteCostSchema),
});

type SettingsFormData = z.infer<typeof SettingsSchema>;

function NotificationSettingsCard() {
    const { requestPermission, isPermissionGranted, isRequesting } = useNotifications();

    if (isPermissionGranted === null) {
        return null; // Don't render until we know the permission status
    }

    return (
        <Card className="max-w-4xl mx-auto">
            <CardHeader>
                <CardTitle>Notifications</CardTitle>
                <CardDescription>
                    Recevez des rappels pour les échéances importantes directement sur votre appareil.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {isPermissionGranted ? (
                    <div className="flex items-center gap-4 p-4 rounded-lg bg-green-50 text-green-800 border border-green-200">
                        <Bell className="h-6 w-6 text-green-600"/>
                        <div>
                            <h4 className="font-semibold">Les notifications sont activées.</h4>
                            <p className="text-sm">Vous recevrez des rappels pour les entretiens à venir.</p>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center gap-4 p-4 rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
                         <BellOff className="h-6 w-6 text-amber-600"/>
                        <div>
                            <h4 className="font-semibold">Les notifications ne sont pas activées.</h4>
                            <p className="text-sm">Cliquez sur le bouton pour autoriser les notifications.</p>
                        </div>
                    </div>
                )}
            </CardContent>
            {!isPermissionGranted && (
                 <CardFooter>
                    <Button onClick={requestPermission} disabled={isRequesting}>
                        {isRequesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4"/>}
                        {isRequesting ? 'En cours...' : 'Activer les notifications'}
                    </Button>
                </CardFooter>
            )}
        </Card>
    );
}

export function SettingsClient() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const { register, handleSubmit, reset, control, formState: { isSubmitting, errors }, setValue, watch } = useForm<SettingsFormData>({
    resolver: zodResolver(SettingsSchema),
    defaultValues: getSettings(),
  });

  const vignetteEssence = watch('vignetteEssence');
  const vignetteDiesel = watch('vignetteDiesel');

  useEffect(() => {
    async function loadData() {
      if (!user) {
        setIsLoading(false);
        return;
      };
      
      const [settingsData, vehiclesData] = await Promise.all([
        getSettings(),
        getVehicles(user.uid)
      ]);
      
      reset(settingsData);
      setVehicles(vehiclesData);
      setIsLoading(false);
    }
    loadData();
  }, [user, reset]);

  const onSubmit: SubmitHandler<SettingsFormData> = (data) => {
    try {
      saveSettings(data);
      toast({
        title: 'Succès',
        description: 'Vos paramètres ont été enregistrés.',
      });
    } catch (error) {
      toast({
        title: 'Erreur',
        description: "Impossible d'enregistrer les paramètres.",
        variant: 'destructive',
      });
    }
  };
  
  const relevantVignetteFields = useMemo(() => {
    const fields: { label: string, fieldName: `vignetteEssence.${number}.cost` | `vignetteDiesel.${number}.cost` }[] = [];
    const addedRanges = new Set<string>();

    vehicles.forEach(v => {
        if (!v.fiscalPower) return;

        const table = v.fuelType === 'Diesel' ? vignetteDiesel : vignetteEssence;
        const fieldNamePrefix = v.fuelType === 'Diesel' ? 'vignetteDiesel' : 'vignetteEssence';
        
        const powerRangeIndex = table.findIndex(field => {
            if (field.range.includes('-')) {
                const [min, max] = field.range.split('-').map(Number);
                return v.fiscalPower >= min && v.fiscalPower <= max;
            }
            return Number(field.range) === v.fiscalPower;
        });

        if (powerRangeIndex !== -1) {
            const range = table[powerRangeIndex].range;
            const key = `${v.fuelType}-${range}`;
            if (!addedRanges.has(key)) {
                fields.push({
                    label: `${v.fuelType} (${range} CV)`,
                    fieldName: `${fieldNamePrefix}.${powerRangeIndex}.cost` as any,
                });
                addedRanges.add(key);
            }
        }
    });
    
    return fields;
  }, [vehicles, vignetteEssence, vignetteDiesel]);


  if (isLoading) {
    return (
        <div className="space-y-6">
            <Card className="max-w-4xl mx-auto">
                <CardHeader>
                    <Skeleton className="h-8 w-48" />
                    <Skeleton className="h-4 w-full max-w-md" />
                </CardHeader>
                <CardContent className="space-y-6">
                    <Skeleton className="h-32 w-full" />
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-48 w-full" />
                </CardContent>
                <CardFooter>
                    <Skeleton className="h-10 w-48" />
                </CardFooter>
            </Card>
             <Card className="max-w-4xl mx-auto">
                <CardHeader>
                    <Skeleton className="h-8 w-40" />
                    <Skeleton className="h-4 w-full max-w-lg" />
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-10 w-52" />
                </CardContent>
             </Card>
        </div>
    )
  }
  
  const hasRelevantVignettes = relevantVignetteFields.length > 0;

  return (
    <div className="space-y-6">
        <NotificationSettingsCard />
        <Card className="max-w-4xl mx-auto">
        <form onSubmit={handleSubmit(onSubmit)}>
            <CardHeader>
            <CardTitle>Valeurs par Défaut</CardTitle>
            <CardDescription>
                Définissez les prix et coûts utilisés par défaut lors de l'ajout de nouvelles entrées.
            </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
            <div className="space-y-4 rounded-md border p-4">
                <h4 className="text-base font-semibold">Prix des Carburants</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="priceEssence">Prix / Litre Essence (TND)</Label>
                    <Input id="priceEssence" type="number" step="0.001" {...register('priceEssence')} />
                    {errors.priceEssence && <p className="text-sm text-destructive">{errors.priceEssence.message}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="priceDiesel">Prix / Litre Diesel (TND)</Label>
                    <Input id="priceDiesel" type="number" step="0.001" {...register('priceDiesel')} />
                    {errors.priceDiesel && <p className="text-sm text-destructive">{errors.priceDiesel.message}</p>}
                </div>
                </div>
            </div>
            
            <div className="space-y-4 rounded-md border p-4">
                <h4 className="text-base font-semibold">Coûts des Entretiens</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                    <div className="space-y-2">
                        <Label htmlFor="costVisiteTechnique">Coût Visite Technique (TND)</Label>
                        <Input id="costVisiteTechnique" type="number" step="0.001" {...register('costVisiteTechnique')} />
                        {errors.costVisiteTechnique && <p className="text-sm text-destructive">{errors.costVisiteTechnique.message}</p>}
                    </div>
                    {hasRelevantVignettes && (
                        <div className="space-y-2">
                            <Label>Coûts Vignette Personnalisés</Label>
                            <p className="text-xs text-muted-foreground pb-2">
                                Modifiez ici les coûts de la vignette pour les véhicules de votre garage.
                            </p>
                            <div className="space-y-2">
                            {relevantVignetteFields.map(field => (
                                <div key={field.fieldName} className="flex items-center gap-4">
                                    <Label className="flex-1" htmlFor={field.fieldName}>
                                        {field.label}
                                    </Label>
                                    <Input
                                        id={field.fieldName}
                                        type="number"
                                        step="0.001"
                                        className="max-w-[120px]"
                                        {...register(field.fieldName)}
                                    />
                                </div>
                            ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            </CardContent>
            <CardFooter>
            <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enregistrer les paramètres
            </Button>
            </CardFooter>
        </form>
        </Card>
    </div>
  );
}
