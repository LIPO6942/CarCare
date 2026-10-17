'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/auth-context';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { addVehicle, updateVehicle } from '@/lib/data';
import type { Vehicle } from '@/lib/types';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { saveVehicleImage } from '@/lib/local-db';
import { generateVehicleImage } from '@/ai/flows/generate-vehicle-image';

const VehicleSchema = z.object({
  brand: z.string().min(1, { message: "La marque est requise" }),
  model: z.string().min(1, { message: "Le modèle est requis" }),
  year: z.coerce.number().min(1900, { message: "Année invalide" }).max(new Date().getFullYear() + 1, { message: "Année invalide" }),
  licensePlate: z.string().min(1, { message: "La immatriculation est requise" }),
  fuelType: z.enum(['Essence', 'Diesel', 'Électrique', 'Hybride']),
  fiscalPower: z.coerce.number().min(1, { message: "Puissance fiscale invalide" }).optional(),
  estimatedTankCapacity: z.coerce.number().min(20, { message: "Capacité invalide" }).max(200, { message: "Capacité trop élevée" }).optional(),
  vin: z.string().optional(),
});

type VehicleFormData = z.infer<typeof VehicleSchema>;

interface AddVehicleFormProps {
  onFormSubmit: (newVehicle: Vehicle) => void;
  onCancel?: () => void;
}

