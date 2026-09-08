/// <reference lib="webworker" />

// Legacy migration worker: unregisters itself to allow /firebase-messaging-sw.js to manage the app
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    self.registration.unregister().then(() => {
      return self.clients.claim();
    })
  );
});
