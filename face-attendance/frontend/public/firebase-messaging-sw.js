// Firebase Cloud Messaging Service Worker
// Required for receiving push notifications in the background

importScripts(
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"
);
importScripts(
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js"
);

// Initialize Firebase in the service worker
// Configuration is injected via query parameters upon service worker registration
let messaging = null;

try {
  const urlParams = new URL(self.location.href).searchParams;
  const apiKey = urlParams.get("apiKey");
  const projectId = urlParams.get("projectId");
  const messagingSenderId = urlParams.get("messagingSenderId");
  const appId = urlParams.get("appId");
  const authDomain = urlParams.get("authDomain");
  const storageBucket = urlParams.get("storageBucket");

  if (apiKey && projectId && messagingSenderId) {
    if (!firebase.apps.length) {
      firebase.initializeApp({
        apiKey,
        authDomain: authDomain || undefined,
        projectId,
        storageBucket: storageBucket || undefined,
        messagingSenderId,
        appId: appId || undefined,
      });
    }
  }

  if (firebase.apps.length) {
    messaging = firebase.messaging();
  }
} catch (err) {
  console.warn("[firebase-messaging-sw] Initialization notice:", err);
}

// Handle background messages
if (messaging) {
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
}

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
