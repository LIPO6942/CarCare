'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInAnonymously, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Skeleton } from '@/components/ui/skeleton';

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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setIsLoading(false);
      } else {
        // No user is signed in, so sign them in anonymously.
        signInAnonymously(auth)
          .then((anonymousUserCredential) => {
            setUser(anonymousUserCredential.user);
            setIsLoading(false);
          })
          .catch((error) => {
            console.error("Error signing in anonymously. Please enable anonymous auth in your Firebase project.", error);
            // Even if it fails, we should stop loading to prevent an infinite loop.
            // The app will be in a "no user" state, but won't be stuck.
            setIsLoading(false);
          });
      }
    });

    return () => unsubscribe();
  }, []);

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
