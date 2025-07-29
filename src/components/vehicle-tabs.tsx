'use client'

import { useState, useRef, type FormEvent, useEffect, useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import { z } from "zod"
import { format } from "date-fns"
import { fr } from "date-fns/locale"

import type { Repair, Maintenance, FuelLog, Vehicle, Document } from '@/lib/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { PlusCircle, Wrench, Fuel, Calendar, Sparkles, Loader2, GaugeCircle, History, Trash2, Edit, MoreHorizontal } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { 
    addRepair, updateRepair, deleteRepair, 
    addMaintenance, updateMaintenance, deleteMaintenance,
    addFuelLog, updateFuelLog, deleteFuelLog,
} from '@/lib/data';
import { categorizeRepair } from '@/ai/flows/repair-categorization';
import { useAuth } from '@/context/auth-context';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { DialogFooter } from './ui/dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';

interface VehicleTabsProps {
    vehicle: Vehicle;
    repairs: Repair[];
    maintenance: Maintenance[];
    fuelLogs: FuelLog[];
    onDataChange: () => void;
    initialTab?: string;
}

const safeFormatDate = (dateInput: any, formatString: string = 'P') => {
  try {
    if (!dateInput) return 'N/A';
    let date;
    if (typeof dateInput === 'object' && dateInput !== null && typeof (dateInput as any).toDate === 'function') {
      date = (dateInput as any).toDate();
    } else {
      date = new Date(dateInput);
    }
    if (isNaN(date.getTime())) {
      return 'Date invalide';
    }
    return format(date, formatString, { locale: fr });
  } catch (error) {
    return 'Erreur date';
  }
};

const safeFormatNumber = (numInput: any): string => {
    try {
        const num = Number(numInput);
        if (isNaN(num)) return '0';
        return num.toLocaleString('fr-FR');
    } catch {
        return '0';
    }
}

const safeFormatCurrency = (numInput: any): string => {
    try {
        const num = Number(numInput);
        if (isNaN(num)) return (0).toLocaleString('fr-FR', { style: 'currency', currency: 'TND' });
        return num.toLocaleString('fr-FR', { style: 'currency', currency: 'TND' });
    } catch {
        return (0).toLocaleString('fr-FR', { style: 'currency', currency: 'TND' });
    }
}


export function VehicleTabs({ vehicle, repairs, maintenance, fuelLogs, onDataChange, initialTab }: VehicleTabsProps) {
  
  const monthlyFuelLogs = useMemo(() => {
    const monthlyData: { [key: string]: { totalCost: number, totalQuantity: number, date: Date } } = {};
    fuelLogs.forEach(log => {
      try {
        const date = new Date(log.date);
        const monthKey = format(date, 'yyyy-MM');
        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = { totalCost: 0, totalQuantity: 0, date: date };
        }
        monthlyData[monthKey].totalCost += log.totalCost;
        monthlyData[monthKey].totalQuantity += log.quantity;
      } catch (e) {
        console.error("Invalid date for fuel log", log);
      }
    });

    return Object.values(monthlyData).sort((a,b) => b.date.getTime() - a.date.getTime());
  }, [fuelLogs]);

  return (
    <Tabs defaultValue={initialTab || 'history'} className="w-full">
      <div className="w-full overflow-x-auto pb-1 no-scrollbar">
        <TabsList>
            <TabsTrigger value="history"><History className="mr-2 h-4 w-4" />Historique</TabsTrigger>
            <TabsTrigger value="repairs"><Wrench className="mr-2 h-4 w-4" />Réparations</TabsTrigger>
            <TabsTrigger value="maintenance"><Calendar className="mr-2 h-4 w-4" />Entretien</TabsTrigger>
            <TabsTrigger value="fuel"><Fuel className="mr-2 h-4 w-4" />Carburant</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="history">
        <HistoryTab repairs={repairs} maintenance={maintenance} monthlyFuelLogs={monthlyFuelLogs} />
      </TabsContent>
      <TabsContent value="repairs">
        <RepairsTab vehicle={vehicle} repairs={repairs} onDataChange={onDataChange} />
      </TabsContent>
      <TabsContent value="maintenance">
        <MaintenanceTab vehicle={vehicle} maintenance={maintenance} onDataChange={onDataChange} />
      </TabsContent>
      <TabsContent value="fuel">
        <FuelTab vehicle={vehicle} fuelLogs={fuelLogs} onDataChange={onDataChange} />
      </TabsContent>
    </Tabs>
  );
}

// --- SHARED COMPONENTS ---

