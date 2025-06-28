'use client'

import { useState } from 'react';
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { format } from "date-fns"
import { fr } from "date-fns/locale"

import type { Repair, Maintenance, FuelLog, Deadline } from '@/lib/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { PlusCircle, Wrench, Fuel, Calendar, Bell, Sparkles } from 'lucide-react';
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
import { createRepair } from '@/lib/actions';
import { categorizeRepair } from '@/ai/flows/repair-categorization';

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
        <MaintenanceTab maintenance={maintenance} />
      </TabsContent>
      <TabsContent value="fuel">
        <FuelTab fuelLogs={fuelLogs} />
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
                <p>Cliquez sur "Ajouter une réparation" pour commencer.</p>
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

    const handleCategorize = async () => {
        if (!description) {
            toast({ title: 'Erreur', description: 'Veuillez d\'abord entrer une description.', variant: 'destructive'});
            return;
        }
        setIsCategorizing(true);
        try {
            const result = await categorizeRepair({ repairDetails: description });
            setCategory(result.category);
            toast({ title: 'Catégorie suggérée!', description: `La catégorie a été définie sur "${result.category}".`});
        } catch (error) {
            toast({ title: 'Erreur IA', description: 'Impossible de suggérer une catégorie.', variant: 'destructive'});
        } finally {
            setIsCategorizing(false);
        }
    }
    
    async function handleSubmit(formData: FormData) {
        formData.set('vehicleId', vehicleId);
        const result = await createRepair(formData);
        if (result?.message) {
            toast({ title: "Erreur", description: result.message, variant: 'destructive' });
        } else {
            toast({ title: "Succès", description: "Réparation ajoutée." });
            setOpen(false);
        }
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
                        <Input name="date" type="date" required />
                        <Input name="mileage" type="number" placeholder="Kilométrage" required />
                    </div>
                    <Textarea name="description" placeholder="Description de la réparation" required onChange={(e) => setDescription(e.target.value)} value={description} />
                    <div className="flex gap-2">
                        <Input name="category" placeholder="Catégorie" required value={category} onChange={e => setCategory(e.target.value)} className="flex-1" />
                        <Button type="button" variant="outline" onClick={handleCategorize} disabled={isCategorizing}>
                            <Sparkles className="mr-2 h-4 w-4" />
                            {isCategorizing ? 'Analyse...' : 'Catégoriser avec l\'IA'}
                        </Button>
                    </div>
                    <Input name="cost" type="number" step="0.01" placeholder="Coût (TND)" required />
                    <DialogFooter>
                        <DialogClose asChild><Button type="button" variant="secondary">Annuler</Button></DialogClose>
                        <Button type="submit">Enregistrer</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

function MaintenanceTab({ maintenance }: { maintenance: Maintenance[] }) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>Suivi de l'Entretien</CardTitle>
                    <CardDescription>Gardez un oeil sur les entretiens passés et à venir.</CardDescription>
                </div>
                 <Button disabled><PlusCircle className="mr-2 h-4 w-4" />Ajouter un entretien</Button>
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
                                {item.nextDueMileage ? ` / ${item.nextDueMileage.toLocaleString('fr-FR')} km` : ''}
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
                        <p>Ajoutez un entretien pour commencer le suivi.</p>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

function FuelTab({ fuelLogs }: { fuelLogs: FuelLog[] }) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>Suivi du Carburant</CardTitle>
                    <CardDescription>Consultez l'historique de vos pleins de carburant.</CardDescription>
                </div>
                <Button disabled><PlusCircle className="mr-2 h-4 w-4" />Ajouter un plein</Button>
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
                        <p>Ajoutez un plein pour suivre votre consommation.</p>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
