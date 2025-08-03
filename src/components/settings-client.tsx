'use client';

import { useState, useEffect, useMemo } from 'react';
import { useForm, type SubmitHandler, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { getSettings, saveSettings, type AppSettings } from '@/lib/settings';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import type { Vehicle } from '@/lib/types';
import { getVehicles } from '@/lib/data';
import { useAuth } from '@/context/auth-context';
import { Skeleton } from './ui/skeleton';


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

export function SettingsClient() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const { register, handleSubmit, reset, control, formState: { isSubmitting, errors } } = useForm<SettingsFormData>({
    resolver: zodResolver(SettingsSchema),
    defaultValues: getSettings(), // Load initial settings
  });

  const { fields: vignetteEssenceFields } = useFieldArray({
    control,
    name: 'vignetteEssence',
  });
  const { fields: vignetteDieselFields } = useFieldArray({
    control,
    name: 'vignetteDiesel',
  });
  
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

  const relevantVignetteIndices = useMemo(() => {
    const essenceRanges = new Set<string>();
    const dieselRanges = new Set<string>();

    vehicles.forEach(v => {
        const power = v.fiscalPower;
        if (!power) return;

        const table = v.fuelType === 'Diesel' ? vignetteDieselFields : vignetteEssenceFields;
        const targetSet = v.fuelType === 'Diesel' ? dieselRanges : essenceRanges;

        const powerRange = table.find(field => {
            if (field.range.includes('-')) {
                const [min, max] = field.range.split('-').map(Number);
                return power >= min && power <= max;
            }
            return Number(field.range) === power;
        });

        if (powerRange) {
            targetSet.add(powerRange.range);
        }
    });
    
    return {
        essence: vignetteEssenceFields.map((f, i) => essenceRanges.has(f.range) ? i : -1).filter(i => i !== -1),
        diesel: vignetteDieselFields.map((f, i) => dieselRanges.has(f.range) ? i : -1).filter(i => i !== -1),
    };
  }, [vehicles, vignetteEssenceFields, vignetteDieselFields]);


  if (isLoading) {
    return (
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
    )
  }
  
  const hasRelevantVignettes = relevantVignetteIndices.essence.length > 0 || relevantVignetteIndices.diesel.length > 0;

  return (
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
            <h4 className="text-base font-semibold">Carburant</h4>
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
             <h4 className="text-base font-semibold">Entretien</h4>
             <div className="space-y-2">
                <Label htmlFor="costVisiteTechnique">Coût Visite Technique (TND)</Label>
                <Input id="costVisiteTechnique" type="number" step="0.001" {...register('costVisiteTechnique')} />
                {errors.costVisiteTechnique && <p className="text-sm text-destructive">{errors.costVisiteTechnique.message}</p>}
             </div>
          </div>
          
          {hasRelevantVignettes && (
             <div className="space-y-4 rounded-md border p-4">
                <h4 className="text-base font-semibold">Coûts Vignette Personnalisés</h4>
                <p className="text-sm text-muted-foreground">
                    Modifiez ici les coûts de la vignette pour les véhicules de votre garage.
                </p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {relevantVignetteIndices.essence.length > 0 && (
                        <div className="space-y-2">
                            <h5 className="font-medium">Essence</h5>
                             {relevantVignetteIndices.essence.map(index => (
                                <div key={vignetteEssenceFields[index].id} className="flex items-center gap-4">
                                    <Label className="flex-1" htmlFor={`vignetteEssence.${index}.cost`}>
                                        {vignetteEssenceFields[index].range} CV
                                    </Label>
                                    <Input
                                        id={`vignetteEssence.${index}.cost`}
                                        type="number"
                                        step="0.001"
                                        className="max-w-[120px]"
                                        {...register(`vignetteEssence.${index}.cost` as const)}
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                     {relevantVignetteIndices.diesel.length > 0 && (
                        <div className="space-y-2">
                           <h5 className="font-medium">Diesel</h5>
                            {relevantVignetteIndices.diesel.map(index => (
                                <div key={vignetteDieselFields[index].id} className="flex items-center gap-4">
                                    <Label className="flex-1" htmlFor={`vignetteDiesel.${index}.cost`}>
                                        {vignetteDieselFields[index].range} CV
                                    </Label>
                                    <Input
                                        id={`vignetteDiesel.${index}.cost`}
                                        type="number"
                                        step="0.001"
                                        className="max-w-[120px]"
                                        {...register(`vignetteDiesel.${index}.cost` as const)}
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
          )}

        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enregistrer les paramètres
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
