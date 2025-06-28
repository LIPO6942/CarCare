'use client'

import { useState, useRef, type FormEvent } from 'react';
import { z } from "zod"
import { format } from "date-fns"
import { fr } from "date-fns/locale"

import type { Repair, Maintenance, FuelLog, Deadline } from '@/lib/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { PlusCircle, Wrench, Fuel, Calendar, Bell, Sparkles, Loader2 } from 'lucide-react';
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
import { createRepair, createMaintenance, createFuelLog } from '@/lib/actions';
import { categorizeRepair } from '@/ai/flows/repair-categorization';
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
    deadlines: Deadline[];
}

export function VehicleTabs({ vehicleId, repairs, maintenance, fuelLogs, deadlines }: VehicleTabsProps) {
  return (
    <Tabs defaultValue="deadlines">
      <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
        <TabsTrigger value="deadlines"><Bell className="mr-2 h-4 w-4" />Échéances</TabsTrigger>
        <TabsTrigger value="repairs"><Wrench className="mr-2 h-4 w-4" />Réparations</TabsTrigger>
        <TabsTrigger value="maintenance"><Calendar className="mr-2 h-4 w-4" />Entretien</TabsTrigger>
        <TabsTrigger value="fuel"><Fuel className="mr-2 h-4 w-4" />Carburant</TabsTrigger>
      </TabsList>
      
      <TabsContent value="deadlines">
        <DeadlinesTab deadlines={deadlines} />
      </TabsContent>
      <TabsContent value="repairs">
        <RepairsTab vehicleId={vehicleId} repairs={repairs} />
      </TabsContent>
      <TabsContent value="maintenance">
        <MaintenanceTab vehicleId={vehicleId} maintenance={maintenance} />
      </TabsContent>
      <TabsContent value="fuel">
        <FuelTab vehicleId={vehicleId} fuelLogs={fuelLogs} />
      </TabsContent>
    </Tabs>
  );
}

function DeadlinesTab({ deadlines }: { deadlines: Deadline[] }) {
    const today = new Date();
    const upcoming = deadlines.filter(d => new Date(d.date) >= today);
    const past = deadlines.filter(d => new Date(d.date) < today);

    return (
        <Card>
          <CardHeader>
            <CardTitle>Échéances à venir</CardTitle>
            <CardDescription>Suivez les dates importantes comme le contrôle technique.</CardDescription>
          </CardHeader>
          <CardContent>
             {upcoming.length > 0 ? (
                <Table>
                    <TableHeader>
                        <TableRow>
                        <TableHead>Nom</TableHead>
                        <TableHead>Date</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {upcoming.map((deadline) => (
                        <TableRow key={deadline.id}>
                            <TableCell className="font-medium">{deadline.name}</TableCell>
                            <TableCell>{format(new Date(deadline.date), 'PPP', { locale: fr })}</TableCell>
                        </TableRow>
                        ))}
                    </TableBody>
                </Table>
             ) : (
                <p className="text-center text-muted-foreground py-8">Aucune échéance à venir.</p>
             )}
          </CardContent>
        </Card>
    )
}

