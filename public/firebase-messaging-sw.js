// Use importScripts to import the Firebase SDK
importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js");

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDw9nRE2KLboTwoEUZqSYNGLKnYg7lNWH4",
  authDomain: "car-care-3bc4d.firebaseapp.com",
  projectId: "car-care-3bc4d",
  storageBucket: "car-care-3bc4d.firebasestorage.app",
  messagingSenderId: "1077651378480",
  appId: "1:1077651378480:web:03f8bc830a077e4ad878f5"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const messaging = firebase.messaging();

// --- NEW CODE STARTS HERE ---
// This is the handler that will be called when a push message is received
// while the app is in the background or closed.
messaging.onBackgroundMessage((payload) => {
  console.log(
    "[firebase-messaging-sw.js] Received background message ",
    payload
  );
  
  // Customize the notification here
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: "/apple-touch-icon.png", // You can use your app icon
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
// --- NEW CODE ENDS HERE ---
