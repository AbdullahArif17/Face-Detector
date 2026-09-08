"use client";

import { useCallback, useEffect, useState } from "react";
import { requestForToken, messaging } from "@/lib/firebase";
import { onMessage } from "firebase/messaging";
import { registerDeviceToken } from "@/lib/api";
import { useOptionalAuth } from "@/context/AuthContext";
import { BrandLogo } from "@/components/brand-logo";

export function FirebaseNotifications() {
  const auth = useOptionalAuth();
  const user = auth?.user ?? null;

  const [permission, setPermission] = useState<NotificationPermission>(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      return Notification.permission;
    }
    return "default";
  });

  const [isDismissed, setIsDismissed] = useState(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("fcm_prompt_dismissed") === "true";
    }
    return false;
  });

  const [isIosNonPwa] = useState(() => {
    if (typeof window === "undefined") return false;
    const ua = window.navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(ua);
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    return isIos && !isStandalone;
  });

  const setupNotifications = useCallback(async () => {
    if (!user || user.role === "viewer") {
      return;
    }
    try {
      const token = await requestForToken();
      if (token) {
        let deviceName = "Web Browser";
        if (typeof window !== "undefined") {
          const ua = window.navigator.userAgent;
          const isIos = /iphone|ipad|ipod/i.test(ua);
          const isAndroid = /android/i.test(ua);
          const isStandalone =
            window.matchMedia("(display-mode: standalone)").matches ||
            (window.navigator as unknown as { standalone?: boolean }).standalone === true;

          if (isIos) {
            deviceName = isStandalone ? "iPhone (App)" : "iPhone (Safari)";
          } else if (isAndroid) {
            deviceName = isStandalone ? "Android (App)" : "Android (Chrome)";
          } else if (/macintosh|mac os x/i.test(ua)) {
            deviceName = "Mac Browser";
          } else if (/windows/i.test(ua)) {
            deviceName = "Windows Browser";
          }
        }
        await registerDeviceToken(token, deviceName);
        console.log("[FCM] Device token registered successfully:", deviceName);
      }
    } catch (error) {
      console.warn("[FCM] Notification auto-setup note:", error);
    }
  }, [user]);

  // When permission is already granted, ensure device token is registered
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return;
    }

    if (!user || user.role === "viewer") {
      return;
    }

    if (Notification.permission === "granted") {
      void setupNotifications();
    }
  }, [user, setupNotifications]);

  // Foreground message listener
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window) || !messaging) {
      return;
    }

    if (!user || user.role === "viewer") {
      return;
    }

    const unsubscribe = onMessage(messaging, (payload) => {
      if (Notification.permission === "granted" && payload.notification) {
        new Notification(payload.notification.title || "Attendance Alert", {
          body: payload.notification.body,
          icon: payload.notification.image || "/images/face-attendance-logo.png",
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [user]);

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

  const handleDismiss = () => {
    setIsDismissed(true);
    try {
      sessionStorage.setItem("fcm_prompt_dismissed", "true");
    } catch {
      // Ignore storage errors
    }
  };

  // Do not show for viewers, logged-out users, iOS Safari outside PWA, or if already granted/denied/dismissed
  if (
    !user ||
    user.role === "viewer" ||
    isDismissed ||
    isIosNonPwa ||
    permission === "denied" ||
    permission === "granted"
  ) {
    return null;
  }

  return (
    <div
      className="fixed left-4 right-4 z-[9998] flex items-center justify-between rounded-xl border bg-background px-4 py-4 shadow-xl sm:bottom-4 sm:top-auto sm:left-auto sm:right-4 sm:w-auto sm:min-w-[340px] animate-in slide-in-from-bottom-4 fade-in duration-300"
      style={{ bottom: "1.25rem", marginBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex items-center gap-3">
        <button
          className="-ml-2 flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          onClick={handleDismiss}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
          <span className="sr-only">Dismiss</span>
        </button>
        <div className="flex items-center gap-3">
          <BrandLogo showName={false} markClassName="size-10 rounded-xl shadow-sm" />
          <div className="flex flex-col">
            <p className="text-base font-semibold leading-tight text-foreground">Notifications</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Get staff check-in alerts</p>
          </div>
        </div>
      </div>
      <button
        onClick={requestPermission}
        className="ml-4 h-9 shrink-0 rounded-full bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
      >
        Allow
      </button>
    </div>
  );
}
