'use client';

import { useState, useEffect } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Place } from '@/lib/types';
import { addPlace, getPlaces, updatePlace, deletePlace } from '@/lib/data';
import { useAuth } from '@/context/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, MapPin, Briefcase, Home as HomeIcon, Dumbbell, ShoppingCart, GraduationCap, Utensils, Fuel, Edit } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

const PlaceSchema = z.object({
    name: z.string().min(1, 'Le nom est requis'),
    type: z.enum(['home', 'work', 'leisure', 'other']),
    address: z.string().optional(),
    estimatedDistanceFromHome: z.coerce.number().min(0).optional(),
    icon: z.string().optional(),
    color: z.string().optional(),
});

type PlaceFormData = z.infer<typeof PlaceSchema>;

const ICONS = [
    { value: '🏠', label: 'Domicile', icon: HomeIcon },
    { value: '🏢', label: 'Travail', icon: Briefcase },
    { value: '🛒', label: 'Magasin', icon: ShoppingCart },
    { value: '🏋️', label: 'Sport', icon: Dumbbell },
    { value: '🏥', label: 'Santé', icon: null }, // Fallback if no lucide icon
    { value: '🎓', label: 'École', icon: GraduationCap },
    { value: '🍽️', label: 'Resto', icon: Utensils },
    { value: '📍', label: 'Autre', icon: MapPin },
];

const COLORS = [
    { value: 'bg-blue-500', label: 'Bleu' },
    { value: 'bg-red-500', label: 'Rouge' },
    { value: 'bg-green-500', label: 'Vert' },
    { value: 'bg-yellow-500', label: 'Jaune' },
    { value: 'bg-purple-500', label: 'Violet' },
    { value: 'bg-orange-500', label: 'Orange' },
    { value: 'bg-gray-500', label: 'Gris' },
];

