"use client";

import { Download } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";

export function ApkDownloadPanel() {
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
            Install the app
          </p>
        </div>
      </div>
      <Button
        asChild
        className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white shadow-sm transition-all hover:scale-[1.02]"
        size="sm"
      >
        <a href="https://github.com/AbdullahArif17/Face-Detector/releases/latest/download/app-release.apk" target="_blank" rel="noreferrer">
          <Download className="size-4" />
          Install APK
        </a>
      </Button>
    </div>
  );
}
