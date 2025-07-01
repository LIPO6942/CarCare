

'use client'

import { useState, useRef, type FormEvent } from 'react';
import { z } from "zod"
import { format } from "date-fns"
import { fr } from "date-fns/locale"

import type { Repair, Maintenance, FuelLog } from '@/lib/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { PlusCircle, Wrench, Fuel, Calendar, Bell, Sparkles, Loader2, GaugeCircle, Tag } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { addRepair, addMaintenance, addFuelLog } from '@/lib/data';
import { categorizeRepair } from '@/ai/flows/repair-categorization';
import { useAuth } from '@/context/auth-context';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface VehicleTabsProps {
    vehicleId: string;
    repairs: Repair[];
    maintenance: Maintenance[];
    fuelLogs: FuelLog[];
    onDataChange: () => void;
}

// Helper to safely format dates, handling Timestamps, strings, and invalid data.
const safeFormatDate = (dateInput: any, formatString: string = 'P') => {
  try {
    if (!dateInput) return 'N/A';

    let date;
    // Handle Firestore Timestamp object, which has a toDate() method
    if (typeof dateInput === 'object' && dateInput !== null && typeof (dateInput as any).toDate === 'function') {
      date = (dateInput as any).toDate();
    } else {
      // Handle ISO strings or other date string formats
      date = new Date(dateInput);
    }
    
    // Check if the created date is valid
    if (isNaN(date.getTime())) {
      console.warn("Date invalide détectée:", dateInput);
      return 'Date invalide';
    }
    
    return format(date, formatString, { locale: fr });
  } catch (error) {
    // This will catch any unexpected errors during date processing
    console.error("Erreur irrécupérable lors du formatage de la date:", dateInput, error);
    return 'Erreur date';
  }
};


// Helper to safely format numbers and avoid crashes
const safeFormatNumber = (numInput: any): string => {
    try {
        const num = Number(numInput);
        if (isNaN(num)) return 'N/A';
        return num.toLocaleString('fr-FR');
    } catch {
        return 'N/A';
    }
}

const safeFormatCurrency = (numInput: any): string => {
    try {
        const num = Number(numInput);
        if (isNaN(num)) return 'N/A';
        return num.toLocaleString('fr-FR', { style: 'currency', currency: 'TND' });
    } catch {
        return 'N/A';
    }
}


export function VehicleTabs({ vehicleId, repairs, maintenance, fuelLogs, onDataChange }: VehicleTabsProps) {
  
  return (
    <Tabs defaultValue="repairs">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="repairs"><Wrench className="mr-2 h-4 w-4" />Réparations</TabsTrigger>
        <TabsTrigger value="maintenance"><Calendar className="mr-2 h-4 w-4" />Entretien</TabsTrigger>
        <TabsTrigger value="fuel"><Fuel className="mr-2 h-4 w-4" />Carburant</TabsTrigger>
      </TabsList>
      
      <TabsContent value="repairs">
        <RepairsTab vehicleId={vehicleId} repairs={repairs} onDataChange={onDataChange} />
      </TabsContent>
      <TabsContent value="maintenance">
        <MaintenanceTab vehicleId={vehicleId} maintenance={maintenance} onDataChange={onDataChange} />
      </TabsContent>
      <TabsContent value="fuel">
        <FuelTab vehicleId={vehicleId} fuelLogs={fuelLogs} onDataChange={onDataChange} />
      </TabsContent>
    </Tabs>
  );
}

