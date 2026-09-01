"use client";

import { useEffect, useState } from "react";
import { requestForToken, messaging } from "@/lib/firebase";
import { onMessage } from "firebase/messaging";
import { registerDeviceToken } from "@/lib/api";

export function FirebaseNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isStandalone, setIsStandalone] = useState(false);
  
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return;
    }
    
    // Detect if already installed (standalone mode)
    const standalone = 
      window.matchMedia("(display-mode: standalone)").matches || 
      (window.navigator as any).standalone === true;
      
    setIsStandalone(standalone);
    
    setPermission(Notification.permission);
    
    if (Notification.permission === "granted") {
      setupNotifications();
    }
  }, []);

  const setupNotifications = async () => {
    try {
      const token = await requestForToken();
      if (token) {
        // Send to backend
        await registerDeviceToken(token);
      }
      
      // Handle foreground messages
      if (messaging) {
        onMessage(messaging, (payload) => {
          console.log("Message received in foreground: ", payload);
          // Show foreground notification
          if (payload.notification) {
            new Notification(payload.notification.title || "Notification", {
              body: payload.notification.body,
              icon: payload.notification.image || "/icon-192x192.png",
            });
          }
        });
      }
    } catch (error) {
      console.error("Error setting up notifications:", error);
    }
  };

  const requestPermission = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return;
    }
    
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === "granted") {
        await setupNotifications();
      }
    } catch (error) {
      console.error("Error requesting notification permission:", error);
    }
  };

  if (!isStandalone || permission === "denied" || permission === "granted") {
    return null;
  }

  return (
    <div className="fixed top-[max(1rem,env(safe-area-inset-top))] left-4 right-4 z-[9999] flex items-center justify-between rounded-xl border bg-background px-4 py-4 shadow-lg sm:top-4 sm:left-auto sm:right-4 sm:w-auto sm:min-w-[320px] animate-in slide-in-from-top-4 fade-in duration-300">
      <div className="flex items-center gap-3">
        <button className="-ml-2 flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted" onClick={() => setPermission("denied")}>
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          <span className="sr-only">Dismiss</span>
        </button>
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded bg-blue-600 text-white shadow-sm">
             <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
          </div>
          <div className="flex flex-col">
            <p className="text-base font-semibold leading-tight text-foreground">Notifications</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Get real-time updates</p>
          </div>
        </div>
      </div>
      <button onClick={requestPermission} className="ml-4 h-9 shrink-0 rounded-full bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700">
        Allow
      </button>
    </div>
  );
}
