'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { addVehicle } from '@/lib/data';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';

const VehicleSchema = z.object({
  brand: z.string().min(1, 'La marque est requise.'),
  model: z.string().min(1, 'Le modèle est requis.'),
  year: z.coerce.number().min(1900, 'Année invalide.').max(new Date().getFullYear() + 1, 'Année invalide.'),
  licensePlate: z.string().min(1, 'La plaque d\'immatriculation est requise.'),
  fuelType: z.enum(['Essence', 'Diesel', 'Électrique', 'Hybride']),
});


export function AddVehicleForm({ onFormSubmit }: { onFormSubmit: () => void }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    if (!user) {
        toast({ title: 'Erreur', description: 'Vous devez être connecté.', variant: 'destructive'});
        setIsSubmitting(false);
        return;
    }
    
    const formData = new FormData(event.currentTarget);
    const vehicleData = Object.fromEntries(formData.entries());

    const validatedFields = VehicleSchema.safeParse(vehicleData);

    if (!validatedFields.success) {
      const firstError = validatedFields.error.issues[0];
      toast({
        title: 'Erreur de validation',
        description: `Veuillez corriger le champ: ${firstError.path[0]}.`,
        variant: 'destructive',
      });
      setIsSubmitting(false);
      return;
    }

    try {
        const brandDomain = validatedFields.data.brand.toLowerCase().replace(/ /g, '') + '.com';
        const logoUrl = `https://logo.clearbit.com/${brandDomain}`;

        await addVehicle({ ...validatedFields.data, imageUrl: logoUrl }, user.uid);
        
        toast({
          title: 'Succès',
          description: 'Le véhicule a été ajouté.',
        });
        router.refresh();
        onFormSubmit();

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
    <form onSubmit={handleSubmit} className="space-y-6 py-6">
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
        <div className="space-y-2">
            <label htmlFor="year">Année</label>
            <Input id="year" name="year" type="number" placeholder="ex: 2021" required />
        </div>
        <div className="space-y-2">
            <label htmlFor="licensePlate">Plaque d'immatriculation</label>
            <Input id="licensePlate" name="licensePlate" placeholder="ex: AA-123-BB" required />
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
