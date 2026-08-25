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
    <form onSubmit={handleSubmit} className="space-y-6 py-6 max-h-[80vh] overflow-y-auto pr-4">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
                <label htmlFor="brand">Marque</label>
                <Input id="brand" name="brand" placeholder="ex: Peugeot" required />
            </div>
            <div className="space-y-2">
                <label htmlFor="model">Modèle</label>
                <Input id="model" name="model" placeholder="ex: 308" required />
            </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
                <label htmlFor="year">Année</label>
                <Input id="year" name="year" type="number" placeholder="ex: 2021" required />
            </div>
            <div className="space-y-2">
                <label htmlFor="fiscalPower">Puissance Fiscale (CV)</label>
                <Input id="fiscalPower" name="fiscalPower" type="number" placeholder="ex: 6" required />
            </div>
        </div>
        <div className="space-y-2">
            <label htmlFor="licensePlate">Plaque d'immatriculation</label>
            <Input id="licensePlate" name="licensePlate" placeholder="ex: 1234 TU 200" required />
        </div>
        <div className="space-y-2">
            <label htmlFor="fuelType">Type de carburant</label>
            <Select name="fuelType" defaultValue='Essence' required>
                <SelectTrigger>
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
      </div>
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : null}
        {isSubmitting ? 'Ajout du véhicule...' : 'Ajouter le véhicule'}
      </Button>
    </form>
  );
}