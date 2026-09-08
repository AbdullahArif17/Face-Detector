"use client";

import { useEffect } from "react";
import { getOrRegisterServiceWorker } from "@/lib/firebase";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      void getOrRegisterServiceWorker()
        .then((reg) => {
          if (reg) {
            console.log("[PWA] Unified service worker active at scope:", reg.scope);
          }
        })
        .catch((err) => {
          console.warn("[PWA] Service worker registration error:", err);
        });
    }
  }, []);

  return null;
}
