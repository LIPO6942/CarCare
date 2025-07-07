'use client';

import { useState, useMemo, type FormEvent, useEffect } from 'react';
import { z } from 'zod';
import { useAuth } from '@/context/auth-context';
import { useToast } from '@/hooks/use-toast';
import type { Vehicle } from '@/lib/types';
import { addMaintenance } from '@/lib/data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface AddInitialMaintenanceFormProps {
  vehicle: Vehicle | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFinished: () => void;
}

const InitialMaintenanceSchema = z.object({
  currentMileage: z.coerce.number().min(0, "Le kilométrage doit être positif.").optional(),
  lastTechnicalInspectionDate: z.string().optional(),
  lastInsurancePaymentDate: z.string().optional(),
  insuranceType: z.enum(['semestrielle', 'annuelle']).optional(),
  lastVignettePaymentDate: z.string().optional(),
  lastOilChangeDate: z.string().optional(),
}).refine(data => !(data.lastInsurancePaymentDate && !data.insuranceType), {
    message: "Le type d'assurance est requis si la date est fournie.",
    path: ['insuranceType'],
});


export function AddInitialMaintenanceForm({ vehicle, open, onOpenChange, onFinished }: AddInitialMaintenanceFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isTechInspectionEligible = useMemo(() => {
    if (!vehicle?.year) return true; // Default to visible if year is unknown
    const vehicleAge = new Date().getFullYear() - vehicle.year;
    return vehicleAge >= 4; // Eligible in the 5th year, so age must be >= 4
  }, [vehicle]);

  useEffect(() => {
    // Reset state when dialog is closed
    if (!open) {
      setIsSubmitting(false);
    }
  }, [open]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !vehicle) {
      toast({ title: 'Erreur', description: 'Aucun véhicule ou utilisateur sélectionné.', variant: 'destructive' });
      return;
    }
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const data = Object.fromEntries(formData.entries());

    // Clean empty fields so zod validation works on optional fields
    Object.keys(data).forEach(key => {
        if (data[key] === '') {
            delete data[key];
        }
    });

    const validatedFields = InitialMaintenanceSchema.safeParse(data);

    if (!validatedFields.success) {
      toast({
        title: 'Erreur de validation',
        description: validatedFields.error.issues[0].message,
        variant: 'destructive',
      });
      setIsSubmitting(false);
      return;
    }

    try {
        const { 
            currentMileage, 
            lastTechnicalInspectionDate, 
            lastInsurancePaymentDate, 
            insuranceType, 
            lastVignettePaymentDate, 
            lastOilChangeDate 
        } = validatedFields.data;

        const maintenancePromises: Promise<any>[] = [];

        if (lastTechnicalInspectionDate) {
            const nextDueDate = new Date(lastTechnicalInspectionDate);
            nextDueDate.setFullYear(nextDueDate.getFullYear() + 1); // Changed to 1 year for Tunisia
            maintenancePromises.push(addMaintenance({
                vehicleId: vehicle.id,
                date: lastTechnicalInspectionDate,
                mileage: currentMileage || 0,
                task: 'Visite technique',
                cost: 0,
                nextDueDate: nextDueDate.toISOString().split('T')[0],
            }, user.uid));
        }

        if (lastInsurancePaymentDate && insuranceType) {
            const nextDueDate = new Date(lastInsurancePaymentDate);
            nextDueDate.setMonth(nextDueDate.getMonth() + (insuranceType === 'annuelle' ? 12 : 6));
             maintenancePromises.push(addMaintenance({
                vehicleId: vehicle.id,
                date: lastInsurancePaymentDate,
                mileage: currentMileage || 0,
                task: 'Paiement Assurance',
                cost: 0,
                nextDueDate: nextDueDate.toISOString().split('T')[0],
            }, user.uid));
        }

        if (lastVignettePaymentDate) {
            const nextDueDate = new Date(lastVignettePaymentDate);
            nextDueDate.setFullYear(nextDueDate.getFullYear() + 1);
            maintenancePromises.push(addMaintenance({
                vehicleId: vehicle.id,
                date: lastVignettePaymentDate,
                mileage: currentMileage || 0,
                task: 'Vignette',
                cost: 0,
                nextDueDate: nextDueDate.toISOString().split('T')[0],
            }, user.uid));
        }

        if (lastOilChangeDate && currentMileage) {
            maintenancePromises.push(addMaintenance({
                vehicleId: vehicle.id,
                date: lastOilChangeDate,
                mileage: currentMileage,
                task: 'Vidange',
                cost: 0,
                nextDueMileage: currentMileage + 10000,
            }, user.uid));
        }

        await Promise.all(maintenancePromises);
      
        toast({
            title: 'Succès',
            description: 'Les informations d\'entretien initiales ont été enregistrées.',
        });
        onFinished();

    } catch (error) {
        console.error("Error setting initial maintenance:", error);
        toast({
            title: 'Erreur',
            description: "Une erreur est survenue lors de l'enregistrement.",
            variant: 'destructive',
        });
    } finally {
        setIsSubmitting(false);
    }
  };

  if (!vehicle) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg flex flex-col max-h-[90vh]">
            <DialogHeader>
                <DialogTitle>Ajouter les dates d'entretien pour {vehicle.brand} {vehicle.model}</DialogTitle>
                <DialogDescription>
                    Ces informations permettront de calculer vos prochaines échéances. Vous pouvez ignorer cette étape.
                </DialogDescription>
            </DialogHeader>

            <form id="initial-maintenance-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
                <div className="px-6 py-4 space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="currentMileage">Kilométrage Actuel</Label>
                        <Input id="currentMileage" name="currentMileage" type="number" placeholder="ex: 85000" />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="lastOilChangeDate">Date du dernier vidange</Label>
                        <Input id="lastOilChangeDate" name="lastOilChangeDate" type="date" />
                    </div>
                    {isTechInspectionEligible && (
                        <div className="space-y-2">
                            <Label htmlFor="lastTechnicalInspectionDate">Date de la dernière visite technique</Label>
                            <Input id="lastTechnicalInspectionDate" name="lastTechnicalInspectionDate" type="date" />
                        </div>
                    )}
                     <div className="space-y-2">
                        <Label>Dernier paiement d'assurance</Label>
                        <div className="grid grid-cols-2 gap-4">
                             <Input name="lastInsurancePaymentDate" type="date" />
                             <Select name="insuranceType">
                                <SelectTrigger>
                                    <SelectValue placeholder="Type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="semestrielle">Semestrielle</SelectItem>
                                    <SelectItem value="annuelle">Annuelle</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="lastVignettePaymentDate">Date du dernier paiement de la vignette</Label>
                        <Input id="lastVignettePaymentDate" name="lastVignettePaymentDate" type="date" />
                    </div>
                </div>
            </form>
            
            <DialogFooter className="p-6 pt-4 border-t">
                <Button type="button" variant="ghost" onClick={onFinished} disabled={isSubmitting}>
                    Ignorer
                </Button>
                <Button type="submit" form="initial-maintenance-form" disabled={isSubmitting} className="w-full sm:w-auto">
                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {isSubmitting ? 'Enregistrement...' : 'Enregistrer les dates'}
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
  );
}