function RepairsTab({ vehicleId, repairs, onDataChange }: { vehicleId: string, repairs: Repair[], onDataChange: () => void }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
            <CardTitle>Journal des Réparations</CardTitle>
            <CardDescription>Historique de toutes les réparations effectuées.</CardDescription>
        </div>
        <AddRepairDialog vehicleId={vehicleId} onDataChange={onDataChange} />
      </CardHeader>
      <CardContent>
        {repairs.length > 0 ? (
            <div>
                {/* Mobile View */}
                <div className="md:hidden space-y-4">
                {repairs.map((repair) => (
                    <div key={repair.id} className="p-4 border rounded-lg bg-card text-card-foreground">
                        <div className="flex justify-between items-start">
                            <p className="font-bold text-lg">{repair.description || 'N/A'}</p>
                            <p className="font-bold text-lg text-right">{safeFormatCurrency(repair.cost)}</p>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1.5"><Calendar size={14} /> {safeFormatDate(repair.date)}</span>
                            <span className="flex items-center gap-1.5"><Tag size={14} /> {repair.category || 'N/A'}</span>
                            <span className="flex items-center gap-1.5"><GaugeCircle size={14} /> {safeFormatNumber(repair.mileage)} km</span>
                        </div>
                    </div>
                ))}
                </div>

                {/* Desktop View */}
                <div className="hidden md:block">
                    <Table>
                        <TableHeader>
                            <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Catégorie</TableHead>
                            <TableHead>Kilométrage</TableHead>
                            <TableHead className="text-right">Coût</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {repairs.map((repair) => {
                                try {
                                    return (
                                        <TableRow key={repair.id}>
                                            <TableCell>{safeFormatDate(repair.date)}</TableCell>
                                            <TableCell className="font-medium">{repair.description || 'N/A'}</TableCell>
                                            <TableCell>{repair.category || 'N/A'}</TableCell>
                                            <TableCell>{safeFormatNumber(repair.mileage)} km</TableCell>
                                            <TableCell className="text-right">{safeFormatCurrency(repair.cost)}</TableCell>
                                        </TableRow>
                                    );
                                } catch (e) {
                                    console.error("Failed to render repair row:", repair, e);
                                    return null;
                                }
                            })}
                        </TableBody>
                    </Table>
                </div>
            </div>
        ) : (
            <div className="text-center py-12 text-muted-foreground">
                <Wrench className="mx-auto h-12 w-12 mb-4" />
                <h3 className="text-lg font-semibold">Aucune réparation enregistrée</h3>
                <p className="mb-4">Cliquez sur "Ajouter une réparation" pour commencer.</p>
                <AddRepairDialog vehicleId={vehicleId} onDataChange={onDataChange} />
            </div>
        )}
      </CardContent>
    </Card>
  );
}

const RepairSchema = z.object({
  vehicleId: z.string(),
  date: z.string().min(1, 'La date est requise.'),
  mileage: z.coerce.number().min(0, 'Le kilométrage doit être positif.'),
  description: z.string().min(1, 'La description est requise.'),
  category: z.string().min(1, 'La catégorie est requise.'),
  cost: z.coerce.number().min(0, 'Le coût doit être positif.'),
});

