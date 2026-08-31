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
    <div className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-between border-b bg-background px-3 py-2 shadow-sm sm:bottom-4 sm:top-auto sm:left-auto sm:right-4 sm:w-auto sm:min-w-[320px] sm:rounded-xl sm:border sm:shadow-lg animate-in slide-in-from-top-2 sm:slide-in-from-bottom-2 fade-in duration-300">
      <div className="flex items-center gap-3">
        <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground p-1 -ml-1">
          <X className="size-4" />
          <span className="sr-only">Dismiss</span>
        </button>
        <div className="flex items-center gap-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded bg-emerald-600 text-white shadow-sm">
             <Download className="size-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold leading-tight text-foreground">Face Attendance</span>
          </div>
        </div>
      </div>
      <Button size="sm" onClick={handleInstallClick} className="ml-4 h-7 shrink-0 rounded-full bg-[#22c55e] px-4 text-xs font-semibold text-white hover:bg-[#16a34a] shadow-sm">
        Install
      </Button>
    </div>
  );
}
