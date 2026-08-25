// Service Worker unifié CarCare Pro (PWA Caching + Firebase Cloud Messaging)
// Ne pas utiliser de modules ES6 (import/export) dans ce fichier.

// 1. Chargement des SDK Firebase Compat pour Service Worker
importScripts("https://www.gstatic.com/firebasejs/9.15.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.15.0/firebase-messaging-compat.js");

// Configuration Firebase Client
const firebaseConfig = {
  apiKey: "AIzaSyDw9nRE2KLboTwoEUZqSYNGLKnYg7lNWH4",
  authDomain: "car-care-3bc4d.firebaseapp.com",
  databaseURL: "https://car-care-3bc4d-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "car-care-3bc4d",
  storageBucket: "car-care-3bc4d.firebasestorage.app",
  messagingSenderId: "1077651378480",
  appId: "1:1077651378480:web:03f8bc830a077e4ad878f5",
  measurementId: "G-6G87X85CJK"
};

// Initialisation de Firebase dans le Service Worker
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const messaging = firebase.messaging();

// -------------------------------------------------------------
// GESTION DU CACHE PWA (Offline & Performance)
// -------------------------------------------------------------
const CACHE_NAME = 'carcare-pro-v5';
const ASSETS_TO_CACHE = [
  '/',
  '/documents',
  '/reports',
  '/settings',
  '/manifest.json',
  '/android-chrome-192x192.png',
  '/android-chrome-512x512.png',
  '/apple-touch-icon.png',
  '/favicon.ico',
  '/badge-72x72.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Ignorer les requêtes non-GET
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Requêtes de navigation (pages HTML) - Network-First avec fallback cache
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Ignorer les extensions chrome et les appels Firestore/Firebase
  if (url.origin.includes('extension') || url.origin.includes('firebase') || url.origin.includes('googleapis')) return;

  // Fichiers statiques - Cache-First avec fallback réseau
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return response;
      });
    })
  );
});

// -------------------------------------------------------------
// GESTION DES NOTIFICATIONS PUSH FIREBASE (FCM)
// -------------------------------------------------------------

// Fonction utilitaire pour afficher la notification native sur l'appareil
function displayNotification(payload) {
  console.log("[SW] Affichage de la notification système :", payload);

  const title = payload.notification?.title || payload.data?.title || "CarCare Pro";
  const body = payload.notification?.body || payload.data?.body || "Rappel d'entretien important";
  const icon = payload.notification?.icon || payload.data?.icon || "/android-chrome-192x192.png";
  const badge = payload.notification?.badge || payload.data?.badge || "/badge-72x72.png";
  const tag = payload.data?.tag || payload.notification?.tag || `carcare-${Date.now()}`;
  const targetUrl = payload.data?.url || payload.notification?.click_action || "/settings";
  const isHighPriority = payload.data?.priority === 'high';

  const notificationOptions = {
    body: body,
    icon: icon,
    badge: badge,
    tag: tag,
    renotify: true,
    requireInteraction: isHighPriority,
    vibrate: [200, 100, 200, 100, 200],
    data: {
      url: targetUrl,
      tag: tag
    }
  };

  return self.registration.showNotification(title, notificationOptions);
}

// Réception des messages FCM en arrière-plan
messaging.onBackgroundMessage((payload) => {
  console.log("[firebase-messaging-sw.js] onBackgroundMessage :", payload);
  return displayNotification(payload);
});

// Fallback natif d'événement push (au cas où le push n'est pas intercepté par FCM compat)
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const raw = event.data.json();
    console.log("[firebase-messaging-sw.js] Événement push brut reçu :", raw);
    // Si c'est un push qui n'a pas été affiché par Firebase SDK
    if (raw && (raw.notification || raw.data)) {
      event.waitUntil(displayNotification(raw));
    }
  } catch (e) {
    console.log("[firebase-messaging-sw.js] Push texte brut :", event.data.text());
  }
});

// Gestion du clic sur la notification push
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : "/settings";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Si une fenêtre CarCare est déjà ouverte, la focaliser et naviguer
      for (const client of clients) {
        if (client.url.includes(self.location.origin)) {
          if ("focus" in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
      }
      // Sinon ouvrir une nouvelle fenêtre
      if (self.clients.openWindow) {
        const fullUrl = targetUrl.startsWith('http') ? targetUrl : new URL(targetUrl, self.location.origin).href;
        return self.clients.openWindow(fullUrl);
      }
    })
  );
});
