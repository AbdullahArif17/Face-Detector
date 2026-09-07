import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getMessaging, getToken, isSupported, Messaging } from "firebase/messaging";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp | null = null;
let messaging: Messaging | null = null;

if (
  typeof window !== "undefined" &&
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  firebaseConfig.messagingSenderId
) {
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
    
    // Wait for the service worker to become active if it's installing
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
      console.warn("Firebase messaging is not supported in this browser environment.");
      return null;
    }

    if (!app && firebaseConfig.apiKey) {
      app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    }
    if (!messaging && app) {
      messaging = getMessaging(app);
    }
    if (!messaging) return null;

    const swRegistration = await getOrRegisterServiceWorker();
    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

    const currentToken = await getToken(messaging, {
      vapidKey: vapidKey || undefined,
      serviceWorkerRegistration: swRegistration || undefined,
    });
    
    if (currentToken) {
      return currentToken;
    } else {
      console.warn("No registration token available. Request permission to generate one.");
      return null;
    }
  } catch (err) {
    console.error("An error occurred while retrieving token: ", err);
    throw err;
  }
};

export { app, messaging };
