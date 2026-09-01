"use client";

import { useEffect, useState } from "react";
import { Download, Share, PlusSquare, X } from "lucide-react";
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
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    // Check if the user has already dismissed the prompt in this session or previously
    const hasDismissed = localStorage.getItem("pwa-install-dismissed");
    
    // Detect iOS devices
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    
    // Detect if already installed (standalone mode)
    const isStandalone = 
      window.matchMedia("(display-mode: standalone)").matches || 
      (window.navigator as any).standalone === true;

    // Show custom prompt for iOS if not installed and not dismissed
    if (isIosDevice && !isStandalone && hasDismissed !== "true") {
      setIsIos(true);
      setShowPrompt(true);
    }

    // Check if the event was already captured by the script in layout.tsx
    if ((window as any).pwaDeferredPrompt) {
      setDeferredPrompt((window as any).pwaDeferredPrompt);
      if (hasDismissed !== "true") {
        setShowPrompt(true);
      }
    }

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

  // Render iOS specific manual install instructions
  if (isIos && !deferredPrompt) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-[9999] flex flex-col items-center justify-between rounded-xl border bg-background px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-4px_15px_-3px_rgba(0,0,0,0.15)] sm:bottom-4 sm:left-auto sm:right-4 sm:w-auto sm:min-w-[320px] sm:shadow-lg animate-in slide-in-from-bottom-4 fade-in duration-300">
        <div className="flex w-full items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded bg-emerald-600 text-white shadow-sm">
               <Download className="size-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-semibold leading-tight text-foreground">Install App</span>
              <span className="text-xs text-muted-foreground mt-0.5">Add Face Attendance to Home Screen</span>
            </div>
          </div>
          <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground p-1 -mr-1">
            <X className="size-5" />
            <span className="sr-only">Dismiss</span>
          </button>
        </div>
        <div className="mt-4 flex w-full flex-col gap-2 rounded-lg bg-muted/50 p-3 text-sm text-foreground">
          <div className="flex items-center gap-2">
            1. Tap <Share className="size-4 text-blue-500" /> in the browser toolbar
          </div>
          <div className="flex items-center gap-2">
            2. Select <PlusSquare className="size-4" /> Add to Home Screen
          </div>
        </div>
      </div>
    );
  }

  // Render standard install prompt for Android/Desktop
  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9999] flex items-center justify-between border-t bg-background px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-4px_15px_-3px_rgba(0,0,0,0.15)] sm:bottom-4 sm:border-t-0 sm:top-auto sm:left-auto sm:right-4 sm:w-auto sm:min-w-[320px] sm:rounded-xl sm:border sm:shadow-lg animate-in slide-in-from-bottom-2 fade-in duration-300">
      <div className="flex items-center gap-3">
        <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground p-1 -ml-1">
          <X className="size-5" />
          <span className="sr-only">Dismiss</span>
        </button>
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded bg-emerald-600 text-white shadow-sm">
             <Download className="size-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-base font-semibold leading-tight text-foreground">Face Attendance</span>
            <span className="text-xs text-muted-foreground mt-0.5">Install app for better experience</span>
          </div>
        </div>
      </div>
      <Button size="sm" onClick={handleInstallClick} className="ml-4 h-9 shrink-0 rounded-full bg-[#22c55e] px-5 text-sm font-semibold text-white hover:bg-[#16a34a] shadow-sm">
        Install
      </Button>
    </div>
  );
}
