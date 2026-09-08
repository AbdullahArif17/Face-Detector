// Face Attendance — Unified PWA & Firebase Cloud Messaging Service Worker
/// <reference lib="webworker" />

const CACHE_NAME = "face-attendance-pwa-v2";
const PRECACHE_URLS = ["/", "/login", "/dashboard"];

// --------------------------------------------------------------------------
// 1. PWA Installation & Cache Lifecycle
// --------------------------------------------------------------------------
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => {})
  );
  // Force active state immediately without waiting for old workers to shut down
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  // Only cache GET requests, skip backend API calls
  if (event.request.method !== "GET" || event.request.url.includes("/api/")) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// --------------------------------------------------------------------------
// 2. Firebase Cloud Messaging Setup
// --------------------------------------------------------------------------
let messaging = null;

function initFirebase(config) {
  if (!config || !config.apiKey) return;
  try {
    if (typeof firebase !== "undefined") {
      if (!firebase.apps.length) {
        firebase.initializeApp(config);
      }
      if (firebase.apps.length && !messaging) {
        messaging = firebase.messaging();
        attachBackgroundHandler();
      }
    }
  } catch (err) {
    console.warn("[SW] Firebase initialization error:", err);
  }
}

function attachBackgroundHandler() {
  if (!messaging) return;
  try {
    messaging.onBackgroundMessage((payload) => {
      console.log("[SW] Firebase background message received:", payload);
      const title = payload.notification?.title || payload.data?.title || "Face Attendance";
      const body = payload.notification?.body || payload.data?.body || "";
      const icon = payload.notification?.icon || "/images/face-attendance-logo.png";
      const badge = "/images/face-attendance-logo.png";

      self.registration.showNotification(title, {
        body,
        icon,
        badge,
        data: payload.data || {},
        vibrate: [100, 50, 100],
      });
    });
  } catch (e) {
    console.warn("[SW] onBackgroundMessage listener failed:", e);
  }
}

// Load Firebase Scripts safely
try {
  importScripts(
    "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js",
    "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js"
  );
} catch (e) {
  console.warn("[SW] Failed to importScripts for Firebase:", e);
}

// Parse configuration from URL query params (passed on registration)
try {
  const urlParams = new URL(self.location.href).searchParams;
  const apiKey = urlParams.get("apiKey");
  const projectId = urlParams.get("projectId");
  const messagingSenderId = urlParams.get("messagingSenderId");
  const appId = urlParams.get("appId");
  const authDomain = urlParams.get("authDomain");
  const storageBucket = urlParams.get("storageBucket");

  if (apiKey && projectId && messagingSenderId) {
    initFirebase({
      apiKey,
      projectId,
      messagingSenderId,
      appId: appId || undefined,
      authDomain: authDomain || undefined,
      storageBucket: storageBucket || undefined,
    });
  }
} catch (err) {
  console.warn("[SW] Query param config parsing error:", err);
}

// Allow client window to dynamically send Firebase config via postMessage
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SET_FIREBASE_CONFIG") {
    initFirebase(event.data.config);
  }
});

// --------------------------------------------------------------------------
// 3. Direct Native Web Push Event Listener (Bulletproof Fallback)
// --------------------------------------------------------------------------
// Guarantees push notification display even if Firebase compat is loading
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    try {
      data = { notification: { body: event.data ? event.data.text() : "" } };
    } catch {
      data = {};
    }
  }

  const notification = data.notification || {};
  const title = notification.title || data.title || "Face Attendance";
  const body = notification.body || data.body || "New attendance update";
  const icon = notification.icon || "/images/face-attendance-logo.png";
  const badge = "/images/face-attendance-logo.png";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      data: data.data || data,
      vibrate: [100, 50, 100],
      tag: data.data?.event_type || "attendance-alert",
    })
  );
});

// --------------------------------------------------------------------------
// 4. Notification Click — Focus or Open Dashboard
// --------------------------------------------------------------------------
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && client.url.includes("/dashboard") && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow("/dashboard");
      }
    })
  );
});
