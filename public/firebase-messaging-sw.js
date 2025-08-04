// IMPORTANT: Ce fichier ne peut pas utiliser de variables d'environnement,
// car il est exécuté dans un contexte de service worker isolé.
// Les valeurs de configuration Firebase publiques doivent être codées en dur ici.

import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';

// Assurez-vous que ces valeurs correspondent exactement à votre configuration Firebase.
const firebaseConfig = {
  apiKey: "AIzaSyDw9nRE2KLboTwoEUZqSYNGLKnYg7lNWH4",
  authDomain: "car-care-3bc4d.firebaseapp.com",
  projectId: "car-care-3bc4d",
  storageBucket: "car-care-3bc4d.firebasestorage.app",
  messagingSenderId: "1077651378480",
  appId: "1:1077651378480:web:03f8bc830a077e4ad878f5"
};


// Initialisez Firebase
// Vérifiez si l'application est déjà initialisée pour éviter les erreurs.
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const messaging = getMessaging(app);

onBackgroundMessage(messaging, (payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification?.title || 'Nouvelle Notification';
  const notificationOptions = {
    body: payload.notification?.body || '',
    icon: '/android-chrome-192x192.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
