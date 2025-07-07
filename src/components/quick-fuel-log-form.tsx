'use client';

import { useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { useToast } from '@/hooks/use-toast';
import { addFuelLog } from '@/lib/data';
import type { Vehicle } from '@/lib/types';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Fuel, Loader2 } from 'lucide-react';

const QuickFuelLogSchema = z.object({
  vehicleId: z.string().min(1, 'Veuillez sélectionner un véhicule.'),
  totalCost: z.coerce.number().gt(0, 'Le coût doit être supérieur à 0.'),
  mileage: z.coerce.number().min(0, 'Le kilométrage doit être positif.'),
});

const DEFAULT_PRICE_PER_LITER = 2.5; // A reasonable default, user can edit later

interface QuickFuelLogFormProps {
  vehicles: Vehicle[];
  onFuelLogAdded: () => void;
}

export function QuickFuelLogForm({ vehicles, onFuelLogAdded }: QuickFuelLogFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | undefined>(vehicles[0]?.id);

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
    
    const { totalCost, mileage, vehicleId } = validatedFields.data;

    const pricePerLiter = DEFAULT_PRICE_PER_LITER;
    const quantity = totalCost / pricePerLiter;
    
    try {
      await addFuelLog({
        vehicleId,
        date: new Date().toISOString().split('T')[0],
        mileage,
        quantity,
        pricePerLiter,
        totalCost,
      }, user.uid);

      toast({
        title: 'Succès',
        description: `Plein de carburant ajouté pour le véhicule sélectionné.`,
      });
      onFuelLogAdded();
      (event.target as HTMLFormElement).reset();
      // Keep the vehicle selected
      setSelectedVehicleId(vehicleId);

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
        <CardDescription>Enregistrez rapidement un plein en quelques clics.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-end gap-4">
          <div className="flex-1 w-full">
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
          <div className="flex-1 w-full">
            <label htmlFor="quick-mileage" className="text-sm font-medium mb-2 block">Kilométrage</label>
            <Input id="quick-mileage" name="mileage" type="number" placeholder="ex: 95000" required />
          </div>
          <div className="flex-1 w-full">
            <label htmlFor="quick-cost" className="text-sm font-medium mb-2 block">Coût Total (TND)</label>
            <Input id="quick-cost" name="totalCost" type="number" step="0.1" placeholder="ex: 120" required />
          </div>
          <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Fuel className="mr-2" />}
            {isSubmitting ? 'Ajout...' : 'Ajouter'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
