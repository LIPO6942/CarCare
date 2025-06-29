'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInAnonymously, type User, getAdditionalUserInfo } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { addSampleData } from '@/lib/actions';
import { AlertTriangle } from 'lucide-react';

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

  useEffect(() => {
    // This check is a safeguard against common deployment issues.
    // It verifies that the most critical environment variables are available on the client-side.
    const requiredEnvVars = [
        'NEXT_PUBLIC_FIREBASE_API_KEY',
        'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
        'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    ];
    
    const isMissingVars = requiredEnvVars.some(v => !process.env[v]);

    if (isMissingVars) {
        console.error("Critical Firebase configuration is missing. App cannot start.");
        setConfigError("La configuration Firebase est incomplète. L'application ne peut pas démarrer. Veuillez contacter le support technique.");
        setIsLoading(false);
        return;
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setIsLoading(false);
      } else {
        signInAnonymously(auth)
          .then(async (anonymousUserCredential) => {
            const additionalInfo = getAdditionalUserInfo(anonymousUserCredential);
            if (additionalInfo?.isNewUser) {
              try {
                await addSampleData(anonymousUserCredential.user.uid);
              } catch (e) {
                console.error("Failed to add sample data for new user.", e);
              }
            }
            setUser(anonymousUserCredential.user);
            setIsLoading(false);
          })
          .catch((error) => {
            console.error("Firebase Authentication Error:", error);
            setConfigError("Impossible de se connecter aux services de l'application. Veuillez vérifier votre connexion internet et réessayer.");
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

  const value = { user, isLoading };

  return (
    <AuthContext.Provider value={value}>
        {isLoading ? (
            <div className="flex min-h-screen w-full items-center justify-center">
               <div className="w-full max-w-md space-y-4 p-4">
                 <Skeleton className="h-12 w-full" />
                 <Skeleton className="h-32 w-full" />
                 <Skeleton className="h-32 w-full" />
               </div>
            </div>
        ) : children}
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
