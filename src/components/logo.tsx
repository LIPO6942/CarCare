import { cn } from '@/lib/utils';

const OpenHoodCarIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M10 4L8 2" />
    <path d="M18 4L20 2" />
    <path d="M14 4h-4" />
    <path d="M2 12v5c0 1.1.9 2 2 2h1" />
    <path d="M21 12v5c0 1.1-.9 2-2 2h-1" />
    <path d="M5 19V12h14v7" />
    <path d="M2 12H5" />
    <path d="M19 12h3" />
    <circle cx="7.5" cy="17.5" r="2.5" />
    <circle cx="16.5" cy="17.5" r="2.5" />
  </svg>
);

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <OpenHoodCarIcon className="h-6 w-6 text-primary" />
      <span className="text-xl font-bold text-foreground">CarCare Pro</span>
    </div>
  );
}
