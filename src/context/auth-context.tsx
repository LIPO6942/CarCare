'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInAnonymously, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle } from 'lucide-react';
import { useLocalNotifications } from '@/hooks/use-local-notifications';
import Image from 'next/image';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  // The local notifications hook will only activate its logic when the user is authenticated.
  useLocalNotifications();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setIsLoading(false);
      } else {
        signInAnonymously(auth)
          .then((anonymousUserCredential) => {
            setUser(anonymousUserCredential.user);
            setIsLoading(false);
          })
          .catch((error) => {
            console.error("Firebase Authentication Error:", error);
            // Provide a more helpful error message for common configuration issues.
            if (error.code === 'auth/invalid-api-key' || error.code === 'auth/internal-error' || error.message.includes('auth/invalid-api-key')) {
              setConfigError("Erreur de configuration Firebase. Veuillez vérifier que vos variables d'environnement (clés API) sont correctement configurées dans le fichier .env et que le projet est bien initialisé.");
            } else {
              setConfigError("Impossible de se connecter aux services de l'application. Veuillez vérifier votre connexion internet et réessayer.");
            }
            setIsLoading(false);
          });
      }
    });

    return () => unsubscribe();
  }, []);

  if (configError) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
        <div className="w-full max-w-lg rounded-lg border-2 border-destructive/50 bg-card p-8 text-center shadow-xl">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 mb-4">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold text-destructive">Erreur de Connexion</h1>
          <p className="mt-4 text-card-foreground">{configError}</p>
          <p className="mt-6 text-sm text-muted-foreground">
            Si le problème persiste, le service est peut-être temporairement indisponible.
          </p>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center bg-white">
        <div className="flex flex-col items-center animate-pulse">
            <Image
                src="/android-chrome-512x512.png"
                alt="Logo CarCare Pro"
                width={256}
                height={256}
                priority
            />
            <h1 className="text-3xl font-bold tracking-tight text-primary mt-4">CarCare Pro</h1>
        </div>
      </div>
    )
  }

  const value = { user, isLoading: false }; // Since we handle loading above, it's false here.

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
