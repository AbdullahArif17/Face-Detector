import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getMessaging, getToken, isSupported, Messaging } from "firebase/messaging";

// Your web app's Firebase configuration
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const DEFAULT_VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY?.trim() || undefined;

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

    const vapidKey = DEFAULT_VAPID_KEY;
    let currentToken: string | null = null;

    try {
      currentToken = await getToken(messaging, {
        ...(vapidKey ? { vapidKey } : {}),
        serviceWorkerRegistration: swRegistration,
      });
    } catch (tokenErr: unknown) {
      console.warn("[FCM] Initial getToken attempt failed:", tokenErr);

      // If a custom VAPID key was provided and failed, try fallback without custom VAPID key
      if (vapidKey) {
        try {
          console.log("[FCM] Retrying getToken without custom VAPID key...");
          currentToken = await getToken(messaging, {
            serviceWorkerRegistration: swRegistration,
          });
        } catch (fallbackErr) {
          console.warn("[FCM] Fallback getToken without VAPID key also failed:", fallbackErr);
        }
      }

      if (!currentToken) {
        const rawMsg = tokenErr instanceof Error ? tokenErr.message : String(tokenErr);
        if (
          rawMsg.includes("messaging/token-subscribe-failed") ||
          rawMsg.includes("token-subscribe-failed")
        ) {
          throw new Error(
            "Push subscription failed (token-subscribe-failed). In Firebase Console > Project Settings > Cloud Messaging > Web configuration > Web Push certificates, click 'Generate key pair' (or copy your key pair) and set NEXT_PUBLIC_FIREBASE_VAPID_KEY in Vercel environment variables. Also ensure the 'FCM Registration API' is enabled in Google Cloud Console."
          );
        }
        throw tokenErr;
      }
    }

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
