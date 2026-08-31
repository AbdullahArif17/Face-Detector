"use client";

import { useEffect, useState } from "react";
import { requestForToken, messaging } from "@/lib/firebase";
import { onMessage } from "firebase/messaging";
import { registerDeviceToken } from "@/lib/api";

export function FirebaseNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return;
    }
    
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

  if (permission === "denied" || permission === "granted") {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between border-b bg-emerald-50 px-4 py-3 sm:top-4 sm:left-auto sm:right-4 sm:w-auto sm:min-w-[320px] sm:rounded-xl sm:border sm:shadow-lg animate-in slide-in-from-top-2 fade-in duration-300">
      <div className="flex items-center gap-3">
        <button className="-ml-2 size-6 shrink-0 rounded-full text-muted-foreground sm:ml-0 flex items-center justify-center hover:bg-black/5" onClick={() => setPermission("denied")}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          <span className="sr-only">Dismiss</span>
        </button>
        <div className="flex flex-col">
          <p className="text-sm font-semibold leading-tight text-foreground">Enable Notifications</p>
          <p className="text-xs text-muted-foreground">Get real-time updates</p>
        </div>
      </div>
      <button onClick={requestPermission} className="ml-4 h-8 shrink-0 rounded-full bg-emerald-600 px-4 text-xs font-semibold text-white hover:bg-emerald-700 shadow-sm transition-colors">
        Allow
      </button>
    </div>
  );
}
