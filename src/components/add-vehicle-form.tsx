'use client';

import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { createVehicle } from '@/lib/actions';
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

function SubmitButton() {
    const { pending } = useFormStatus();
    return <Button type="submit" disabled={pending} className="w-full">{pending ? 'Ajout du véhicule...' : 'Ajouter le véhicule'}</Button>;
}

export function AddVehicleForm({ onFormSubmit }: { onFormSubmit: () => void }) {
  const { toast } = useToast();
  const { user } = useAuth();
  
  const formAction = async (formData: FormData) => {
    if (!user) {
        toast({ title: 'Erreur', description: 'Vous devez être connecté.', variant: 'destructive'});
        return;
    }
    // L'ID utilisateur est maintenant ajouté via un champ caché
    const result = await createVehicle(formData);
    if (result?.message) {
      toast({
        title: 'Erreur',
        description: result.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Succès',
        description: 'Le véhicule a été ajouté.',
      });
      onFormSubmit();
    }
  };

  if (!user) {
    // Ne rien afficher si l'utilisateur n'est pas encore chargé
    return null;
  }

  return (
    <form action={formAction} className="space-y-6 py-6">
      <input type="hidden" name="userId" value={user.uid} />
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
      <SubmitButton />
    </form>
  );
}
