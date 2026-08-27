"use client";

import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";

export function ApkDownloadPanel() {
  const [deferredPrompt, setDeferredPrompt] = useState<Event | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed as PWA
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstallPWA = async () => {
    if (!deferredPrompt) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prompt = deferredPrompt as any;
    prompt.prompt();
    const result = await prompt.userChoice;
    if (result.outcome === "accepted") {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  // Only show the panel if PWA install is available and not already installed
  if (isInstalled || !deferredPrompt) return null;

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
        <Button
          onClick={handleInstallPWA}
          className="w-full gap-2 bg-primary hover:bg-primary/90 text-white shadow-sm transition-all hover:scale-[1.02]"
          size="sm"
        >
          <Smartphone className="size-4" />
          Install App
        </Button>
      </div>
    </div>
  );
}
