// This file must be in the public directory

// Scripts for firebase and firebase messaging
importScripts("https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js");

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDw9nRE2KLboTwoEUZqSYNGLKnYg7lNWH4",
  authDomain: "car-care-3bc4d.firebaseapp.com",
  projectId: "car-care-3bc4d",
  storageBucket: "car-care-3bc4d.firebasestorage.app",
  messagingSenderId: "1077651378480",
  appId: "1:1077651378480:web:03f8bc830a077e4ad878f5",
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Optional: Background Message Handler
messaging.onBackgroundMessage((payload) => {
  console.log(
    "[firebase-messaging-sw.js] Received background message ",
    payload
  );
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: "/android-chrome-192x192.png", // Optional: use your app icon
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
