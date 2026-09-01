// Firebase Cloud Messaging Service Worker
// Required for receiving push notifications in the background

importScripts(
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"
);
importScripts(
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js"
);

// Initialize Firebase in the service worker
// The actual config values are injected by the client when it activates messaging
firebase.initializeApp({
  apiKey: "placeholder",
  projectId: "placeholder",
  messagingSenderId: "placeholder",
  appId: "placeholder",
});

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
