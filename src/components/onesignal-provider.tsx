
'use client';

import { useEffect, type ReactNode } from 'react';
import OneSignal from 'react-onesignal';
import { useAuth } from '@/context/auth-context';

export function OneSignalProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  
  useEffect(() => {
    async function setupOneSignal() {
        // We only want to run this in the browser
        if (typeof window === 'undefined') return;

        // The appId is public and safe to include here
        const ONE_SIGNAL_APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;

        if (!ONE_SIGNAL_APP_ID) {
            console.error("OneSignal App ID is not configured. Push notifications will not work.");
            return;
        }

        try {
            await OneSignal.init({ 
                appId: ONE_SIGNAL_APP_ID,
                allowLocalhostAsSecureOrigin: true // Important for development
            });
            console.log("OneSignal initialized.");
        } catch (error) {
            console.error("Failed to initialize OneSignal:", error);
        }
    }
    
    setupOneSignal();
  }, []);

  useEffect(() => {
    async function identifyUser() {
        if (user) {
            try {
                // Set the user's Firebase UID as the external user ID in OneSignal
                await OneSignal.login(user.uid);
                console.log(`User ${user.uid} identified with OneSignal.`);
            } catch (error) {
                console.error("Failed to identify user with OneSignal:", error);
            }
        } else {
            // If the user logs out, log them out of OneSignal as well
            if(OneSignal.User.isLoggedIn()) {
                await OneSignal.logout();
                console.log("User logged out from OneSignal.");
            }
        }
    }
    identifyUser();
  }, [user]);

  return <>{children}</>;
}
