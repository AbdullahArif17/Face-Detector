"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";

// Define the BeforeInstallPromptEvent interface
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: Array<string>;
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Check if the user has already dismissed the prompt in this session or previously
    const hasDismissed = localStorage.getItem("pwa-install-dismissed");
    
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      
      // Update UI notify the user they can install the PWA
      if (hasDismissed !== "true") {
        setShowPrompt(true);
      }
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      return;
    }
    // Show the install prompt
    await deferredPrompt.prompt();
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    // We've used the prompt, and can't use it again, throw it away
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem("pwa-install-dismissed", "true");
  };

  if (!showPrompt) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 w-[90%] max-w-sm items-center justify-between rounded-lg border bg-card p-4 shadow-lg animate-in slide-in-from-bottom-5 fade-in duration-300">
      <div className="flex flex-col gap-1 pr-2">
        <p className="text-sm font-medium leading-none">Install App</p>
        <p className="text-xs text-muted-foreground">Add to home screen for a better experience.</p>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleInstallClick} className="h-8 gap-1.5 px-3">
          <Download className="size-3.5" />
          Install
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground shrink-0" onClick={handleDismiss}>
          <X className="size-4" />
          <span className="sr-only">Dismiss</span>
        </Button>
      </div>
    </div>
  );
}