function AddRepairDialog({ vehicleId, onDataChange }: { vehicleId: string, onDataChange: () => void }) {
    const [open, setOpen] = useState(false);
    const { toast } = useToast();
    const { user } = useAuth();
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('');
    const [isCategorizing, setIsCategorizing] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const formRef = useRef<HTMLFormElement>(null);

    const repairCategories = ["Moteur", "Freins", "Électrique", "Suspension", "Carrosserie", "Intérieur", "Échappement", "Transmission", "Pneus", "Autre"];

    const handleCategorize = async () => {
        if (!description) {
            toast({ title: 'Erreur', description: 'Veuillez d\'abord entrer une description.', variant: 'destructive'});
            return;
        }
        setIsCategorizing(true);
        try {
            const result = await categorizeRepair({ repairDetails: description });
            if (repairCategories.includes(result.category)) {
              setCategory(result.category);
              toast({ title: 'Catégorie suggérée!', description: `La catégorie a été définie sur "${result.category}".`});
            } else {
              setCategory("Autre");
              toast({ title: 'Catégorie suggérée!', description: `La catégorie suggérée "${result.category}" n'est pas dans la liste, "Autre" a été sélectionné.`});
            }
        } catch (error) {
            toast({ title: 'Erreur IA', description: 'Impossible de suggérer une catégorie.', variant: 'destructive'});
        } finally {
            setIsCategorizing(false);
        }
    }
    
    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setIsSubmitting(true);
        
        if (!user) {
            toast({ title: "Erreur", description: "Utilisateur non authentifié.", variant: 'destructive' });
            setIsSubmitting(false);
            return;
        }

        const formData = new FormData(event.currentTarget);
        if (!formData.get('category')) {
          formData.set('category', category);
        }

        const data = Object.fromEntries(formData.entries());
        const validatedFields = RepairSchema.safeParse(data);

        if (!validatedFields.success) {
            toast({ title: "Erreur de validation", description: validatedFields.error.issues[0].message, variant: 'destructive' });
            setIsSubmitting(false);
            return;
        }

        try {
            await addRepair(validatedFields.data, user.uid);
            toast({ title: "Succès", description: "Réparation ajoutée." });
            setOpen(false);
            setDescription('');
            setCategory('');
            formRef.current?.reset();
            onDataChange();
        } catch (error) {
            toast({ title: "Erreur", description: "Impossible d'ajouter la réparation.", variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    }

    if (!user) return null;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button><PlusCircle className="mr-2 h-4 w-4" />Ajouter une réparation</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Nouvelle Réparation</DialogTitle>
                    <DialogDescription>Ajoutez les détails de la réparation effectuée.</DialogDescription>
                </DialogHeader>
                <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
                     <input type="hidden" name="vehicleId" value={vehicleId} />
                     <div className="grid grid-cols-2 gap-4">
                        <Input name="date" type="date" required defaultValue={new Date().toISOString().split('T')[0]} />
                        <Input name="mileage" type="number" placeholder="Kilométrage" required />
                    </div>
                    <Textarea name="description" placeholder="Description de la réparation" required onChange={(e) => setDescription(e.target.value)} value={description} />
                    <div className="flex gap-2 items-center">
                        <div className="flex-1 space-y-2">
                            <Select name="category" required value={category} onValueChange={setCategory}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Sélectionnez une catégorie" />
                                </SelectTrigger>
                                <SelectContent>
                                    {repairCategories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button type="button" variant="outline" onClick={handleCategorize} disabled={isCategorizing}>
                           {isCategorizing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                            <span className="hidden sm:inline">{isCategorizing ? 'Analyse...' : 'Suggérer'}</span>
                        </Button>
                    </div>
                    <Input name="cost" type="number" step="0.01" placeholder="Coût (TND)" required />
                    <DialogFooter>
                        <DialogClose asChild><Button type="button" variant="secondary" disabled={isSubmitting}>Annuler</Button></DialogClose>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Enregistrer
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

function MaintenanceTab({ vehicleId, maintenance, onDataChange }: { vehicleId: string, maintenance: Maintenance[], onDataChange: () => void }) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>Suivi de l'Entretien</CardTitle>
                    <CardDescription>Gardez un oeil sur les entretiens passés et à venir.</CardDescription>
                </div>
                 <AddMaintenanceDialog vehicleId={vehicleId} onDataChange={onDataChange} />
            </CardHeader>
            <CardContent>
                {maintenance.length > 0 ? (
                <div>
                    {/* Mobile View */}
                    <div className="md:hidden space-y-4">
                        {maintenance.map((item) => {
                             try {
                                const formattedNextDate = safeFormatDate(item.nextDueDate, 'd MMM yyyy');
                                const nextMileage = Number(item.nextDueMileage);
                                const formattedNextMileage = isNaN(nextMileage) || nextMileage === 0 ? '' : `${nextMileage.toLocaleString('fr-FR')} km`;
                                let nextDueText = [formattedNextDate, formattedNextMileage].filter(v => v && v !== 'N/A' && v !== 'Date invalide').join(' / ');
                                if (!nextDueText) nextDueText = "N/A";
                                
                                return (
                                    <div key={item.id} className="p-4 border rounded-lg bg-card text-card-foreground">
                                        <div className="flex justify-between items-start">
                                            <p className="font-bold text-lg">{item.task || 'N/A'}</p>
                                            <p className="font-bold text-lg text-right">{safeFormatCurrency(item.cost)}</p>
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
                                            <span className="flex items-center gap-1.5"><Calendar size={14} /> {safeFormatDate(item.date)}</span>
                                            <span className="flex items-center gap-1.5"><GaugeCircle size={14} /> {safeFormatNumber(item.mileage)} km</span>
                                        </div>
                                        <div className="mt-2 pt-2 border-t text-sm text-muted-foreground">
                                           <span className="flex items-center gap-1.5"><span className="font-medium text-foreground">Prochain:</span> {nextDueText}</span>
                                        </div>
                                    </div>
                                )
                            } catch (e) {
                                console.error("Failed to render maintenance card:", item, e);
                                return null;
                            }
                        })}
                    </div>

                    {/* Desktop View */}
                    <div className="hidden md:block">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Tâche</TableHead>
                                <TableHead>Prochain Entretien</TableHead>
                                <TableHead className="text-right">Coût</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {maintenance.map((item) => {
                                   try {
                                        const formattedNextDate = safeFormatDate(item.nextDueDate, 'd MMM yyyy');
                                        const nextMileage = Number(item.nextDueMileage);
                                        const formattedNextMileage = isNaN(nextMileage) || nextMileage === 0 ? '' : `${nextMileage.toLocaleString('fr-FR')} km`;
                                        return (
                                        <TableRow key={item.id}>
                                            <TableCell>{safeFormatDate(item.date)}</TableCell>
                                            <TableCell className="font-medium">{item.task || 'N/A'}</TableCell>
                                            <TableCell>
                                                {formattedNextDate !== 'N/A' && formattedNextDate !== 'Date invalide' ? formattedNextDate : ''}
                                                {formattedNextDate !== 'N/A' && formattedNextDate !== 'Date invalide' && formattedNextMileage ? ' / ' : ''}
                                                {formattedNextMileage}
                                            </TableCell>
                                            <TableCell className="text-right">{safeFormatCurrency(item.cost)}</TableCell>
                                        </TableRow>
                                        );
                                    } catch (e) {
                                        console.error("Failed to render maintenance row:", item, e);
                                        return null;
                                    }
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </div>
                ) : (
                    <div className="text-center py-12 text-muted-foreground">
                        <Calendar className="mx-auto h-12 w-12 mb-4" />
                        <h3 className="text-lg font-semibold">Aucun entretien enregistré</h3>
                        <p className="mb-4">Ajoutez un entretien pour commencer le suivi.</p>
                        <AddMaintenanceDialog vehicleId={vehicleId} onDataChange={onDataChange} />
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

const MaintenanceSchema = z.object({
  vehicleId: z.string(),
  date: z.string().min(1, 'La date est requise.'),
  mileage: z.coerce.number().min(0, 'Le kilométrage doit être positif.'),
  task: z.string().min(1, 'La tâche est requise.'),
  cost: z.coerce.number().min(0, 'Le coût doit être positif.'),
  nextDueDate: z.string().optional(),
  nextDueMileage: z.coerce.number().optional(),
});

function AddMaintenanceDialog({ vehicleId, onDataChange }: { vehicleId: string, onDataChange: () => void }) {
    const [open, setOpen] = useState(false);
    const { toast } = useToast();
    const { user } = useAuth();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const formRef = useRef<HTMLFormElement>(null);
    const [selectedTask, setSelectedTask] = useState('');
    
    const maintenanceTasks = [
        "Vidange",
        "Visite technique",
        "Assurance",
        "Changement des pneus",
        "Contrôle des freins",
        "Rotation des pneus",
        "Changement de la batterie",
        "Entretien climatisation",
        "Autre",
    ];

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setIsSubmitting(true);
        
        if (!user) {
            toast({ title: "Erreur", description: "Utilisateur non authentifié.", variant: 'destructive' });
            setIsSubmitting(false);
            return;
        }
        
        const formData = new FormData(event.currentTarget);
        
        const finalTask = selectedTask === 'Autre' ? formData.get('customTask') as string : selectedTask;
        if (!finalTask || finalTask.trim() === '') {
            toast({ title: "Erreur", description: "Veuillez sélectionner ou préciser une tâche.", variant: 'destructive' });
            setIsSubmitting(false);
            return;
        }
        formData.set('task', finalTask);
        formData.delete('customTask');
        
        const rawData = Object.fromEntries(formData.entries());
        if (rawData.nextDueDate === '') delete rawData.nextDueDate;
        if (rawData.nextDueMileage === '') delete rawData.nextDueMileage;

        const validatedFields = MaintenanceSchema.safeParse(rawData);

        if (!validatedFields.success) {
            toast({ title: "Erreur de validation", description: validatedFields.error.issues[0].message, variant: 'destructive' });
            setIsSubmitting(false);
            return;
        }

        try {
            await addMaintenance(validatedFields.data, user.uid);
            toast({ title: "Succès", description: "Entretien ajouté." });
            setOpen(false);
            setSelectedTask('');
            formRef.current?.reset();
            onDataChange();
        } catch (error) {
            toast({ title: "Erreur", description: "Impossible d'ajouter l'entretien.", variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    }
    
    if (!user) return null;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button><PlusCircle className="mr-2 h-4 w-4" />Ajouter un entretien</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Nouvel Entretien</DialogTitle>
                    <DialogDescription>Ajoutez les détails de l'entretien réalisé.</DialogDescription>
                </DialogHeader>
                <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
                    <input type="hidden" name="vehicleId" value={vehicleId} />
                    <div className="space-y-2">
                        <label>Date & Kilométrage</label>
                        <div className="grid grid-cols-2 gap-4">
                            <Input name="date" type="date" required defaultValue={new Date().toISOString().split('T')[0]} />
                            <Input name="mileage" type="number" placeholder="Kilométrage" required />
                        </div>
                    </div>
                     <div className="space-y-2">
                        <label>Tâche d'entretien</label>
                        <Select onValueChange={setSelectedTask} value={selectedTask} required>
                            <SelectTrigger>
                                <SelectValue placeholder="Sélectionnez une tâche" />
                            </SelectTrigger>
                            <SelectContent>
                                {maintenanceTasks.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        {selectedTask === 'Autre' && (
                             <Input 
                                name="customTask" 
                                placeholder="Précisez la tâche" 
                                required 
                                className="mt-2"
                             />
                        )}
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="cost">Coût de l'entretien (TND)</label>
                        <Input id="cost" name="cost" type="number" step="0.01" placeholder="Coût (TND)" required />
                    </div>

                    <fieldset className="border p-4 rounded-md">
                        <legend className="text-sm font-medium px-1">Prochain entretien (Optionnel)</legend>
                        <div className="grid grid-cols-2 gap-4 pt-2">
                            <Input name="nextDueDate" type="date" />
                            <Input name="nextDueMileage" type="number" placeholder="Prochain kilométrage" />
                        </div>
                    </fieldset>
                    
                    <DialogFooter>
                        <DialogClose asChild><Button type="button" variant="secondary" disabled={isSubmitting}>Annuler</Button></DialogClose>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Enregistrer
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

const FuelLogSchema = z.object({
    vehicleId: z.string(),
    date: z.string().min(1, 'La date est requise.'),
    mileage: z.coerce.number().min(0, 'Le kilométrage doit être positif.'),
    quantity: z.coerce.number().gt(0, 'La quantité doit être supérieure à 0.'),
    pricePerLiter: z.coerce.number().gt(0, 'Le prix par litre doit être supérieur à 0.'),
    totalCost: z.coerce.number().min(0, 'Le coût total doit être positif.'),
});

function FuelTab({ vehicleId, fuelLogs, onDataChange }: { vehicleId: string, fuelLogs: FuelLog[], onDataChange: () => void }) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>Suivi du Carburant</CardTitle>
                    <CardDescription>Consultez l'historique de vos pleins de carburant.</CardDescription>
                </div>
                <AddFuelLogDialog vehicleId={vehicleId} onDataChange={onDataChange} />
            </CardHeader>
            <CardContent>
                {fuelLogs.length > 0 ? (
                <div>
                    {/* Mobile View */}
                    <div className="md:hidden space-y-4">
                        {fuelLogs.map((log) => {
                             try {
                                return (
                                    <div key={log.id} className="p-4 border rounded-lg bg-card text-card-foreground">
                                        <div className="flex justify-between items-start">
                                            <div className="flex items-center gap-2">
                                                <Fuel size={20} className="text-primary"/>
                                                <p className="font-bold text-lg">Plein de carburant</p>
                                            </div>
                                            <p className="font-bold text-lg text-right">{safeFormatCurrency(log.totalCost)}</p>
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
                                            <span className="flex items-center gap-1.5"><Calendar size={14} /> {safeFormatDate(log.date)}</span>
                                            <span className="flex items-center gap-1.5"><GaugeCircle size={14} /> {safeFormatNumber(log.mileage)} km</span>
                                            <span className="flex items-center gap-1.5">{safeFormatNumber(log.quantity)} L à {safeFormatCurrency(log.pricePerLiter)}/L</span>
                                        </div>
                                    </div>
                                )
                            } catch (e) {
                                console.error("Failed to render fuel log card:", log, e);
                                return null;
                            }
                        })}
                    </div>

                    {/* Desktop View */}
                    <div className="hidden md:block">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Kilométrage</TableHead>
                                <TableHead>Quantité</TableHead>
                                <TableHead>Prix/L</TableHead>
                                <TableHead className="text-right">Coût Total</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {fuelLogs.map((log) => {
                                    try {
                                        return (
                                            <TableRow key={log.id}>
                                                <TableCell>{safeFormatDate(log.date)}</TableCell>
                                                <TableCell>{safeFormatNumber(log.mileage)} km</TableCell>
                                                <TableCell>{safeFormatNumber(log.quantity)} L</TableCell>
                                                <TableCell>{safeFormatCurrency(log.pricePerLiter)}</TableCell>
                                                <TableCell className="text-right">{safeFormatCurrency(log.totalCost)}</TableCell>
                                            </TableRow>
                                        )
                                    } catch (e) {
                                        console.error("Failed to render fuel log row:", log, e);
                                        return null;
                                    }
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </div>
                ) : (
                    <div className="text-center py-12 text-muted-foreground">
                        <Fuel className="mx-auto h-12 w-12 mb-4" />
                        <h3 className="text-lg font-semibold">Aucun plein enregistré</h3>
                        <p className="mb-4">Ajoutez un plein pour suivre votre consommation.</p>
                        <AddFuelLogDialog vehicleId={vehicleId} onDataChange={onDataChange} />
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

function AddFuelLogDialog({ vehicleId, onDataChange }: { vehicleId: string, onDataChange: () => void }) {
    const [open, setOpen] = useState(false);
    const { toast } = useToast();
    const { user } = useAuth();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [quantity, setQuantity] = useState('');
    const [pricePerLiter, setPricePerLiter] = useState('2.5');
    const formRef = useRef<HTMLFormElement>(null);

    const totalCost = parseFloat(quantity) * parseFloat(pricePerLiter);
    const displayTotalCost = isNaN(totalCost) ? '' : totalCost.toFixed(2);
    
    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setIsSubmitting(true);

        if (!user) {
            toast({ title: "Erreur", description: "Utilisateur non authentifié.", variant: 'destructive' });
            setIsSubmitting(false);
            return;
        }

        const formData = new FormData(event.currentTarget);
        formData.set('totalCost', displayTotalCost);

        const validatedFields = FuelLogSchema.safeParse(Object.fromEntries(formData.entries()));

        if (!validatedFields.success) {
            toast({ title: "Erreur de validation", description: validatedFields.error.issues[0].message, variant: 'destructive' });
            setIsSubmitting(false);
            return;
        }
        
        try {
            await addFuelLog(validatedFields.data, user.uid);
            toast({ title: "Succès", description: "Plein de carburant ajouté." });
            setOpen(false);
            setQuantity('');
            setPricePerLiter('2.5');
            formRef.current?.reset();
            onDataChange();
        } catch (error) {
            toast({ title: "Erreur", description: "Impossible d'ajouter le plein.", variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    }
    
    if (!user) return null;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button><PlusCircle className="mr-2 h-4 w-4" />Ajouter un plein</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Nouveau Plein de Carburant</DialogTitle>
                    <DialogDescription>Ajoutez les détails de votre passage à la station.</DialogDescription>
                </DialogHeader>
                <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
                    <input type="hidden" name="vehicleId" value={vehicleId} />
                    <div className="grid grid-cols-2 gap-4">
                        <Input name="date" type="date" required defaultValue={new Date().toISOString().split('T')[0]} />
                        <Input name="mileage" type="number" placeholder="Kilométrage" required />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <Input name="quantity" type="number" step="0.01" placeholder="Quantité (L)" required value={quantity} onChange={e => setQuantity(e.target.value)} />
                        <Input name="pricePerLiter" type="number" step="0.001" placeholder="Prix / Litre" required value={pricePerLiter} onChange={e => setPricePerLiter(e.target.value)} />
                    </div>
                     <div className="space-y-2">
                        <label htmlFor="totalCost">Coût total (TND)</label>
                        <Input id="totalCost" name="totalCost" type="number" value={displayTotalCost} readOnly className="bg-muted" />
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button type="button" variant="secondary" disabled={isSubmitting}>Annuler</Button></DialogClose>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Enregistrer
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
