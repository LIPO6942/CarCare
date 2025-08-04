// public/firebase-messaging-sw.js

// IMPORTANT: This file cannot use ES6 modules (import/export),
// so we use importScripts to load the Firebase SDK.

// Use the latest version of the Firebase SDK
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// IMPORTANT: Replace with your actual Firebase project configuration
const firebaseConfig = {
    apiKey: "YOUR_NEXT_PUBLIC_FIREBASE_API_KEY",
    authDomain: "YOUR_NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    projectId: "YOUR_NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    storageBucket: "YOUR_NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    messagingSenderId: "YOUR_NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    appId: "YOUR_NEXT_PUBLIC_FIREBASE_APP_ID"
};

// Initialize the Firebase app in the service worker
firebase.initializeApp(firebaseConfig);

// Retrieve an instance of Firebase Messaging so that it can handle background messages.
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log(
    '[firebase-messaging-sw.js] Received background message ',
    payload
  );
  
  // Customize notification here
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/android-chrome-192x192.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
