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
import type { Vehicle } from '@/lib/types';

export function AddVehicleSheet({ children, onVehicleAdded }: { children: ReactNode; onVehicleAdded: (vehicle: Vehicle) => void; }) {
  const [open, setOpen] = useState(false);

  const handleFormSubmit = (vehicle: Vehicle) => {
    setOpen(false);
    onVehicleAdded(vehicle);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent className="w-full sm:max-w-2xl md:max-w-3xl lg:max-w-4xl p-5 sm:p-7 md:p-8 flex flex-col h-full overflow-hidden">
        <SheetHeader className="pb-4 border-b shrink-0">
          <SheetTitle className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            Ajouter un nouveau véhicule
          </SheetTitle>
          <SheetDescription className="text-xs sm:text-sm text-muted-foreground">
            Remplissez les détails et caractéristiques de votre véhicule pour l'ajouter à votre flotte.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto py-3 pr-1 sm:pr-2">
          <AddVehicleForm onFormSubmit={handleFormSubmit} onCancel={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
