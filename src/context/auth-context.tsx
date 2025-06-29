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
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setIsLoading(false);
      } else {
        // No user is signed in, so sign them in anonymously.
        signInAnonymously(auth)
          .then(async (anonymousUserCredential) => {
            const additionalInfo = getAdditionalUserInfo(anonymousUserCredential);
            if (additionalInfo?.isNewUser) {
              // This is a brand new anonymous user, let's add sample data for them.
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
             if (error.code === 'auth/api-key-not-valid') {
                setConfigError(
                    "Votre clé d'API Firebase n'est pas valide. L'authentification ne peut pas continuer."
                );
            } else {
                 console.error("Error signing in anonymously. Please enable anonymous auth in your Firebase project.", error);
                 setConfigError("Une erreur inattendue est survenue lors de l'authentification. Vérifiez la console pour plus de détails.");
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
                <h1 className="text-2xl font-bold text-destructive">Erreur de Configuration Firebase</h1>
                <p className="mt-4 text-card-foreground">{configError}</p>
                <p className="mt-6 text-sm text-muted-foreground">
                    Veuillez vérifier que votre fichier <code>.env</code> est correctement rempli avec les clés valides de votre projet Firebase, puis redémarrez le serveur de développement.
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
