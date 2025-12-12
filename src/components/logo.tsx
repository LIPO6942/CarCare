import { cn } from '@/lib/utils';
import { Car } from 'lucide-react';

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center h-12 w-12 rounded-lg bg-primary/10 text-primary', className)}>
      <Car className="h-6 w-6" />
      <span className="text-sm font-medium mt-1">Car Care</span>
    </div>
  );
}
