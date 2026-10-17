import { Sidebar } from './sidebar';
import { FloatingChatbot } from './floating-chatbot';

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen w-full lg:grid-cols-[280px_1fr]">
      <div className="hidden border-r bg-card lg:block">
        <Sidebar />
      </div>
      <div className="flex flex-col min-w-0">
        {children}
      </div>
      <FloatingChatbot />
    </div>
  );
}
