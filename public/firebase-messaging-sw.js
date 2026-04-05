// This file must be in the public folder.
// It is a service worker that will be registered by the browser.

// IMPORTANT: Do not use ES6 modules (import/export) in this file.
// Service workers run in a different context than the rest of the app.
// Use importScripts to load the Firebase SDK.
importScripts("https://www.gstatic.com/firebasejs/9.15.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.15.0/firebase-messaging-compat.js");

// --- IMPORTANT: REPLACE WITH YOUR FIREBASE CONFIG ---
// This object is NOT secret and is safe to be publicly exposed.
// It's the configuration for your Firebase app, which is necessary for the
// client-side SDK to connect to your Firebase project.
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
};
// ----------------------------------------------------

// Initialize the Firebase app in the service worker with the configuration
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const messaging = firebase.messaging();

// Helper: Check if app is already open in any window/PWA
async function isAppOpen() {
  const clientsList = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true
  });
  return clientsList.some(client =>
    client.url.includes(self.location.origin)
  );
}

// This handler is called when a push message arrives while the app is in the background.
// If the app is already open, we skip the native notification to avoid duplicates
// (the foreground handler in the app will display a toast instead).
messaging.onBackgroundMessage(async (payload) => {
  console.log(
    "[firebase-messaging-sw.js] Received background message ",
    payload
  );

  // Check if app is already open - if yes, don't show native notification
  if (await isAppOpen()) {
    console.log('[SW] App already open, skipping native notification');
    return;
  }

  const notificationTitle = payload.notification?.title || "CarCare Pro";
  const notificationOptions = {
    body: payload.notification?.body || "Vous avez une nouvelle notification.",
    icon: "/android-chrome-192x192.png",
    badge: "/badge-72x72.png",
    tag: payload.data?.tag || payload.notification?.tag || "carcare-default",
    renotify: false,
    requireInteraction: false,
    // Attach the target URL so the click handler can open the app
    data: {
      url: payload.data?.url || "/",
      tag: payload.data?.tag || payload.notification?.tag || "carcare-default"
    },
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification clicks — open or focus the CarCare app
self.addEventListener("notificationclick", (event) => {
  event.notification.close(); // Dismiss the notification banner

  const targetUrl = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // If a window with our app is already open, focus and navigate it
      for (const client of clients) {
        if (client.url.includes(self.location.origin)) {
          // Check if it's a standalone PWA window
          const isStandalone = client.url.includes('?standalone=true') || 
                               client.url.includes('&standalone=true') ||
                               new URL(client.url).searchParams.has('standalone');
          
          if ("focus" in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
      }
      // Otherwise open a new window - try to open as standalone PWA
      if (self.clients.openWindow) {
        // Add standalone parameter to force PWA mode if supported
        const pwaUrl = targetUrl.includes('?') ? `${targetUrl}&standalone=true` : `${targetUrl}?standalone=true`;
        return self.clients.openWindow(pwaUrl);
      }
    })
  );
});
