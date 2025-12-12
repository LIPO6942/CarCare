'use client';

import { useState, useMemo } from 'react';
import { useAuth } from '@/context/auth-context';
import { useToast } from '@/hooks/use-toast';
import { addFuelLog } from '@/lib/data';
import type { Vehicle, FuelLog } from '@/lib/types';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Fuel, Loader2 } from 'lucide-react';
import { getSettings } from '@/lib/settings';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

const QuickFuelLogSchema = z.object({
  vehicleId: z.string().min(1, 'Veuillez sélectionner un véhicule.'),
  totalCost: z.coerce.number().gt(0, 'Le coût doit être supérieur à 0.'),
  mileage: z.coerce.number().min(0, 'Le kilométrage doit être positif.'),
  gaugeLevelBefore: z.coerce.number().min(0).max(1, 'Niveau de jauge invalide.'),
});

interface QuickFuelLogFormProps {
  vehicles: Vehicle[];
  fuelLogs: FuelLog[];
  onFuelLogAdded: () => void;
}

export function QuickFuelLogForm({ vehicles, fuelLogs, onFuelLogAdded }: QuickFuelLogFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | undefined>(vehicles[0]?.id);
  const [currentMileage, setCurrentMileage] = useState<string>('');
  const [gaugeLevelBefore, setGaugeLevelBefore] = useState<number>(12.5);

  const defaultPricePerLiter = useMemo(() => {
    const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId);
    const settings = getSettings();
    if (selectedVehicle?.fuelType === 'Diesel') {
      return settings.priceDiesel;
    }
    return settings.priceEssence;
  }, [selectedVehicleId, vehicles]);

  const lastFuelLogInfo = useMemo(() => {
    if (!selectedVehicleId) return null;

    const lastLog = fuelLogs
      .filter(log => log.vehicleId === selectedVehicleId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

    if (!lastLog) return "Aucun plein précédent enregistré pour ce véhicule.";

    const timeAgo = formatDistanceToNow(new Date(lastLog.date), { addSuffix: true, locale: fr });
    const cost = lastLog.totalCost.toLocaleString('fr-FR', { style: 'currency', currency: 'TND' });

    return `Dernier plein : ${timeAgo} (${cost})`;
  }, [selectedVehicleId, fuelLogs]);

  const distanceAndCostInfo = useMemo(() => {
    if (!selectedVehicleId || !currentMileage) return null;

    const lastLog = fuelLogs
      .filter(log => log.vehicleId === selectedVehicleId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

    if (!lastLog || !lastLog.mileage) return null;

    const currentMileageNum = parseInt(currentMileage, 10);
    if (isNaN(currentMileageNum) || currentMileageNum <= lastLog.mileage) return null;

    const distanceTraveled = currentMileageNum - lastLog.mileage;
    const lastCost = lastLog.totalCost;

    return {
      distance: distanceTraveled,
      cost: lastCost
    };
  }, [selectedVehicleId, currentMileage, fuelLogs]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    if (!user) {
      toast({ title: 'Erreur', description: 'Vous devez être connecté.', variant: 'destructive' });
      setIsSubmitting(false);
      return;
    }

    const formData = new FormData(event.currentTarget);
    const data = {
      vehicleId: selectedVehicleId,
      totalCost: formData.get('totalCost'),
      mileage: formData.get('mileage'),
      gaugeLevelBefore: gaugeLevelBefore / 100, // Convert percentage to fraction
    };

    const validatedFields = QuickFuelLogSchema.safeParse(data);

    if (!validatedFields.success) {
      toast({
        title: 'Erreur de validation',
        description: validatedFields.error.issues[0].message,
        variant: 'destructive',
      });
      setIsSubmitting(false);
      return;
    }

    const { totalCost, mileage, vehicleId, gaugeLevelBefore: gaugeLevel } = validatedFields.data;

    const pricePerLiter = defaultPricePerLiter;
    const quantity = totalCost / pricePerLiter;

    try {
      await addFuelLog({
        vehicleId,
        date: new Date().toISOString().split('T')[0],
        mileage,
        quantity,
        pricePerLiter,
        totalCost,
        gaugeLevelBefore: gaugeLevel,
      }, user.uid);

      toast({
        title: 'Succès',
        description: `Plein de carburant ajouté pour le véhicule sélectionné.`,
      });
      onFuelLogAdded();
      (event.target as HTMLFormElement).reset();
      setSelectedVehicleId(vehicleId);
      setCurrentMileage('');
      setGaugeLevelBefore(12.5);

    } catch (error) {
      console.error("Error adding fuel log:", error);
      toast({
        title: 'Erreur',
        description: "Une erreur est survenue lors de l'ajout du plein.",
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (vehicles.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ajout Rapide de Carburant</CardTitle>
        <CardDescription>{lastFuelLogInfo}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="w-full">
              <label htmlFor="quick-vehicle-select" className="text-sm font-medium mb-2 block">Véhicule</label>
              <Select onValueChange={setSelectedVehicleId} value={selectedVehicleId} required>
                <SelectTrigger id="quick-vehicle-select">
                  <SelectValue placeholder="Sélectionnez un véhicule" />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.map(vehicle => (
                    <SelectItem key={vehicle.id} value={vehicle.id}>
                      {vehicle.brand} {vehicle.model} ({vehicle.licensePlate})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full">
              <label htmlFor="quick-mileage" className="text-sm font-medium mb-2 block">Kilométrage</label>
              <Input
                id="quick-mileage"
                name="mileage"
                type="number"
                placeholder="ex: 95000"
                required
                value={currentMileage}
                onChange={(e) => setCurrentMileage(e.target.value)}
              />
              {distanceAndCostInfo && (
                <p className="text-xs text-muted-foreground mt-1">
                  {distanceAndCostInfo.distance} km parcouru / {distanceAndCostInfo.cost.toLocaleString('fr-FR', { style: 'currency', currency: 'TND' })}
                </p>
              )}
            </div>
          </div>

          <div className="w-full">
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium">Niveau de Jauge (Avant le plein)</label>
              <span className="text-sm font-bold text-primary">{gaugeLevelBefore.toFixed(0)}%</span>
            </div>
            <Slider
              value={[gaugeLevelBefore]}
              onValueChange={(value) => setGaugeLevelBefore(value[0])}
              min={0}
              max={75}
              step={1}
              className="w-full"
              rangeClassName={gaugeLevelBefore < 13 ? "bg-red-600" : undefined}
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>Vide (0%)</span>
              <span>3/4 (75%)</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
            <div className="w-full">
              <label htmlFor="quick-cost" className="text-sm font-medium mb-2 block">Coût Total (TND)</label>
              <Input id="quick-cost" name="totalCost" type="number" step="0.001" placeholder="ex: 120" required />
            </div>
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Fuel className="mr-2" />}
              {isSubmitting ? 'Ajout...' : 'Ajouter'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