function RepairsTab({ vehicleId, repairs }: { vehicleId: string, repairs: Repair[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
            <CardTitle>Journal des Réparations</CardTitle>
            <CardDescription>Historique de toutes les réparations effectuées.</CardDescription>
        </div>
        <AddRepairDialog vehicleId={vehicleId} />
      </CardHeader>
      <CardContent>
        {repairs.length > 0 ? (
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
                    {repairs.map((repair) => (
                    <TableRow key={repair.id}>
                        <TableCell>{format(new Date(repair.date), 'P', { locale: fr })}</TableCell>
                        <TableCell className="font-medium">{repair.description}</TableCell>
                        <TableCell>{repair.category}</TableCell>
                        <TableCell>{repair.mileage.toLocaleString('fr-FR')} km</TableCell>
                        <TableCell className="text-right">{repair.cost.toLocaleString('fr-FR', { style: 'currency', currency: 'TND' })}</TableCell>
                    </TableRow>
                    ))}
                </TableBody>
            </Table>
        ) : (
            <div className="text-center py-12 text-muted-foreground">
                <Wrench className="mx-auto h-12 w-12 mb-4" />
                <h3 className="text-lg font-semibold">Aucune réparation enregistrée</h3>
                <p className="mb-4">Cliquez sur "Ajouter une réparation" pour commencer.</p>
                <AddRepairDialog vehicleId={vehicleId} />
            </div>
        )}
      </CardContent>
    </Card>
  );
}

function AddRepairDialog({ vehicleId }: { vehicleId: string }) {
    const [open, setOpen] = useState(false);
    const { toast } = useToast();
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('');
    const [isCategorizing, setIsCategorizing] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

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
    
    async function handleSubmit(formData: FormData) {
        setIsSubmitting(true);
        formData.set('vehicleId', vehicleId);

        if (!formData.has('category')) {
          formData.set('category', category);
        }

        const result = await createRepair(formData);
        if (result?.message) {
            toast({ title: "Erreur", description: result.message, variant: 'destructive' });
        } else {
            toast({ title: "Succès", description: "Réparation ajoutée." });
            setOpen(false);
            setDescription('');
            setCategory('');
        }
        setIsSubmitting(false);
    }

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
                <form action={handleSubmit} className="space-y-4">
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

function MaintenanceTab({ vehicleId, maintenance }: { vehicleId: string, maintenance: Maintenance[] }) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>Suivi de l'Entretien</CardTitle>
                    <CardDescription>Gardez un oeil sur les entretiens passés et à venir.</CardDescription>
                </div>
                 <AddMaintenanceDialog vehicleId={vehicleId} />
            </CardHeader>
            <CardContent>
                {maintenance.length > 0 ? (
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
                        {maintenance.map((item) => (
                        <TableRow key={item.id}>
                            <TableCell>{format(new Date(item.date), 'P', { locale: fr })}</TableCell>
                            <TableCell className="font-medium">{item.task}</TableCell>
                            <TableCell>
                                {item.nextDueDate ? format(new Date(item.nextDueDate), 'P', { locale: fr }) : ''}
                                {item.nextDueMileage ? `${item.nextDueDate ? ' / ' : ''}${item.nextDueMileage.toLocaleString('fr-FR')} km` : ''}
                            </TableCell>
                            <TableCell className="text-right">{item.cost.toLocaleString('fr-FR', { style: 'currency', currency: 'TND' })}</TableCell>
                        </TableRow>
                        ))}
                    </TableBody>
                </Table>
                ) : (
                    <div className="text-center py-12 text-muted-foreground">
                        <Calendar className="mx-auto h-12 w-12 mb-4" />
                        <h3 className="text-lg font-semibold">Aucun entretien enregistré</h3>
                        <p className="mb-4">Ajoutez un entretien pour commencer le suivi.</p>
                        <AddMaintenanceDialog vehicleId={vehicleId} />
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

function AddMaintenanceDialog({ vehicleId }: { vehicleId: string }) {
    const [open, setOpen] = useState(false);
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const formRef = useRef<HTMLFormElement>(null);
    const [selectedTask, setSelectedTask] = useState('');
    
    const maintenanceTasks = [
        "Vidange huile moteur et filtre",
        "Changement des pneus",
        "Contrôle des freins",
        "Rotation des pneus",
        "Changement de la batterie",
        "Entretien climatisation",
        "Contrôle technique",
        "Autre",
    ];

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setIsSubmitting(true);
        const formData = new FormData(event.currentTarget);
        
        const finalTask = selectedTask === 'Autre' ? formData.get('customTask') as string : selectedTask;
        if (!finalTask || finalTask.trim() === '') {
            toast({ title: "Erreur", description: "Veuillez sélectionner ou préciser une tâche.", variant: 'destructive' });
            setIsSubmitting(false);
            return;
        }
        formData.set('task', finalTask);
        formData.delete('customTask');
        
        const result = await createMaintenance(formData);
        if (result?.message) {
            toast({ title: "Erreur", description: result.message, variant: 'destructive' });
        } else {
            toast({ title: "Succès", description: "Entretien ajouté." });
            setOpen(false);
            setSelectedTask('');
            formRef.current?.reset();
        }
        setIsSubmitting(false);
    }

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
                        <Select onValueChange={setSelectedTask} value={selectedTask}>
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


function FuelTab({ vehicleId, fuelLogs }: { vehicleId: string, fuelLogs: FuelLog[] }) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>Suivi du Carburant</CardTitle>
                    <CardDescription>Consultez l'historique de vos pleins de carburant.</CardDescription>
                </div>
                <AddFuelLogDialog vehicleId={vehicleId} />
            </CardHeader>
            <CardContent>
                {fuelLogs.length > 0 ? (
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
                        {fuelLogs.map((log) => (
                        <TableRow key={log.id}>
                            <TableCell>{format(new Date(log.date), 'P', { locale: fr })}</TableCell>
                            <TableCell>{log.mileage.toLocaleString('fr-FR')} km</TableCell>
                            <TableCell>{log.quantity.toFixed(2)} L</TableCell>
                            <TableCell>{log.pricePerLiter.toLocaleString('fr-FR', { style: 'currency', currency: 'TND' })}</TableCell>
                            <TableCell className="text-right">{log.totalCost.toLocaleString('fr-FR', { style: 'currency', currency: 'TND' })}</TableCell>
                        </TableRow>
                        ))}
                    </TableBody>
                </Table>
                ) : (
                    <div className="text-center py-12 text-muted-foreground">
                        <Fuel className="mx-auto h-12 w-12 mb-4" />
                        <h3 className="text-lg font-semibold">Aucun plein enregistré</h3>
                        <p className="mb-4">Ajoutez un plein pour suivre votre consommation.</p>
                        <AddFuelLogDialog vehicleId={vehicleId} />
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

function AddFuelLogDialog({ vehicleId }: { vehicleId: string }) {
    const [open, setOpen] = useState(false);
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [quantity, setQuantity] = useState('');
    const [pricePerLiter, setPricePerLiter] = useState('');

    const totalCost = parseFloat(quantity) * parseFloat(pricePerLiter);
    const displayTotalCost = isNaN(totalCost) ? '' : totalCost.toFixed(2);
    
    async function handleSubmit(formData: FormData) {
        setIsSubmitting(true);
        formData.set('vehicleId', vehicleId);
        formData.set('totalCost', displayTotalCost);

        const result = await createFuelLog(formData);
        if (result?.message) {
            toast({ title: "Erreur", description: result.message, variant: 'destructive' });
        } else {
            toast({ title: "Succès", description: "Plein de carburant ajouté." });
            setOpen(false);
            setQuantity('');
            setPricePerLiter('');
        }
        setIsSubmitting(false);
    }

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
                <form action={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <Input name="date" type="date" required defaultValue={new Date().toISOString().split('T')[0]} />
                        <Input name="mileage" type="number" placeholder="Kilométrage" required />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <Input name="quantity" type="number" step="0.01" placeholder="Quantité (L)" required value={quantity} onChange={e => setQuantity(e.target.value)} />
                        <Input name="pricePerLiter" type="number" step="0.01" placeholder="Prix / Litre" required value={pricePerLiter} onChange={e => setPricePerLiter(e.target.value)} />
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