function ActionMenu({ onEdit, onDelete }: { onEdit: () => void, onDelete: () => void }) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                    <span className="sr-only">Ouvrir le menu</span>
                    <MoreHorizontal className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={onEdit}>
                    <Edit className="mr-2 h-4 w-4" />
                    <span>Modifier</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
                    <Trash2 className="mr-2 h-4 w-4" />
                    <span>Supprimer</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function DeleteConfirmationDialog({ open, onOpenChange, onConfirm, isDeleting, title, description }: { open: boolean, onOpenChange: (open: boolean) => void, onConfirm: () => void, isDeleting: boolean, title: string, description: string }) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>{description}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction
                        disabled={isDeleting}
                        onClick={onConfirm}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                        {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {isDeleting ? 'Suppression...' : 'Supprimer'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}


// --- HISTORY TAB ---

function HistoryTab({ repairs, maintenance, monthlyFuelLogs }: { repairs: Repair[], maintenance: Maintenance[], monthlyFuelLogs: any[] }) {
    const hasHistory = repairs.length > 0 || maintenance.length > 0 || monthlyFuelLogs.length > 0;

    if (!hasHistory) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Historique Complet</CardTitle>
                    <CardDescription>Aucun événement enregistré pour ce véhicule.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="text-center py-12 text-muted-foreground">
                        <History className="mx-auto h-12 w-12 mb-4" />
                        <h3 className="text-lg font-semibold">L'historique est vide</h3>
                        <p>Ajoutez une réparation, un entretien ou un plein pour commencer.</p>
                    </div>
                </CardContent>
            </Card>
        );
    }
  
  return (
    <Card>
        <CardHeader>
            <CardTitle>Historique Complet</CardTitle>
            <CardDescription>Toutes les actions effectuées sur ce véhicule, regroupées par catégorie.</CardDescription>
        </CardHeader>
        <CardContent>
            <Accordion type="multiple" className="w-full space-y-2" defaultValue={['repairs', 'maintenance', 'fuel']}>
                {repairs.length > 0 && (
                    <AccordionItem value="repairs">
                        <AccordionTrigger className="text-base font-semibold bg-muted/50 px-4 rounded-md">
                            <div className="flex items-center gap-3">
                                <Wrench className="h-5 w-5 text-[hsl(var(--chart-1))]" />
                                Réparations ({repairs.length})
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="pt-2">
                             <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead className="text-right">Coût</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {repairs.map(item => (
                                        <TableRow key={`hist-repair-${item.id}`}>
                                            <TableCell>{safeFormatDate(item.date)}</TableCell>
                                            <TableCell>{item.description}</TableCell>
                                            <TableCell className="text-right">{safeFormatCurrency(item.cost)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </AccordionContent>
                    </AccordionItem>
                )}
                 {maintenance.length > 0 && (
                    <AccordionItem value="maintenance">
                        <AccordionTrigger className="text-base font-semibold bg-muted/50 px-4 rounded-md">
                            <div className="flex items-center gap-3">
                                <Calendar className="h-5 w-5 text-[hsl(var(--chart-2))]" />
                                Entretien ({maintenance.length})
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="pt-2">
                             <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Tâche</TableHead>
                                        <TableHead className="text-right">Coût</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {maintenance.map(item => (
                                        <TableRow key={`hist-maint-${item.id}`}>
                                            <TableCell>{safeFormatDate(item.date)}</TableCell>
                                            <TableCell>{item.task}</TableCell>
                                            <TableCell className="text-right">{safeFormatCurrency(item.cost)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </AccordionContent>
                    </AccordionItem>
                 )}
                 {monthlyFuelLogs.length > 0 && (
                     <AccordionItem value="fuel">
                        <AccordionTrigger className="text-base font-semibold bg-muted/50 px-4 rounded-md">
                             <div className="flex items-center gap-3">
                                <Fuel className="h-5 w-5 text-[hsl(var(--chart-3))]" />
                                Carburant
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="pt-2">
                             <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Mois</TableHead>
                                        <TableHead>Quantité</TableHead>
                                        <TableHead className="text-right">Coût Total</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {monthlyFuelLogs.map(item => (
                                        <TableRow key={`hist-fuel-${item.date.toISOString()}`}>
                                            <TableCell>{(format(item.date, 'LLLL yyyy', { locale: fr })).charAt(0).toUpperCase() + (format(item.date, 'LLLL yyyy', { locale: fr })).slice(1)}</TableCell>
                                            <TableCell>{item.totalQuantity.toFixed(2)} L</TableCell>
                                            <TableCell className="text-right">{safeFormatCurrency(item.totalCost)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </AccordionContent>
                    </AccordionItem>
                 )}
            </Accordion>
        </CardContent>
    </Card>
  );
}


// --- REPAIRS TAB ---

function RepairsTab({ vehicle, repairs, onDataChange }: { vehicle: Vehicle, repairs: Repair[], onDataChange: () => void }) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [itemToEdit, setItemToEdit] = useState<Repair | null>(null);
  const [itemToDelete, setItemToDelete] = useState<Repair | null>(null);
  const { toast } = useToast();

  const handleEdit = (repair: Repair) => {
    setItemToEdit(repair);
    setIsDialogOpen(true);
  };
  
  const handleAdd = () => {
    setItemToEdit(null);
    setIsDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    try {
        await deleteRepair(itemToDelete.id);
        toast({ title: 'Succès', description: 'Réparation supprimée.' });
        onDataChange();
        setItemToDelete(null);
    } catch (error) {
        toast({ title: 'Erreur', description: "Impossible de supprimer la réparation.", variant: 'destructive' });
    } finally {
        setIsDeleting(false);
    }
  };

  return (
    <>
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
            <div>
                <CardTitle>Journal des Réparations</CardTitle>
                <CardDescription>Historique de toutes les réparations effectuées.</CardDescription>
            </div>
            <Button onClick={handleAdd} size="icon" variant="outline" className="flex-shrink-0">
                <PlusCircle className="h-4 w-4" />
                <span className="sr-only">Ajouter une réparation</span>
            </Button>
        </div>
      </CardHeader>
      <CardContent>
        {repairs.length > 0 ? (
            <div>
                <div className="md:hidden space-y-4">
                    {repairs.map((repair) => (
                        <div key={repair.id} className="p-4 border rounded-lg bg-card text-card-foreground">
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <p className="font-semibold text-base leading-tight">{repair.description || 'N/A'}</p>
                                    <span className="text-xs text-muted-foreground">{repair.category || 'N/A'}</span>
                                </div>
                                <div className="flex-shrink-0 pl-2">
                                    <ActionMenu onEdit={() => handleEdit(repair)} onDelete={() => setItemToDelete(repair)} />
                                </div>
                            </div>
                            <div className="flex justify-between items-end">
                                <div className="text-sm text-muted-foreground space-y-1">
                                    <span className="flex items-center gap-1.5"><Calendar size={14} /> {safeFormatDate(repair.date)}</span>
                                    <span className="flex items-center gap-1.5"><GaugeCircle size={14} /> {safeFormatNumber(repair.mileage)} km</span>
                                </div>
                                <p className="font-bold text-lg text-foreground">{safeFormatCurrency(repair.cost)}</p>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="hidden md:block">
                    <Table>
                        <TableHeader>
                            <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Catégorie</TableHead>
                            <TableHead>Kilométrage</TableHead>
                            <TableHead className="text-right">Coût</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {repairs.map((repair) => (
                                <TableRow key={repair.id}>
                                    <TableCell>{safeFormatDate(repair.date)}</TableCell>
                                    <TableCell className="font-medium">{repair.description || 'N/A'}</TableCell>
                                    <TableCell>{repair.category || 'N/A'}</TableCell>
                                    <TableCell>{safeFormatNumber(repair.mileage)} km</TableCell>
                                    <TableCell className="text-right">{safeFormatCurrency(repair.cost)}</TableCell>
                                    <TableCell><ActionMenu onEdit={() => handleEdit(repair)} onDelete={() => setItemToDelete(repair)} /></TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>
        ) : (
            <div className="text-center py-12 text-muted-foreground">
                <Wrench className="mx-auto h-12 w-12 mb-4" />
                <h3 className="text-lg font-semibold">Aucune réparation enregistrée</h3>
                <p>Cliquez sur le bouton '+' pour commencer.</p>
            </div>
        )}
      </CardContent>
    </Card>

    <RepairDialog 
        key={itemToEdit ? itemToEdit.id : 'add'}
        open={isDialogOpen} 
        onOpenChange={setIsDialogOpen}
        vehicleId={vehicle.id} 
        onDataChange={onDataChange}
        initialData={itemToEdit}
    />
    <DeleteConfirmationDialog 
        open={!!itemToDelete}
        onOpenChange={() => setItemToDelete(null)}
        onConfirm={handleDeleteConfirm}
        isDeleting={isDeleting}
        title="Supprimer la réparation ?"
        description="Cette action est irréversible et supprimera définitivement cette entrée."
    />
    </>
  );
}

const RepairSchema = z.object({
  date: z.string().min(1, 'La date est requise.'),
  mileage: z.coerce.number().min(0, 'Le kilométrage doit être positif.'),
  description: z.string().min(1, 'La description est requise.'),
  category: z.string().min(1, 'La catégorie est requise.'),
  cost: z.coerce.number().min(0, 'Le coût doit être positif.'),
});

function RepairDialog({ open, onOpenChange, vehicleId, onDataChange, initialData }: { open: boolean, onOpenChange: (open: boolean) => void, vehicleId: string, onDataChange: () => void, initialData: Repair | null }) {
    const { toast } = useToast();
    const { user } = useAuth();
    const [description, setDescription] = useState(initialData?.description || '');
    const [category, setCategory] = useState(initialData?.category || '');
    const [isCategorizing, setIsCategorizing] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const formRef = useRef<HTMLFormElement>(null);

    const repairCategories = ["Moteur", "Filtres", "Bougies", "Courroie de distribution", "Freins", "Électrique", "Suspension", "Carrosserie", "Intérieur", "Échappement", "Transmission", "Pneus", "Batterie", "Climatisation", "Autre"];

    useEffect(() => {
        if (initialData) {
            setDescription(initialData.description || '');
            setCategory(initialData.category || '');
        } else {
            setDescription('');
            setCategory('');
        }
    }, [initialData, open]);

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
        const data = Object.fromEntries(formData.entries());
        const validatedFields = RepairSchema.safeParse(data);

        if (!validatedFields.success) {
            toast({ title: "Erreur de validation", description: validatedFields.error.issues[0].message, variant: 'destructive' });
            setIsSubmitting(false);
            return;
        }
        
        try {
            if (initialData) {
                await updateRepair(initialData.id, validatedFields.data);
                toast({ title: "Succès", description: "Réparation mise à jour." });
            } else {
                await addRepair({ ...validatedFields.data, vehicleId }, user.uid);
                toast({ title: "Succès", description: "Réparation ajoutée." });
            }
            onOpenChange(false);
            onDataChange();
        } catch (error) {
            toast({ title: "Erreur", description: "Impossible d'enregistrer la réparation.", variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    }

    if (!user) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{initialData ? 'Modifier' : 'Nouvelle'} Réparation</DialogTitle>
                </DialogHeader>
                <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 pt-4">
                     <div className="grid grid-cols-2 gap-4">
                        <Input name="date" type="date" required defaultValue={initialData?.date || new Date().toISOString().split('T')[0]} />
                        <Input name="mileage" type="number" placeholder="Kilométrage" required defaultValue={initialData?.mileage} />
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
                    <Input name="cost" type="number" step="0.01" placeholder="Coût (TND)" required defaultValue={initialData?.cost} />
                    <DialogFooter>
                        <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Annuler</Button>
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

// --- MAINTENANCE TAB ---

function MaintenanceTab({ vehicle, maintenance, onDataChange }: { vehicle: Vehicle, maintenance: Maintenance[], onDataChange: () => void }) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [itemToEdit, setItemToEdit] = useState<Maintenance | null>(null);
  const [itemToDelete, setItemToDelete] = useState<Maintenance | null>(null);
  const { toast } = useToast();

  const handleEdit = (item: Maintenance) => {
    setItemToEdit(item);
    setIsDialogOpen(true);
  };
  
  const handleAdd = () => {
    setItemToEdit(null);
    setIsDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    try {
        await deleteMaintenance(itemToDelete.id);
        toast({ title: 'Succès', description: 'Entretien supprimé.' });
        onDataChange();
        setItemToDelete(null);
    } catch (error) {
        toast({ title: 'Erreur', description: "Impossible de supprimer l'entretien.", variant: 'destructive' });
    } finally {
        setIsDeleting(false);
    }
  };

    return (
    <>
        <Card>
            <CardHeader>
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle>Suivi de l'Entretien</CardTitle>
                        <CardDescription>Gardez un oeil sur les entretiens passés et à venir.</CardDescription>
                    </div>
                    <Button onClick={handleAdd} size="icon" variant="outline" className="flex-shrink-0">
                        <PlusCircle className="h-4 w-4" />
                        <span className="sr-only">Ajouter un entretien</span>
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {maintenance.length > 0 ? (
                <div>
                    <div className="md:hidden space-y-4">
                        {maintenance.map((item) => {
                            const formattedNextDate = safeFormatDate(item.nextDueDate, 'd MMM yyyy');
                            const nextMileage = Number(item.nextDueMileage);
                            const formattedNextMileage = isNaN(nextMileage) || nextMileage === 0 ? '' : `${nextMileage.toLocaleString('fr-FR')} km`;
                            let nextDueText = [formattedNextDate, formattedNextMileage].filter(v => v && v !== 'N/A' && v !== 'Date invalide').join(' / ');
                            if (!nextDueText) nextDueText = "N/A";
                            
                            return (
                                <div key={item.id} className="p-4 border rounded-lg bg-card text-card-foreground">
                                    <div className="flex justify-between items-start mb-3">
                                        <p className="font-semibold text-base leading-tight">{item.task || 'N/A'}</p>
                                        <div className="flex-shrink-0 pl-2">
                                            <ActionMenu onEdit={() => handleEdit(item)} onDelete={() => setItemToDelete(item)} />
                                        </div>
                                    </div>

                                    <div className="flex justify-between items-end">
                                        <div className="text-sm text-muted-foreground space-y-1">
                                            <span className="flex items-center gap-1.5"><Calendar size={14} /> {safeFormatDate(item.date)}</span>
                                            <span className="flex items-center gap-1.5"><GaugeCircle size={14} /> {safeFormatNumber(item.mileage)} km</span>
                                        </div>
                                        <p className="font-bold text-lg text-foreground">{safeFormatCurrency(item.cost)}</p>
                                    </div>
                                    
                                    {nextDueText !== "N/A" && (
                                        <div className="pt-3 mt-3 border-t text-sm text-muted-foreground">
                                            <span className="flex items-center gap-1.5"><span className="font-medium text-foreground">Prochain:</span> {nextDueText}</span>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                    <div className="hidden md:block">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Tâche</TableHead>
                                <TableHead>Prochain Entretien</TableHead>
                                <TableHead className="text-right">Coût</TableHead>
                                <TableHead className="w-[50px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {maintenance.map((item) => {
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
                                        <TableCell><ActionMenu onEdit={() => handleEdit(item)} onDelete={() => setItemToDelete(item)} /></TableCell>
                                    </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </div>
                ) : (
                     <div className="text-center py-12 text-muted-foreground">
                        <Calendar className="mx-auto h-12 w-12 mb-4" />
                        <h3 className="text-lg font-semibold">Aucun entretien enregistré</h3>
                        <p>Cliquez sur le bouton '+' pour commencer le suivi.</p>
                    </div>
                )}
            </CardContent>
        </Card>
        <MaintenanceDialog
            key={itemToEdit ? itemToEdit.id : 'add'}
            open={isDialogOpen}
            onOpenChange={setIsDialogOpen}
            vehicle={vehicle}
            onDataChange={onDataChange}
            initialData={itemToEdit}
        />
        <DeleteConfirmationDialog 
            open={!!itemToDelete}
            onOpenChange={() => setItemToDelete(null)}
            onConfirm={handleDeleteConfirm}
            isDeleting={isDeleting}
            title="Supprimer l'entretien ?"
            description="Cette action est irréversible et supprimera définitivement cette entrée."
        />
    </>
    )
}

const MaintenanceSchema = z.object({
  date: z.string().min(1, 'La date est requise.'),
  mileage: z.coerce.number().min(0, 'Le kilométrage doit être positif.'),
  task: z.string().min(1, 'La tâche est requise.'),
  cost: z.coerce.number().min(0, 'Le coût doit être positif.'),
  nextDueDate: z.string().optional(),
  nextDueMileage: z.coerce.number().optional(),
});

function MaintenanceDialog({ open, onOpenChange, vehicle, onDataChange, initialData }: { open: boolean, onOpenChange: (open: boolean) => void, vehicle: Vehicle, onDataChange: () => void, initialData: Maintenance | null }) {
    const { toast } = useToast();
    const { user } = useAuth();
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const isTechInspectionEligible = useMemo(() => {
        if (!vehicle?.year) return true; // Default to eligible if year is unknown
        const vehicleAge = new Date().getFullYear() - vehicle.year;
        return vehicleAge >= 4; // Eligible in the 5th year
    }, [vehicle]);

    const maintenanceTasks = useMemo(() => {
        const tasks = ["Vidange", "Vignette", "Paiement Assurance"];
        if (isTechInspectionEligible) {
            tasks.push("Visite technique");
        }
        // Ensure the current task is always an option when editing
        if (initialData?.task && !tasks.includes(initialData.task)) {
            tasks.push(initialData.task);
        }
        return tasks;
    }, [isTechInspectionEligible, initialData]);

    const [selectedTask, setSelectedTask] = useState(initialData?.task || '');
    const [mileage, setMileage] = useState(initialData?.mileage.toString() || '');
    const [nextDueMileage, setNextDueMileage] = useState(initialData?.nextDueMileage?.toString() || '');
    const [cost, setCost] = useState(initialData?.cost.toString() || '');
    
    useEffect(() => {
        if (!open) {
            setSelectedTask('');
            setCost('');
            setMileage('');
            setNextDueMileage('');
            return;
        }

        if (initialData) {
            setSelectedTask(initialData.task || '');
            setCost(initialData.cost?.toString() || '');
            setMileage(initialData.mileage?.toString() || '');
            setNextDueMileage(initialData.nextDueMileage?.toString() || '');
        } else {
            setSelectedTask('');
            setCost('');
            setMileage('');
            setNextDueMileage('');
        }
    }, [initialData, open]);
    
    // Auto-calculate next due mileage for "Vidange" on new entries
    useEffect(() => {
        if (!initialData && selectedTask === 'Vidange') {
            const currentMileage = parseInt(mileage, 10);
            if (!isNaN(currentMileage) && currentMileage > 0) {
                setNextDueMileage((currentMileage + 10000).toString());
            }
        }
    }, [mileage, selectedTask, initialData]);

    // Auto-fill cost for certain tasks on new entries
    useEffect(() => {
        if (initialData) return;

        if (selectedTask === 'Visite technique') {
            setCost('35');
        } else if (selectedTask === 'Vignette') {
            const power = vehicle.fiscalPower;
            if (power) {
                if (power <= 4) setCost('60');
                else if (power >= 5 && power <= 7) setCost('130');
                else if (power === 8) setCost('180');
                else setCost('');
            } else {
                toast({ title: 'Info', description: "Puissance fiscale non définie pour ce véhicule."});
                setCost('');
            }
        } else if (selectedTask !== 'Vidange' && selectedTask !== 'Paiement Assurance') {
            setCost('');
        }
    }, [selectedTask, vehicle.fiscalPower, toast, initialData]);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setIsSubmitting(true);
        
        if (!user) {
            toast({ title: "Erreur", description: "Utilisateur non authentifié.", variant: 'destructive' });
            setIsSubmitting(false);
            return;
        }
        
        const formData = new FormData(event.currentTarget);
        formData.set('task', selectedTask);
        
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
            if (initialData) {
                await updateMaintenance(initialData.id, validatedFields.data);
                toast({ title: "Succès", description: "Entretien mis à jour." });
            } else {
                await addMaintenance({ ...validatedFields.data, vehicleId: vehicle.id }, user.uid);
                toast({ title: "Succès", description: "Entretien ajouté." });
            }
            onOpenChange(false);
            onDataChange();
        } catch (error) {
            toast({ title: "Erreur", description: "Impossible d'enregistrer l'entretien.", variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    }
    
    if (!user) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{initialData ? 'Modifier' : 'Nouvel'} Entretien</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                    <div className="space-y-2">
                        <label>Date & Kilométrage</label>
                        <div className="grid grid-cols-2 gap-4">
                            <Input name="date" type="date" required defaultValue={initialData?.date || new Date().toISOString().split('T')[0]} />
                            <Input name="mileage" type="number" placeholder="Kilométrage" required value={mileage} onChange={e => setMileage(e.target.value)} />
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
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="cost">Coût de l'entretien (TND)</label>
                        <Input id="cost" name="cost" type="number" step="0.01" placeholder="Coût (TND)" required value={cost} onChange={e => setCost(e.target.value)} />
                    </div>

                    <fieldset className="border p-4 rounded-md">
                        <legend className="text-sm font-medium px-1">Prochain entretien (Optionnel)</legend>
                        <div className="grid grid-cols-2 gap-4 pt-2">
                            <Input name="nextDueDate" type="date" defaultValue={initialData?.nextDueDate?.split('T')[0]} />
                            <Input name="nextDueMileage" type="number" placeholder="Prochain kilométrage" value={nextDueMileage} onChange={e => setNextDueMileage(e.target.value)} />
                        </div>
                    </fieldset>
                    
                    <DialogFooter>
                        <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Annuler</Button>
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

// --- FUEL TAB ---

const FuelLogSchema = z.object({
    date: z.string().min(1, 'La date est requise.'),
    mileage: z.coerce.number().min(0, 'Le kilométrage doit être positif.'),
    quantity: z.coerce.number().gt(0, 'La quantité doit être supérieure à 0.'),
    pricePerLiter: z.coerce.number().gt(0, 'Le prix par litre doit être supérieur à 0.'),
    totalCost: z.coerce.number().min(0, 'Le coût total doit être positif.'),
});

interface GroupedFuelLogs {
  [year: string]: {
    [month: string]: {
      logs: FuelLog[];
      totalCost: number;
      totalQuantity: number;
    }
  }
}

function FuelTab({ vehicle, fuelLogs, onDataChange }: { vehicle: Vehicle, fuelLogs: FuelLog[], onDataChange: () => void }) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [itemToEdit, setItemToEdit] = useState<FuelLog | null>(null);
  const [itemToDelete, setItemToDelete] = useState<FuelLog | null>(null);
  const { toast } = useToast();

  const groupedLogs = useMemo(() => {
    const data: GroupedFuelLogs = {};
    fuelLogs.forEach(log => {
      try {
        const date = new Date(log.date);
        const year = date.getFullYear().toString();
        const monthName = (format(date, 'LLLL', { locale: fr })).charAt(0).toUpperCase() + (format(date, 'LLLL', { locale: fr })).slice(1);
        
        if (!data[year]) {
          data[year] = {};
        }
        if (!data[year][monthName]) {
          data[year][monthName] = { logs: [], totalCost: 0, totalQuantity: 0 };
        }
        data[year][monthName].logs.push(log);
        data[year][monthName].totalCost += log.totalCost;
        data[year][monthName].totalQuantity += log.quantity;
      } catch (e) {
        console.error("Invalid date for fuel log", log);
      }
    });

    // Sort logs within each month
    for (const year in data) {
        for (const month in data[year]) {
            data[year][month].logs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        }
    }

    return data;
  }, [fuelLogs]);

  const handleEdit = (item: FuelLog) => {
    setItemToEdit(item);
    setIsDialogOpen(true);
  };
  
  const handleAdd = () => {
    setItemToEdit(null);
    setIsDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    try {
        await deleteFuelLog(itemToDelete.id);
        toast({ title: 'Succès', description: 'Plein de carburant supprimé.' });
        onDataChange();
        setItemToDelete(null);
    } catch (error) {
        toast({ title: 'Erreur', description: "Impossible de supprimer le plein.", variant: 'destructive' });
    } finally {
        setIsDeleting(false);
    }
  };

    return (
    <>
        <Card>
            <CardHeader>
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle>Suivi du Carburant</CardTitle>
                        <CardDescription>Consultez l'historique de vos pleins de carburant.</CardDescription>
                    </div>
                    <Button onClick={handleAdd} size="icon" variant="outline" className="flex-shrink-0">
                        <PlusCircle className="h-4 w-4" />
                        <span className="sr-only">Ajouter un plein</span>
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {fuelLogs.length > 0 ? (
                <Accordion type="multiple" className="w-full" defaultValue={Object.keys(groupedLogs).length > 0 ? [Object.keys(groupedLogs).sort((a,b) => Number(b) - Number(a))[0]] : []}>
                    {Object.entries(groupedLogs).sort(([yearA], [yearB]) => Number(yearB) - Number(yearA)).map(([year, months]) => (
                        <AccordionItem value={year} key={year}>
                            <AccordionTrigger className="text-lg font-semibold">Année {year}</AccordionTrigger>
                            <AccordionContent className="pl-2 space-y-4">
                                {Object.entries(months).map(([month, data]) => (
                                     <div key={month} className="border-l-2 pl-4">
                                        <h4 className="text-md font-medium mb-2">{month}</h4>
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Date</TableHead>
                                                    <TableHead>Kilométrage</TableHead>
                                                    <TableHead>Quantité</TableHead>
                                                    <TableHead>Prix/L</TableHead>
                                                    <TableHead className="text-right">Coût Total</TableHead>
                                                    <TableHead className="w-[50px]"></TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {data.logs.map((log) => (
                                                    <TableRow key={log.id}>
                                                        <TableCell>{safeFormatDate(log.date)}</TableCell>
                                                        <TableCell>{safeFormatNumber(log.mileage)} km</TableCell>
                                                        <TableCell>{safeFormatNumber(log.quantity)} L</TableCell>
                                                        <TableCell>{safeFormatCurrency(log.pricePerLiter)}</TableCell>
                                                        <TableCell className="text-right">{safeFormatCurrency(log.totalCost)}</TableCell>
                                                        <TableCell><ActionMenu onEdit={() => handleEdit(log)} onDelete={() => setItemToDelete(log)} /></TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                            <TableFooter>
                                                <TableRow>
                                                    <TableCell colSpan={2} className="font-semibold">Total {month}</TableCell>
                                                    <TableCell className="font-semibold">{data.totalQuantity.toFixed(2)} L</TableCell>
                                                    <TableCell colSpan={2} className="text-right font-semibold">{safeFormatCurrency(data.totalCost)}</TableCell>
                                                    <TableCell></TableCell>
                                                </TableRow>
                                            </TableFooter>
                                        </Table>
                                    </div>
                                ))}
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>
                ) : (
                    <div className="text-center py-12 text-muted-foreground">
                        <Fuel className="mx-auto h-12 w-12 mb-4" />
                        <h3 className="text-lg font-semibold">Aucun plein enregistré</h3>
                        <p>Cliquez sur le bouton '+' pour suivre votre consommation.</p>
                    </div>
                )}
            </CardContent>
        </Card>
        <FuelLogDialog
            key={itemToEdit ? itemToEdit.id : 'add'}
            open={isDialogOpen}
            onOpenChange={setIsDialogOpen}
            vehicle={vehicle}
            onDataChange={onDataChange}
            initialData={itemToEdit}
        />
        <DeleteConfirmationDialog 
            open={!!itemToDelete}
            onOpenChange={() => setItemToDelete(null)}
            onConfirm={handleDeleteConfirm}
            isDeleting={isDeleting}
            title="Supprimer le plein ?"
            description="Cette action est irréversible et supprimera définitivement cette entrée."
        />
    </>
    )
}

function FuelLogDialog({ open, onOpenChange, vehicle, onDataChange, initialData }: { open: boolean, onOpenChange: (open: boolean) => void, vehicle: Vehicle, onDataChange: () => void, initialData: FuelLog | null }) {
    const { toast } = useToast();
    const { user } = useAuth();
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [quantity, setQuantity] = useState(initialData?.quantity?.toString() || '');
    const [pricePerLiter, setPricePerLiter] = useState(initialData?.pricePerLiter?.toString() || (vehicle.fuelType === 'Diesel' ? '2.2' : '2.5'));
    const [totalCost, setTotalCost] = useState(initialData?.totalCost?.toString() || '');
    
    useEffect(() => {
        if (open) {
            if (initialData) {
                setQuantity(initialData.quantity?.toString() || '');
                setPricePerLiter(initialData.pricePerLiter?.toString() || '2.5');
                setTotalCost(initialData.totalCost?.toString() || '');
            } else {
                setQuantity('');
                setPricePerLiter(vehicle.fuelType === 'Diesel' ? '2.2' : '2.5');
                setTotalCost('');
            }
        }
    }, [initialData, open, vehicle.fuelType]);

    const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newQuantity = e.target.value;
        setQuantity(newQuantity);
        
        const q = parseFloat(newQuantity);
        const p = parseFloat(pricePerLiter);
        if (!isNaN(q) && !isNaN(p) && p > 0) {
            setTotalCost((q * p).toFixed(2));
        } else {
             setTotalCost('');
        }
    };
    
    const handleTotalCostChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newTotalCost = e.target.value;
        setTotalCost(newTotalCost);
        
        const tc = parseFloat(newTotalCost);
        const p = parseFloat(pricePerLiter);
        if (!isNaN(tc) && !isNaN(p) && p > 0) {
            setQuantity((tc / p).toFixed(3));
        } else {
            setQuantity('');
        }
    };
    
    const handlePricePerLiterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newPricePerLiter = e.target.value;
        setPricePerLiter(newPricePerLiter);
        
        // When price changes, recalculate total cost based on quantity to keep user's quantity input stable
        const q = parseFloat(quantity);
        const p = parseFloat(newPricePerLiter);
        if (!isNaN(q) && !isNaN(p) && p > 0) {
            setTotalCost((q * p).toFixed(2));
        } else {
            setTotalCost('');
        }
    };

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setIsSubmitting(true);

        if (!user) {
            toast({ title: "Erreur", description: "Utilisateur non authentifié.", variant: 'destructive' });
            setIsSubmitting(false);
            return;
        }

        const formData = new FormData(event.currentTarget);
        // Override form data with state values to ensure consistency
        formData.set('quantity', quantity);
        formData.set('pricePerLiter', pricePerLiter);
        formData.set('totalCost', totalCost);
        
        const validatedFields = FuelLogSchema.safeParse(Object.fromEntries(formData.entries()));

        if (!validatedFields.success) {
            toast({ title: "Erreur de validation", description: validatedFields.error.issues[0].message, variant: 'destructive' });
            setIsSubmitting(false);
            return;
        }
        
        try {
            if (initialData) {
                await updateFuelLog(initialData.id, validatedFields.data);
                toast({ title: "Succès", description: "Plein mis à jour." });
            } else {
                await addFuelLog({ ...validatedFields.data, vehicleId: vehicle.id }, user.uid);
                toast({ title: "Succès", description: "Plein de carburant ajouté." });
            }
            onOpenChange(false);
            onDataChange();
        } catch (error) {
            toast({ title: "Erreur", description: "Impossible d'ajouter le plein.", variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    }
    
    if (!user) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{initialData ? 'Modifier le' : 'Nouveau'} Plein de Carburant</DialogTitle>
                     <DialogDescription>
                        Saisissez le coût total ou la quantité en litres, l'autre champ sera calculé automatiquement.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                    <div className="grid grid-cols-2 gap-4">
                        <Input name="date" type="date" required defaultValue={initialData?.date || new Date().toISOString().split('T')[0]} />
                        <Input name="mileage" type="number" placeholder="Kilométrage" required defaultValue={initialData?.mileage} />
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="pricePerLiter">Prix / Litre (TND)</label>
                        <Input id="pricePerLiter" name="pricePerLiter" type="number" step="0.001" placeholder="Prix / Litre" required value={pricePerLiter} onChange={handlePricePerLiterChange} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label htmlFor="quantity">Quantité (L)</label>
                            <Input id="quantity" name="quantity" type="number" step="0.01" placeholder="Ex: 40" required value={quantity} onChange={handleQuantityChange} />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="totalCost">Coût total (TND)</label>
                            <Input id="totalCost" name="totalCost" type="number" step="0.01" placeholder="Ex: 100" required value={totalCost} onChange={handleTotalCostChange} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Annuler</Button>
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

    
