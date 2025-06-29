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
    // Check for missing environment variables, which is a common deployment issue.
    const requiredEnvVars = [
        'NEXT_PUBLIC_FIREBASE_API_KEY',
        'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
        'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
        'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
        'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
        'NEXT_PUBLIC_FIREBASE_APP_ID',
    ];
    
    // This check only runs on the client-side, so process.env is what's available in the browser.
    const missingVars = requiredEnvVars.filter(v => !process.env[v]);

    if (missingVars.length > 0) {
        const debugInfo = requiredEnvVars.map(v => 
            `${v}: ${process.env[v] ? '✔️ Trouvée' : '❌ MANQUANTE'}`
        ).join('\n');

        const errorMessage = `Erreur Critique de Déploiement.\n\nL'application a confirmé que Vercel ne lui fournit PAS les variables d'environnement nécessaires. \n\nÉtat des variables:\n${debugInfo}\n\nACTION REQUISE: Allez dans les paramètres de votre projet Vercel, supprimez TOUTES les variables d'environnement NEXT_PUBLIC_..., puis ajoutez-les à nouveau une par une, en vous assurant que la case "Production" est cochée pour chacune. Puis, redéployez.`;
        
        setConfigError(errorMessage);
        setIsLoading(false);
        return; // Stop further execution
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
             const detailedError = `Erreur d'authentification Firebase : "${error.message}" (Code: ${error.code}).`;
             const vercelHint = "Sur Vercel, cela signifie généralement que les variables d'environnement (NEXT_PUBLIC_...) ne sont pas correctement configurées ou que l'authentification 'Anonyme' n'est pas activée dans votre console Firebase.";
             
             const finalMessage = process.env.NEXT_PUBLIC_VERCEL_URL ? `${detailedError}\n\n${vercelHint}` : detailedError;

            setConfigError(finalMessage);
            setIsLoading(false);
          });
      }
    });

    return () => unsubscribe();
  }, []);

  if (configError) {
    return (
        <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
            <div className="w-full max-w-lg rounded-lg border-2 border-destructive/50 bg-card p-8 text-center shadow-xl whitespace-pre-wrap">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 mb-4">
                    <AlertTriangle className="h-6 w-6 text-destructive" />
                </div>
                <h1 className="text-2xl font-bold text-destructive">Erreur de Configuration Firebase</h1>
                <p className="mt-4 text-card-foreground">{configError}</p>
                <p className="mt-6 text-sm text-muted-foreground">
                    Veuillez vérifier votre configuration, puis redéployez votre application.
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
