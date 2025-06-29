'use client';

import { useState, type ReactNode } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { AddVehicleForm } from './add-vehicle-form';

export function AddVehicleSheet({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Ajouter un nouveau véhicule</SheetTitle>
          <SheetDescription>
            Remplissez les détails de votre véhicule pour l'ajouter à votre flotte.
          </SheetDescription>
        </SheetHeader>
        <AddVehicleForm onFormSubmit={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