export function AddVehicleForm({ onFormSubmit, onCancel }: AddVehicleFormProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<Partial<VehicleFormData>>({
    brand: '',
    model: '',
    year: new Date().getFullYear(),
    licensePlate: '',
    fuelType: 'Essence',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    if (!user) {
      toast({
        title: 'Erreur',
        description: 'Utilisateur non connecté.',
        variant: 'destructive',
      });
      setIsSubmitting(false);
      return;
    }

    const vehicleData = {
      ...formData,
      fiscalPower: formData.fiscalPower ? Number(formData.fiscalPower) : undefined,
      estimatedTankCapacity: formData.estimatedTankCapacity ? Number(formData.estimatedTankCapacity) : undefined,
    };

    const validatedFields = VehicleSchema.safeParse(vehicleData);

    if (!validatedFields.success) {
      const firstError = validatedFields.error.issues[0];
      toast({
        title: 'Erreur de validation',
        description: `${firstError.path[0]}: ${firstError.message}`,
        variant: 'destructive',
      });
      setIsSubmitting(false);
      return;
    }

    try {
        const newVehicle = await addVehicle(validatedFields.data, user.uid);
        
        try {
            const imageUrl = await generateVehicleImage({ 
                brand: validatedFields.data.brand, 
                model: validatedFields.data.model 
            });
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            await saveVehicleImage(newVehicle.id, blob);
            await updateVehicle(newVehicle.id, { imageUrl });
            newVehicle.imageUrl = imageUrl;
        } catch (aiError) {
            console.warn("AI image generation/saving failed, skipping.", aiError);
        }
        
        toast({
          title: 'Succès',
          description: 'Le véhicule a été ajouté.',
        });
        onFormSubmit(newVehicle);

    } catch (error) {
        console.error("Firebase Error in addVehicle call:", error);
        toast({
            title: 'Erreur',
            description: "Erreur de permission lors de la création du véhicule. Veuillez vérifier que vos règles de sécurité Firestore sont correctement configurées et publiées.",
            variant: 'destructive',
        });
    } finally {
        setIsSubmitting(false);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 py-2">
      <div className="space-y-5">
        {/* Section 1: Identification */}
        <div className="rounded-xl border bg-card/60 p-4 sm:p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold text-foreground/90 uppercase tracking-wider flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-blue-500"></span>
            Identification du véhicule
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
            <div className="space-y-1.5">
              <label htmlFor="brand" className="text-xs sm:text-sm font-medium text-foreground/90">
                Marque <span className="text-red-500">*</span>
              </label>
              <Input
                id="brand"
                name="brand"
                value={formData.brand || ''}
                onChange={handleChange}
                placeholder="ex: Peugeot, Volkswagen..."
                required
                className="h-10 sm:h-11 text-sm bg-background/80"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="model" className="text-xs sm:text-sm font-medium text-foreground/90">
                Modèle <span className="text-red-500">*</span>
              </label>
              <Input
                id="model"
                name="model"
                value={formData.model || ''}
                onChange={handleChange}
                placeholder="ex: 208, Golf, Clio..."
                required
                className="h-10 sm:h-11 text-sm bg-background/80"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
            <div className="space-y-1.5">
              <label htmlFor="year" className="text-xs sm:text-sm font-medium text-foreground/90">
                Année de mise en circulation <span className="text-red-500">*</span>
              </label>
              <Input
                id="year"
                name="year"
                type="number"
                value={formData.year || ''}
                onChange={handleChange}
                placeholder="ex: 2021"
                required
                className="h-10 sm:h-11 text-sm bg-background/80"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="licensePlate" className="text-xs sm:text-sm font-medium text-foreground/90">
                Plaque d'immatriculation <span className="text-red-500">*</span>
              </label>
              <Input
                id="licensePlate"
                name="licensePlate"
                value={formData.licensePlate || ''}
                onChange={handleChange}
                placeholder="ex: 1234 TU 200"
                required
                className="h-10 sm:h-11 text-sm font-mono uppercase bg-background/80"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Spécifications & Carburant */}
        <div className="rounded-xl border bg-card/60 p-4 sm:p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold text-foreground/90 uppercase tracking-wider flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
            Caractéristiques & Carburant
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
            <div className="space-y-1.5">
              <label htmlFor="fuelType" className="text-xs sm:text-sm font-medium text-foreground/90">
                Type de carburant <span className="text-red-500">*</span>
              </label>
              <Select
                value={formData.fuelType || 'Essence'}
                onValueChange={(val) => handleSelectChange('fuelType', val)}
              >
                <SelectTrigger className="h-10 sm:h-11 text-sm bg-background/80">
                  <SelectValue placeholder="Sélectionnez un type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Essence">Essence</SelectItem>
                  <SelectItem value="Diesel">Diesel</SelectItem>
                  <SelectItem value="Électrique">Électrique</SelectItem>
                  <SelectItem value="Hybride">Hybride</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="fiscalPower" className="text-xs sm:text-sm font-medium text-foreground/90">
                Puissance Fiscale (CV)
              </label>
              <Input
                id="fiscalPower"
                name="fiscalPower"
                type="number"
                value={formData.fiscalPower || ''}
                onChange={handleChange}
                placeholder="ex: 6"
                className="h-10 sm:h-11 text-sm bg-background/80"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
            <div className="space-y-1.5">
              <label htmlFor="estimatedTankCapacity" className="text-xs sm:text-sm font-medium text-foreground/90">
                Capacité réservoir (L) <span className="text-xs text-muted-foreground font-normal">(Optionnel)</span>
              </label>
              <Input
                id="estimatedTankCapacity"
                name="estimatedTankCapacity"
                type="number"
                value={formData.estimatedTankCapacity || ''}
                onChange={handleChange}
                placeholder="ex: 50"
                min="20"
                max="150"
                className="h-10 sm:h-11 text-sm bg-background/80"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="vin" className="text-xs sm:text-sm font-medium text-foreground/90">
                Numéro de châssis / VIN <span className="text-xs text-muted-foreground font-normal">(Optionnel)</span>
              </label>
              <Input
                id="vin"
                name="vin"
                value={formData.vin || ''}
                onChange={handleChange}
                placeholder="ex: VF3XXXXXXXXXXXXXX"
                className="h-10 sm:h-11 text-sm font-mono uppercase bg-background/80"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-3 pt-3 border-t">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="w-full sm:w-auto h-10 sm:h-11 px-6 text-sm"
          >
            Annuler
          </Button>
        )}
        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full sm:w-auto h-10 sm:h-11 px-8 font-semibold text-sm shadow-md"
        >
          {isSubmitting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          {isSubmitting ? 'Ajout du véhicule...' : 'Ajouter le véhicule'}
        </Button>
      </div>
    </form>
  );
}