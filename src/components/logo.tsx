import { cn } from '@/lib/utils';
import { Car } from 'lucide-react';

export function Logo({ className, iconClassName }: { className?: string; iconClassName?: string }) {
  return (
    <div className={cn('flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10 text-primary', className)}>
      <Car className={cn("h-6 w-6", iconClassName)} />
    </div>
  );
}
