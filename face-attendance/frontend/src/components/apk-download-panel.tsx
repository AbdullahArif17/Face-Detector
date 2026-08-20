"use client";

import { Download, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";

interface GitHubRelease {
  tag_name: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
    size: number;
  }>;
}

export function ApkDownloadPanel() {
  const [apkDownloadUrl, setApkDownloadUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchLatestRelease() {
      setIsLoading(true);
      try {
        const response = await fetch(
          "https://api.github.com/repos/AbdullahArif17/Face-Detector/releases/latest",
          { headers: { Accept: "application/vnd.github.v3+json" } }
        );

        if (!response.ok) throw new Error("API Error");

        const release: GitHubRelease = await response.json();
        if (cancelled) return;

        const apkAsset = release.assets.find((asset) =>
          asset.name.endsWith(".apk")
        );

        if (apkAsset) {
          setApkDownloadUrl(apkAsset.browser_download_url);
        }
      } catch {
        // Silently fail if we can't fetch the release
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void fetchLatestRelease();

    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="mx-4 mb-4 rounded-xl border border-sidebar-border bg-sidebar-muted/30 p-4 shadow-sm">
        <div className="flex items-center justify-center py-2 text-sidebar-muted-fg">
          <Loader2 className="size-5 animate-spin" />
        </div>
      </div>
    );
  }

  if (!apkDownloadUrl) {
    return null;
  }

  return (
    <div className="mx-4 mb-4 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 via-sidebar-bg to-sidebar-bg p-4 shadow-sm relative overflow-hidden">
      {/* Decorative gradient orb */}
      <div className="absolute -right-4 -top-4 size-16 rounded-full bg-primary/10 blur-xl"></div>
      
      <div className="relative flex items-center gap-3 mb-3">
        <BrandLogo showName={false} markClassName="size-10 shadow-md" />
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-sidebar-fg truncate">
            Android App
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
        <a href={apkDownloadUrl} download>
          <Download className="size-4" />
          Install APK
        </a>
      </Button>
    </div>
  );
}
