import * as admin from 'firebase-admin';

if (!admin.apps.length) {
    try {
        if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
            // Configuration via une seule variable (JSON stringifié)
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
        } else if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
            // Configuration champs par champs
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    // Replace literal \n with actual newlines for private key parsing
                    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
                })
            });
        } else {
            // Fallback (utilisera les Application Default Credentials sur Google Cloud / Firebase)
            admin.initializeApp();
        }
        console.log('Firebase Admin Initialized Successfully');
    } catch (error) {
        console.error('Firebase admin initialization error', error);
    }
}

export const adminDb = admin.firestore();
export const adminMessaging = admin.messaging();
