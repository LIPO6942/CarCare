import { Sidebar } from './sidebar';
import { MobileSidebar } from './mobile-sidebar';

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full bg-muted/40">
      <Sidebar />
      <div className="flex flex-col flex-1">
        <MobileSidebar />
        {children}
      </div>
    </div>
  );
}