export function PlacesManager() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [places, setPlaces] = useState<Place[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingPlace, setEditingPlace] = useState<Place | null>(null);

    const { register, handleSubmit, reset, setValue, watch, formState: { isSubmitting, errors } } = useForm<PlaceFormData>({
        resolver: zodResolver(PlaceSchema),
        defaultValues: {
            type: 'other',
            color: 'bg-gray-500',
            icon: '📍',
        }
    });

    const selectedIcon = watch('icon');
    const selectedColor = watch('color');

    useEffect(() => {
        if (user) {
            loadPlaces();
        }
    }, [user]);

    useEffect(() => {
        if (editingPlace) {
            reset({
                name: editingPlace.name,
                type: editingPlace.type,
                address: editingPlace.address,
                estimatedDistanceFromHome: editingPlace.estimatedDistanceFromHome,
                icon: editingPlace.icon,
                color: editingPlace.color,
            });
            setIsDialogOpen(true);
        } else {
            reset({
                type: 'other',
                color: 'bg-gray-500',
                icon: '📍',
            })
        }
    }, [editingPlace, reset]);

    async function loadPlaces() {
        if (!user) return;
        try {
            const data = await getPlaces(user.uid);
            setPlaces(data);
        } catch (error) {
            console.error("Failed to load places", error);
        } finally {
            setIsLoading(false);
        }
    }

    const onSubmit: SubmitHandler<PlaceFormData> = async (data) => {
        if (!user) return;
        try {
            if (editingPlace) {
                await updatePlace(editingPlace.id, data);
                toast({ title: 'Lieu mis à jour', description: `Le lieu "${data.name}" a été modifié.` });
            } else {
                await addPlace({
                    userId: user.uid,
                    ...data,
                });
                toast({ title: 'Lieu ajouté', description: `Le lieu "${data.name}" a été créé.` });
            }
            setIsDialogOpen(false);
            setEditingPlace(null);
            loadPlaces();
        } catch (error) {
            toast({ title: 'Erreur', description: "Impossible d'enregistrer le lieu.", variant: 'destructive' });
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Êtes-vous sûr de vouloir supprimer ce lieu ?")) return;
        try {
            await deletePlace(id);
            toast({ title: 'Lieu supprimé' });
            loadPlaces();
        } catch (error) {
            toast({ title: 'Erreur', description: "Impossible de supprimer le lieu.", variant: 'destructive' });
        }
    };

    if (isLoading) {
        return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    return (
        <Card className="max-w-4xl mx-auto mt-6">
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>Lieux Fréquents & Trajets Usuels</CardTitle>
                    <CardDescription>
                        Enregistrez vos lieux habituels pour analyser vos trajets et votre consommation.
                    </CardDescription>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={(open) => {
                    setIsDialogOpen(open);
                    if (!open) setEditingPlace(null);
                }}>
                    <DialogTrigger asChild>
                        <Button size="sm">
                            <Plus className="mr-2 h-4 w-4" />
                            Ajouter un lieu
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{editingPlace ? 'Modifier le lieu' : 'Ajouter un nouveau lieu'}</DialogTitle>
                            <DialogDescription>
                                Définissez les caractéristiques de ce lieu pour l'identifier dans vos trajets.
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Nom du lieu</Label>
                                    <Input id="name" placeholder="Ex: Maison" {...register('name')} />
                                    {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="type">Type</Label>
                                    <Select
                                        onValueChange={(val: any) => setValue('type', val)}
                                        defaultValue={editingPlace?.type || 'other'}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Sélectionner un type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="home">Domicile</SelectItem>
                                            <SelectItem value="work">Travail</SelectItem>
                                            <SelectItem value="leisure">Loisir</SelectItem>
                                            <SelectItem value="other">Autre</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="address">Adresse (Optionnel)</Label>
                                <Input id="address" placeholder="Adresse ou quartier" {...register('address')} />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="distance">Distance estimée depuis le domicile (km)</Label>
                                <Input id="distance" type="number" step="0.1" placeholder="Ex: 15.5" {...register('estimatedDistanceFromHome')} />
                                <p className="text-xs text-muted-foreground">Sert à estimer les trajets réguliers.</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Icône</Label>
                                    <div className="flex gap-2 flex-wrap">
                                        {ICONS.map((ic) => (
                                            <button
                                                key={ic.value}
                                                type="button"
                                                onClick={() => setValue('icon', ic.value)}
                                                className={`text-2xl p-2 rounded-md hover:bg-secondary ${selectedIcon === ic.value ? 'bg-secondary ring-2 ring-primary' : ''}`}
                                            >
                                                {ic.value}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label>Couleur</Label>
                                    <div className="flex gap-2 flex-wrap">
                                        {COLORS.map((col) => (
                                            <button
                                                key={col.value}
                                                type="button"
                                                onClick={() => setValue('color', col.value)}
                                                className={`w-8 h-8 rounded-full ${col.value} hover:opacity-80 transition-opacity ${selectedColor === col.value ? 'ring-2 ring-offset-2 ring-primary' : ''}`}
                                                title={col.label}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <DialogFooter>
                                <Button type="submit" disabled={isSubmitting}>
                                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    {editingPlace ? 'Mettre à jour' : 'Enregistrer'}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {places.length === 0 ? (
                        <div className="col-span-full text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                            Aucun lieu enregistré. Commencez par ajouter votre domicile et votre travail !
                        </div>
                    ) : (
                        places.map((place) => (
                            <div key={place.id} className="relative flex items-center p-4 border rounded-xl hover:shadow-md transition-shadow group">
                                <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-2xl text-white ${place.color || 'bg-gray-500'}`}>
                                    {place.icon || '📍'}
                                </div>
                                <div className="ml-4 flex-1">
                                    <h4 className="font-semibold text-lg">{place.name}</h4>
                                    <p className="text-sm text-muted-foreground capitalize">{place.type === 'home' ? 'Domicile' : place.type === 'work' ? 'Travail' : place.type === 'leisure' ? 'Loisir' : 'Autre'}</p>
                                    {place.estimatedDistanceFromHome && place.estimatedDistanceFromHome > 0 && place.type !== 'home' && (
                                        <p className="text-xs text-primary mt-1">~{place.estimatedDistanceFromHome} km du domicile</p>
                                    )}
                                </div>
                                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingPlace(place)}>
                                        <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(place.id)}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
