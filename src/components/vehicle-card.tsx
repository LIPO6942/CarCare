import Link from 'next/link';
import Image from 'next/image';
import { Car, Fuel, GitCommitHorizontal, Gauge } from 'lucide-react';
import type { Vehicle } from '@/lib/types';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function VehicleCard({ vehicle }: { vehicle: Vehicle }) {
  return (
    <Card className="flex flex-col transition-all hover:shadow-lg">
      <CardHeader className="p-0">
        <Link href={`/vehicles/${vehicle.id}`}>
          <div className="relative h-48 w-full">
            <Image
              src={vehicle.imageUrl || 'https://placehold.co/600x400.png'}
              alt={`${vehicle.brand} ${vehicle.model}`}
              data-ai-hint="side view car"
              fill
              className="object-cover rounded-t-lg"
            />
          </div>
        </Link>
      </CardHeader>
      <CardContent className="flex-1 pt-6">
        <CardTitle className="text-xl mb-2">
          <Link href={`/vehicles/${vehicle.id}`} className="hover:text-primary">
            {vehicle.brand} {vehicle.model}
          </Link>
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
        <Button asChild className="w-full">
          <Link href={`/vehicles/${vehicle.id}`}>Voir les détails</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
