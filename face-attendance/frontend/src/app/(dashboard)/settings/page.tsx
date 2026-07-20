"use client";

import { Copy, ExternalLink, RefreshCw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError } from "@/components/api-error";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export default function SettingsPage() {
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

  const kioskUrl = useMemo(() => {
    if (!apiKey || typeof window === "undefined") {
      return "";
    }
    const baseUrl = getKioskBaseUrl();
    if (!baseUrl) {
      return "";
    }
    return `${baseUrl}/kiosk?key=${encodeURIComponent(
      apiKey,
    )}`;
  }, [apiKey]);

  async function handleCopyKioskUrl(): Promise<void> {
    if (!kioskUrl) {
      return;
    }
    const copied = await copyToClipboard(kioskUrl);
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
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-balance sm:text-3xl">
          Settings
        </h1>
        <p className="mt-2 text-muted-foreground text-pretty">
          Create and operate secure, class-specific attendance kiosks.
        </p>
      </div>

      {hasError ? (
        <ApiError
          onRetry={() => void loadKioskSettings()}
          isRetrying={isLoading}
        />
      ) : null}

      {toastMessage ? (
        <p
          className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-medium text-green-700"
          role="status"
          aria-live="polite"
        >
          {toastMessage}
        </p>
      ) : null}

      <div className="rounded-lg border bg-card p-4 sm:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Attendance Kiosk</h2>
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
            <RefreshCw aria-hidden="true" className="size-4" />
            {isRegenerating ? "Regenerating..." : "Regenerate Access"}
          </Button>
        </div>

        {!hasKioskAccess ? (
          <p className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Only admins can view and manage kiosk links.
          </p>
        ) : (
          <div className="mt-6 grid gap-5">
            <div className="rounded-lg border bg-muted/20 p-4 sm:p-5">
              <h3 className="font-semibold">How to use the attendance kiosk</h3>
              <ol className="mt-4 grid gap-3 lg:grid-cols-2">
                {KIOSK_STEPS.map((step, index) => (
                  <li
                    key={step.title}
                    className="flex gap-3 rounded-md bg-background p-3"
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
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
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button asChild variant="outline" className="w-full sm:w-auto">
                  <Link href="/students">Manage student faces</Link>
                </Button>
                <Button asChild variant="outline" className="w-full sm:w-auto">
                  <Link href="/attendance">Open Attendance</Link>
                </Button>
              </div>
            </div>

            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="kiosk-url">
                Kiosk URL
              </label>
              <div className="flex flex-col gap-2 lg:flex-row">
                <Input
                  id="kiosk-url"
                  readOnly
                  value={
                    isLoading
                      ? "Loading kiosk access..."
                      : kioskUrl
                  }
                  onFocus={(event) => event.target.select()}
                />
                <Button
                  type="button"
                  className="gap-2 lg:w-auto"
                  disabled={!kioskUrl}
                  onClick={() => void handleCopyKioskUrl()}
                >
                  <Copy aria-hidden="true" className="size-4" />
                  Copy URL
                </Button>
                {kioskUrl ? (
                  <Button asChild variant="outline" className="gap-2 lg:w-auto">
                    <a href={kioskUrl} target="_blank" rel="noreferrer">
                      <ExternalLink aria-hidden="true" className="size-4" />
                      Open Kiosk
                    </a>
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    disabled
                    className="gap-2 lg:w-auto"
                  >
                    <ExternalLink aria-hidden="true" className="size-4" />
                    Open Kiosk
                  </Button>
                )}
              </div>
            </div>

            <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <ShieldCheck
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0"
              />
              <div>
                <p className="font-medium">Keep kiosk links private</p>
                <p className="mt-1 leading-5">
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
    </section>
  );
}
