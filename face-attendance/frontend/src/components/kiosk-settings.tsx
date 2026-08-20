"use client";

import { Copy, ExternalLink, RefreshCw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError } from "@/components/api-error";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import {
  getCompanyApiKey,
  regenerateCompanyApiKey,
} from "@/lib/api";
import { canManageKiosk } from "@/lib/permissions";

const KIOSK_STEPS = [
  {
    title: "Enroll student faces",
    description:
      "Open Students and enroll two or three clear, front-facing photos for each student.",
  },
  {
    title: "Start attendance",
    description:
      "Open Attendance and start a global session before scanning anyone.",
  },
  {
    title: "Open the kiosk",
    description:
      "Open the link on an HTTPS camera device, allow camera access, and scan students one at a time.",
  },
  {
    title: "Stop the session",
    description:
      "Stop the session when attendance is complete. Scans outside an active session are not recorded.",
  },
] as const;

function getKioskBaseUrl(): string {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_KIOSK_BASE_URL?.trim();
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/$/, "");
  }

  if (typeof window === "undefined") {
    return "";
  }

  return window.location.origin;
}

function copyTextWithFallback(text: string): boolean {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  textArea.style.top = "0";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(textArea);
  }
}

async function copyToClipboard(text: string): Promise<boolean> {
  if (
    window.isSecureContext &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall back for browsers that expose Clipboard API but reject the write.
    }
  }

  return copyTextWithFallback(text);
}

