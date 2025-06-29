'use client';

import { useState } from 'react';
import { Car, Fuel, GitCommitHorizontal, MoreHorizontal, Trash2 } from 'lucide-react';
import type { Vehicle } from '@/lib/types';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { deleteVehicle } from '@/lib/actions';

export function VehicleCard({ vehicle, onOpenDetails }: { vehicle: Vehicle; onOpenDetails: (vehicle: Vehicle) => void; }) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();
  const isSample = vehicle.id.startsWith('sample-');

  async function handleDelete() {
    setIsDeleting(true);

    const result = await deleteVehicle(vehicle.id);

    if (result?.message) {
      toast({
        title: 'Erreur',
        description: result.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Succès',
        description: 'Le véhicule a été supprimé.',
      });
    }

    setIsDeleting(false);
    setShowDeleteDialog(false);
  }

  return (
    <>
      <Card className="flex flex-col transition-all hover:shadow-lg">
        <CardHeader className="p-0 relative">
          {!isSample && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="absolute top-2 right-2 z-10 h-8 w-8 rounded-full bg-black/30 text-white hover:bg-black/50 hover:text-white">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Ouvrir le menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => setShowDeleteDialog(true)}
                  className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  <span>Supprimer</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <button 
            onClick={() => onOpenDetails(vehicle)} 
            className="w-full text-left cursor-pointer block rounded-t-lg focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
             <div className="relative h-48 w-full bg-muted/30 rounded-t-lg flex items-center justify-center p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={vehicle.imageUrl || 'https://placehold.co/600x400.png'}
                alt={`${vehicle.brand} logo`}
                className="h-full w-full object-contain"
                onError={(e) => { e.currentTarget.src = 'https://placehold.co/200x100.png'; e.currentTarget.onerror = null; }}
              />
            </div>
          </button>
        </CardHeader>
        <CardContent className="flex-1 pt-6">
          <CardTitle className="text-xl mb-2">
            <button onClick={() => onOpenDetails(vehicle)} className="hover:text-primary text-left">
              {vehicle.brand} {vehicle.model}
            </button>
          </CardTitle>
          <div className="text-muted-foreground space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <GitCommitHorizontal className="h-4 w-4" />
              <span>{vehicle.licensePlate}</span>
            </div>
            <div className="flex items-center gap-2">
              <Car className="h-4 w-4" />
              <span>{vehicle.year}</span>
            </div>
            <div className="flex items-center gap-2">
              <Fuel className="h-4 w-4" />
              <span>{vehicle.fuelType}</span>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={() => onOpenDetails(vehicle)} className="w-full">
            Voir les détails
          </Button>
        </CardFooter>
      </Card>
      
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Êtes-vous sûr de vouloir supprimer ce véhicule ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Toutes les données associées à ce véhicule (réparations, entretiens, etc.) seront définitivement supprimées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Suppression...' : 'Supprimer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
