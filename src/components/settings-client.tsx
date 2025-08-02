'use client';

import { useState, useEffect } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { getSettings, saveSettings, type AppSettings } from '@/lib/settings';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

const SettingsSchema = z.object({
  priceEssence: z.coerce.number().min(0, 'Le prix doit être positif'),
  priceDiesel: z.coerce.number().min(0, 'Le prix doit être positif'),
  costVisiteTechnique: z.coerce.number().min(0, 'Le coût doit être positif'),
});

type SettingsFormData = z.infer<typeof SettingsSchema>;

export function SettingsClient() {
  const { toast } = useToast();
  const { register, handleSubmit, reset, formState: { isSubmitting, errors } } = useForm<SettingsFormData>({
    resolver: zodResolver(SettingsSchema),
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

  return (
    <Card className="max-w-2xl mx-auto">
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
