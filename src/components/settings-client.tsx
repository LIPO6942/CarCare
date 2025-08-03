'use client';

import { useState, useEffect } from 'react';
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
  const { register, handleSubmit, reset, control, formState: { isSubmitting, errors } } = useForm<SettingsFormData>({
    resolver: zodResolver(SettingsSchema),
    defaultValues: {
      vignetteEssence: [],
      vignetteDiesel: [],
    }
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
    const currentSettings = getSettings();
    reset(currentSettings);
  }, [reset]);

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
  
  const renderVignetteTable = (fields: any[], type: 'Essence' | 'Diesel') => (
     <div className="space-y-4 rounded-md border p-4">
        <h4 className="text-base font-semibold">Vignette - {type}</h4>
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Puissance Fiscale (CV)</TableHead>
                    <TableHead className="text-right">Coût (TND)</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {fields.map((field, index) => (
                    <TableRow key={field.id}>
                        <TableCell>
                            <Input
                                {...register(`vignette${type}.${index}.range` as const)}
                                readOnly
                                className="bg-muted border-none"
                            />
                        </TableCell>
                        <TableCell>
                             <Input
                                type="number"
                                step="0.001"
                                className="text-right"
                                {...register(`vignette${type}.${index}.cost` as const)}
                            />
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    </div>
  )

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
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {renderVignetteTable(vignetteEssenceFields, 'Essence')}
            {renderVignetteTable(vignetteDieselFields, 'Diesel')}
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
  );
}
