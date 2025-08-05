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

// This handler will be called when a message is received and the app is in the background.
messaging.onBackgroundMessage((payload) => {
  console.log(
    "[firebase-messaging-sw.js] Received background message ",
    payload
  );

  const notificationTitle = payload.notification.title || "CarCare Pro";
  const notificationOptions = {
    body: payload.notification.body || "Vous avez une nouvelle notification.",
    icon: "/apple-touch-icon.png", // Ensure this icon exists in your public folder
  };

  // This is the core logic to prevent double notifications.
  // It checks if any of the app's windows/tabs are currently visible.
  self.clients.matchAll({
    type: "window",
    includeUncontrolled: true
  }).then((clients) => {
    // If no client is visible or focused, show the notification.
    if (clients.every(client => !client.visible || !client.focused)) {
      self.registration.showNotification(notificationTitle, notificationOptions);
    }
  });
});
