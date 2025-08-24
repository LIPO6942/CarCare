import { Sidebar } from './sidebar';
import { MobileSidebar } from './mobile-sidebar';
import { FloatingChatbot } from './floating-chatbot';

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen w-full lg:grid-cols-[280px_1fr]">
      <div className="hidden border-r bg-card lg:block">
        <Sidebar />
      </div>
      <div className="flex flex-col">
        <MobileSidebar />
        {children}
      </div>
      <FloatingChatbot />
    </div>
  );
}