export function KioskSettings() {
  const { user } = useAuth();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isRegenerateDialogOpen, setIsRegenerateDialogOpen] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const hasKioskAccess = canManageKiosk(user);

  const loadKioskSettings = useCallback(async (): Promise<void> => {
    if (!user || !hasKioskAccess) {
      return;
    }

    setIsLoading(true);
    try {
      const keyResponse = await getCompanyApiKey(user.company_id);
      setApiKey(keyResponse.api_key);
      setHasError(false);
    } catch {
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, [hasKioskAccess, user]);

  useEffect(() => {
    void Promise.resolve().then(loadKioskSettings);
  }, [loadKioskSettings]);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }
    const timeout = window.setTimeout(() => setToastMessage(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  const checkInKioskUrl = useMemo(() => {
    if (!apiKey || typeof window === "undefined") {
      return "";
    }
    const baseUrl = getKioskBaseUrl();
    if (!baseUrl) {
      return "";
    }
    return `${baseUrl}/kiosk?key=${encodeURIComponent(
      apiKey,
    )}&action=check_in`;
  }, [apiKey]);

  const checkOutKioskUrl = useMemo(() => {
    if (!apiKey || typeof window === "undefined") {
      return "";
    }
    const baseUrl = getKioskBaseUrl();
    if (!baseUrl) {
      return "";
    }
    return `${baseUrl}/kiosk?key=${encodeURIComponent(
      apiKey,
    )}&action=check_out`;
  }, [apiKey]);

  async function handleCopyKioskUrl(url: string): Promise<void> {
    if (!url) {
      return;
    }
    const copied = await copyToClipboard(url);
    setToastMessage(
      copied
        ? "Kiosk URL copied"
        : "Copy was blocked. Select the Kiosk URL field and copy it manually.",
    );
  }

  async function handleRegenerateKey(): Promise<void> {
    if (!user || isRegenerating) {
      return;
    }

    setIsRegenerating(true);
    setHasError(false);
    try {
      const response = await regenerateCompanyApiKey(user.company_id);
      setApiKey(response.api_key);
      setToastMessage("Kiosk access key regenerated");
      setIsRegenerateDialogOpen(false);
    } catch {
      setHasError(true);
    } finally {
      setIsRegenerating(false);
    }
  }

  return (
    <div className="space-y-6">

      {hasError ? (
        <ApiError
          onRetry={() => void loadKioskSettings()}
          isRetrying={isLoading}
        />
      ) : null}

      {toastMessage ? (
        <p
          className="animate-fade-in rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-700 shadow-sm"
          role="status"
          aria-live="polite"
        >
          {toastMessage}
        </p>
      ) : null}

      <div className="rounded-xl border bg-card p-5 sm:p-7 shadow-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Attendance Kiosk</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Generate a secure kiosk link for your attendance devices.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2 md:w-auto"
            disabled={!hasKioskAccess || isRegenerating}
            onClick={() => setIsRegenerateDialogOpen(true)}
          >
            <RefreshCw aria-hidden="true" className={cn("size-4", isRegenerating && "animate-spin")} />
            {isRegenerating ? "Regenerating..." : "Regenerate Access"}
          </Button>
        </div>

        {!hasKioskAccess ? (
          <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-sm">
            Only admins can view and manage kiosk links.
          </p>
        ) : (
          <div className="mt-6 grid gap-6">
            <div className="rounded-xl border bg-muted/30 p-5 shadow-sm">
              <h3 className="font-semibold tracking-tight">How to use the attendance kiosk</h3>
              <ol className="mt-4 grid gap-3 lg:grid-cols-2">
                {KIOSK_STEPS.map((step, index) => (
                  <li
                    key={step.title}
                    className="flex gap-3 rounded-md bg-background p-3"
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary ring-1 ring-primary/20">
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium">{step.title}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {step.description}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <Button asChild variant="outline" className="w-full sm:w-auto shadow-sm">
                  <Link href="/students">Manage student faces</Link>
                </Button>
                <Button asChild variant="outline" className="w-full sm:w-auto shadow-sm">
                  <Link href="/teachers">Manage teacher faces</Link>
                </Button>
                <Button asChild variant="outline" className="w-full sm:w-auto shadow-sm">
                  <Link href="/staff">Manage staff faces</Link>
                </Button>
              </div>
            </div>

            <div className="grid gap-6">
              <div className="grid gap-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="check-in-kiosk-url">
                  Check-in Kiosk URL
                </label>
                <div className="flex flex-col gap-3 lg:flex-row">
                  <Input
                    id="check-in-kiosk-url"
                    readOnly
                    className="font-mono text-xs shadow-sm bg-background"
                    value={
                      isLoading
                        ? "Loading kiosk access..."
                        : checkInKioskUrl
                    }
                    onFocus={(event) => event.target.select()}
                  />
                  <Button
                    type="button"
                    className="gap-2 shadow-sm lg:w-auto"
                    disabled={!checkInKioskUrl}
                    onClick={() => void handleCopyKioskUrl(checkInKioskUrl)}
                  >
                    <Copy aria-hidden="true" className="size-4" />
                    Copy URL
                  </Button>
                  {checkInKioskUrl ? (
                    <Button asChild variant="outline" className="gap-2 shadow-sm lg:w-auto">
                      <a href={checkInKioskUrl} target="_blank" rel="noreferrer">
                        <ExternalLink aria-hidden="true" className="size-4" />
                        Open Kiosk
                      </a>
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      disabled
                      className="gap-2 shadow-sm lg:w-auto"
                    >
                      <ExternalLink aria-hidden="true" className="size-4" />
                      Open Kiosk
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid gap-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="check-out-kiosk-url">
                  Check-out Kiosk URL
                </label>
                <div className="flex flex-col gap-3 lg:flex-row">
                  <Input
                    id="check-out-kiosk-url"
                    readOnly
                    className="font-mono text-xs shadow-sm bg-background"
                    value={
                      isLoading
                        ? "Loading kiosk access..."
                        : checkOutKioskUrl
                    }
                    onFocus={(event) => event.target.select()}
                  />
                  <Button
                    type="button"
                    className="gap-2 shadow-sm lg:w-auto"
                    disabled={!checkOutKioskUrl}
                    onClick={() => void handleCopyKioskUrl(checkOutKioskUrl)}
                  >
                    <Copy aria-hidden="true" className="size-4" />
                    Copy URL
                  </Button>
                  {checkOutKioskUrl ? (
                    <Button asChild variant="outline" className="gap-2 shadow-sm lg:w-auto">
                      <a href={checkOutKioskUrl} target="_blank" rel="noreferrer">
                        <ExternalLink aria-hidden="true" className="size-4" />
                        Open Kiosk
                      </a>
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      disabled
                      className="gap-2 shadow-sm lg:w-auto"
                    >
                      <ExternalLink aria-hidden="true" className="size-4" />
                      Open Kiosk
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-4 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 shadow-sm">
              <ShieldCheck
                aria-hidden="true"
                className="mt-0.5 size-6 shrink-0 text-amber-600"
              />
              <div>
                <p className="font-semibold tracking-tight">Keep kiosk links private</p>
                <p className="mt-1 leading-relaxed text-amber-800">
                  A kiosk URL contains your organization&apos;s access key. Do not
                  post it publicly. Regenerate access immediately if a link is
                  exposed or a kiosk device is lost.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={isRegenerateDialogOpen}
        title="Regenerate kiosk access?"
        description="The existing kiosk link will stop working immediately. You will need to copy and redistribute the new link."
        confirmLabel="Regenerate access"
        busyLabel="Regenerating..."
        destructive
        isConfirming={isRegenerating}
        onOpenChange={setIsRegenerateDialogOpen}
        onConfirm={() => void handleRegenerateKey()}
      />
    </div>
  );
}
