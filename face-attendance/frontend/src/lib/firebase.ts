import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getMessaging, getToken, isSupported, Messaging } from "firebase/messaging";

// Your web app's Firebase configuration
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "face-detector-a401b.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "face-detector-a401b",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "face-detector-a401b.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "105856043784",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:105856043784:web:99dc89ab65e5725f07babd",
};

export const DEFAULT_VAPID_KEY =
  process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ||
  "BBqhdovTyApLjCA6bf8ayaMI26TBGBaqAfWQ9qR5lBBViwX8XcqOj9L8zBj0LXHLlMHgW_P3NxkXiZEL-zwB4dQ";

let app: FirebaseApp | null = null;
let messaging: Messaging | null = null;

if (typeof window !== "undefined" && firebaseConfig.apiKey) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  } catch (error) {
    console.error("Firebase initialization error:", error);
  }
}

export const getOrRegisterServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }

  try {
    // 1. Clean up any obsolete/conflicting service workers (such as legacy /sw.js)
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        const scriptUrl =
          reg.active?.scriptURL ||
          reg.installing?.scriptURL ||
          reg.waiting?.scriptURL ||
          "";
        if (scriptUrl.includes("/sw.js") && !scriptUrl.includes("firebase-messaging-sw.js")) {
          console.log("[SW] Cleaning up conflicting service worker:", scriptUrl);
          await reg.unregister();
        }
      }
    } catch {
      // Ignore unregister errors
    }

    // 2. Build query parameters for /firebase-messaging-sw.js
    const query = new URLSearchParams({
      apiKey: firebaseConfig.apiKey || "",
      authDomain: firebaseConfig.authDomain || "",
      projectId: firebaseConfig.projectId || "",
      storageBucket: firebaseConfig.storageBucket || "",
      messagingSenderId: firebaseConfig.messagingSenderId || "",
      appId: firebaseConfig.appId || "",
    }).toString();

    const swUrl = `/firebase-messaging-sw.js?${query}`;
    const registration = await navigator.serviceWorker.register(swUrl, {
      scope: "/",
    });

    // 3. Post configuration directly to the worker controller
    const activeWorker =
      registration.active || registration.installing || registration.waiting;
    if (activeWorker && firebaseConfig.apiKey) {
      activeWorker.postMessage({
        type: "SET_FIREBASE_CONFIG",
        config: firebaseConfig,
      });
    }

    // 4. Ensure service worker is ready
    await navigator.serviceWorker.ready;
    return registration;
  } catch (err) {
    console.warn("Service worker registration error:", err);
    return null;
  }
};

export const requestForToken = async (): Promise<string | null> => {
  if (typeof window === "undefined") return null;

  try {
    const supported = await isSupported().catch(() => false);
    if (!supported) {
      const isIos = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
      const isStandalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true;
      if (isIos && !isStandalone) {
        throw new Error(
          "On iPhone, push notifications require adding the app to your Home Screen first. Tap Share then 'Add to Home Screen'."
        );
      }
      throw new Error("Push notifications are not supported in this browser environment.");
    }

    if (!firebaseConfig.apiKey) {
      throw new Error(
        "Firebase Web API key is not configured. Please ensure NEXT_PUBLIC_FIREBASE_API_KEY is set."
      );
    }

    if (!app) {
      app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    }
    if (!messaging && app) {
      messaging = getMessaging(app);
    }
    if (!messaging) {
      throw new Error("Failed to initialize Firebase Messaging instance.");
    }

    const swRegistration = await getOrRegisterServiceWorker();
    if (!swRegistration) {
      throw new Error("Failed to register background notification service worker.");
    }

    const currentToken = await getToken(messaging, {
      vapidKey: DEFAULT_VAPID_KEY,
      serviceWorkerRegistration: swRegistration,
    });

    if (currentToken) {
      console.log("[FCM] Device token successfully retrieved.");
      return currentToken;
    } else {
      throw new Error("No registration token returned. Please grant notification permissions.");
    }
  } catch (err) {
    console.error("An error occurred while retrieving token: ", err);
    throw err;
  }
};

export { app, messaging };
