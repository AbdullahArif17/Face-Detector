// Firebase Cloud Messaging Service Worker
// Required for receiving push notifications in the background

importScripts(
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"
);
importScripts(
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js"
);

// Initialize Firebase in the service worker
// Query params override or fallback to project configuration
let firebaseConfig = {
  apiKey: "AIzaSyAQk7QtMwV5DVoIIdzAHWUfJFeWtWqYLNg",
  authDomain: "face-detector-a401b.firebaseapp.com",
  projectId: "face-detector-a401b",
  storageBucket: "face-detector-a401b.firebasestorage.app",
  messagingSenderId: "105856043784",
  appId: "1:105856043784:web:99dc89ab65e5725f07babd",
};

try {
  const urlParams = new URL(self.location.href).searchParams;
  const apiKey = urlParams.get("apiKey");
  const projectId = urlParams.get("projectId");
  const messagingSenderId = urlParams.get("messagingSenderId");
  const appId = urlParams.get("appId");
  if (apiKey && projectId && messagingSenderId) {
    firebaseConfig = {
      apiKey,
      authDomain: urlParams.get("authDomain") || firebaseConfig.authDomain,
      projectId,
      storageBucket: urlParams.get("storageBucket") || firebaseConfig.storageBucket,
      messagingSenderId,
      appId: appId || firebaseConfig.appId,
    };
  }
} catch {
  // Use default config
}

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log("[firebase-messaging-sw] Background message received:", payload);

  const notificationTitle =
    payload.notification?.title ?? "Face Attendance";
  const notificationOptions = {
    body: payload.notification?.body ?? "",
    icon: "/images/face-attendance-logo.png",
    badge: "/images/face-attendance-logo.png",
    data: payload.data,
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes("/dashboard") && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow("/dashboard");
      }
    })
  );
});
