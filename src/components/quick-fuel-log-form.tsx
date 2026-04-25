'use client';

import { useState, useMemo, useEffect } from 'react';
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
import { Fuel, Loader2, LineChart } from 'lucide-react';
import { useRef } from 'react';
import { MonthlyFuelChartModal } from '@/components/monthly-fuel-chart-modal';
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
  onOpenVehicleFuel?: (vehicleId: string) => void;
}

export function QuickFuelLogForm({ vehicles, fuelLogs, onFuelLogAdded, onOpenVehicleFuel }: QuickFuelLogFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | undefined>(vehicles[0]?.id);
  const [currentMileage, setCurrentMileage] = useState<string>('');
  const [gaugeLevelBefore, setGaugeLevelBefore] = useState<number>(12.5);
  const [isChartModalOpen, setIsChartModalOpen] = useState(false);

  const handleOpenFuelTracking = () => {
    if (selectedVehicleId && onOpenVehicleFuel) {
      onOpenVehicleFuel(selectedVehicleId);
    }
  };

  const monthlyFuelLogs = useMemo(() => {
    if (!selectedVehicleId) return [];
    const monthlyData: { [key: string]: { totalCost: number, totalQuantity: number, date: Date } } = {};
    const vehicleFuelLogs = fuelLogs.filter(log => log.vehicleId === selectedVehicleId);
    
    vehicleFuelLogs.forEach(log => {
        try {
            const date = new Date(log.date);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = { totalCost: 0, totalQuantity: 0, date: date };
            }
            monthlyData[monthKey].totalCost += log.totalCost;
            monthlyData[monthKey].totalQuantity += log.quantity;
        } catch (e) {
            console.error("Invalid date for fuel log", log);
        }
    });

    return Object.values(monthlyData).sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [fuelLogs, selectedVehicleId]);

  // Assist user with mileage prefix
  useEffect(() => {
    if (!selectedVehicleId) return;

    const lastLog = fuelLogs
      .filter(log => log.vehicleId === selectedVehicleId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

    if (lastLog && lastLog.mileage) {
      let mileageToUse = lastLog.mileage;

      // Smart rounding: Adjusted to 70% threshold as a "middle ground"
      // because the user might just be adding a small amount of fuel.
      if (lastLog.mileage >= 100000 && lastLog.mileage % 1000 >= 700) {
        mileageToUse = Math.ceil(lastLog.mileage / 1000) * 1000;
      } else if (lastLog.mileage >= 10000 && lastLog.mileage % 100 >= 70) {
        mileageToUse = Math.ceil(lastLog.mileage / 100) * 100;
      } else if (lastLog.mileage >= 1000 && lastLog.mileage % 10 >= 7) {
        mileageToUse = Math.ceil(lastLog.mileage / 10) * 10;
      }

      const mileageStr = mileageToUse.toString();
      let prefix = '';

      if (mileageToUse >= 100000) {
        prefix = mileageStr.substring(0, 3);
      } else if (mileageToUse >= 10000) {
        prefix = mileageStr.substring(0, 2);
      } else if (mileageToUse >= 1000) {
        prefix = mileageStr.substring(0, 1);
      }

      setCurrentMileage(prefix);
    } else {
      setCurrentMileage('');
    }
  }, [selectedVehicleId, fuelLogs]);

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
    <Card className="shadow-sm">
      <CardHeader className="pb-4 pt-6 px-6">
        <div className="flex justify-between items-center flex-wrap gap-2">
          <CardTitle className="text-xl flex items-center gap-1 flex-wrap">
            <span>Ajout rapide</span>
            <button
              type="button"
              onClick={handleOpenFuelTracking}
              className="text-primary hover:underline decoration-primary/30 underline-offset-4 transition-all hover:text-primary/80 active:scale-95 px-1 rounded hover:bg-primary/5"
            >
              carburant
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10 ml-1"
              onClick={() => setIsChartModalOpen(true)}
              title="Voir l'évolution mensuelle"
            >
              <LineChart className="h-5 w-5" />
            </Button>
          </CardTitle>
          <span className="text-xs text-muted-foreground">{lastFuelLogInfo}</span>
        </div>
      </CardHeader>
      <CardContent className="px-6 pb-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-5">
            <div className="w-full">
              <label htmlFor="quick-vehicle-select" className="text-sm font-medium mb-2 block">Véhicule</label>
              <Select onValueChange={setSelectedVehicleId} value={selectedVehicleId} required>
                <SelectTrigger id="quick-vehicle-select" className="h-10 text-sm">
                  <SelectValue placeholder="Sélectionnez" />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.map(vehicle => (
                    <SelectItem key={vehicle.id} value={vehicle.id} className="text-sm">
                      {vehicle.brand} {vehicle.model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full">
              <label htmlFor="quick-mileage" className="text-sm font-medium mb-2 block">Km</label>
              <Input
                id="quick-mileage"
                name="mileage"
                type="number"
                placeholder="ex: 95000"
                required
                value={currentMileage}
                onChange={(e) => setCurrentMileage(e.target.value)}
                className="h-10 text-sm"
              />
              {distanceAndCostInfo && (
                <p className="text-xs text-muted-foreground mt-1 truncate">
                  +{distanceAndCostInfo.distance} km / {distanceAndCostInfo.cost.toFixed(0)} Dt
                </p>
              )}
            </div>
          </div>

          <div className="w-full bg-muted/30 p-4 rounded-md">
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium">Jauge (Avant)</label>
              <span className="text-sm font-bold text-primary">{gaugeLevelBefore.toFixed(0)}%</span>
            </div>
            <Slider
              value={[gaugeLevelBefore]}
              onValueChange={(value) => setGaugeLevelBefore(value[0])}
              min={0}
              max={75}
              step={1}
              className="w-full py-2"
              rangeClassName={gaugeLevelBefore < 13 ? "bg-red-600" : undefined}
            />
          </div>

          <div className="grid grid-cols-2 gap-5 items-end">
            <div className="w-full">
              <label htmlFor="quick-cost" className="text-sm font-medium mb-2 block">Coût (TND)</label>
              <Input id="quick-cost" name="totalCost" type="number" step="0.001" placeholder="ex: 50" required className="h-10 text-sm font-bold" />
            </div>
            <Button type="submit" disabled={isSubmitting} className="w-full h-10 text-sm" size="sm">
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Fuel className="mr-2 h-4 w-4" />}
              {isSubmitting ? '...' : 'Ajouter'}
            </Button>
          </div>
        </form>
      </CardContent>
      {selectedVehicleId && (
        <MonthlyFuelChartModal 
          open={isChartModalOpen} 
          onOpenChange={setIsChartModalOpen} 
          monthlyFuelLogs={monthlyFuelLogs}
          vehicleName={`${vehicles.find(v => v.id === selectedVehicleId)?.brand || ''} ${vehicles.find(v => v.id === selectedVehicleId)?.model || ''}`}
        />
      )}
    </Card>
  );
}
