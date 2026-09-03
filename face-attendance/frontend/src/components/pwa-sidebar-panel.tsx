"use client";

import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface WindowWithPwa extends Window {
  pwaDeferredPrompt?: BeforeInstallPromptEvent;
}

export function PwaSidebarPanel() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosInstructions, setShowIosInstructions] = useState(false);

  useEffect(() => {
    // Check if already installed as PWA
    if (window.matchMedia("(display-mode: standalone)").matches) {
      queueMicrotask(() => setIsInstalled(true));
      return;
    }

    const win = window as unknown as WindowWithPwa;
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);

    queueMicrotask(() => {
      // Check if the event was already captured by the script in layout.tsx
      if (win.pwaDeferredPrompt) {
        setDeferredPrompt(win.pwaDeferredPrompt);
      }

      // Detect iOS devices
      if (isIosDevice) {
        setIsIos(true);
      }
    });

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstallPWA = async () => {
    if (isIos) {
      setShowIosInstructions(true);
      return;
    }
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome === "accepted") {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  // Only show the panel if PWA install is available (or iOS) and not already installed
  if (isInstalled || (!deferredPrompt && !isIos)) return null;

  return (
    <div className="mx-4 mb-4 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 via-sidebar-bg to-sidebar-bg p-4 shadow-sm relative overflow-hidden">
      {/* Decorative gradient orb */}
      <div className="absolute -right-4 -top-4 size-16 rounded-full bg-primary/10 blur-xl"></div>
      
      <div className="relative flex items-center gap-3 mb-3">
        <BrandLogo showName={false} markClassName="size-10 shadow-md" />
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-sidebar-fg truncate">
            Face Detector
          </h4>
          <p className="text-xs text-sidebar-muted-fg line-clamp-1">
            Install on your device
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {showIosInstructions ? (
          <div className="rounded-lg bg-background/50 p-3 text-xs text-sidebar-fg">
            <p className="mb-2 font-medium">To install on iOS:</p>
            <p>1. Tap the Share button</p>
            <p>2. Select &quot;Add to Home Screen&quot;</p>
          </div>
        ) : (
          <Button
            onClick={handleInstallPWA}
            className="w-full gap-2 bg-primary hover:bg-primary/90 text-white shadow-sm transition-all hover:scale-[1.02]"
            size="sm"
          >
            <Smartphone className="size-4" />
            Install App
          </Button>
        )}
      </div>
    </div>
  );
}
