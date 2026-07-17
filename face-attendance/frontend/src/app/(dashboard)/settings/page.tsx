"use client";

import { Copy, Eye, EyeOff, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ApiError } from "@/components/api-error";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { canManageKiosk } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import {
  getCompanyApiKey,
  getSchoolClasses,
  getSchoolSettings,
  regenerateCompanyApiKey,
  sendWhatsappTest,
  type SchoolSettings,
  type SchoolClass,
  updateSchoolSettings,
} from "@/lib/api";

function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 8) {
    return "••••••••";
  }
  return `${apiKey.slice(0, 3)}${"•".repeat(12)}${apiKey.slice(-3)}`;
}

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
  const [classId, setClassId] = useState("");
  const [schoolClasses, setSchoolClasses] = useState<SchoolClass[]>([]);
  const [schoolSettings, setSchoolSettings] = useState<SchoolSettings | null>(
    null,
  );
  const [showKey, setShowKey] = useState(false);
  const [schoolPhone, setSchoolPhone] = useState("");
  const [whatsappToken, setWhatsappToken] = useState("");
  const [whatsappPhoneId, setWhatsappPhoneId] = useState("");
  const [showWhatsappToken, setShowWhatsappToken] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isTestingWhatsapp, setIsTestingWhatsapp] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isRegenerateDialogOpen, setIsRegenerateDialogOpen] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const hasKioskAccess = canManageKiosk(user);

  useEffect(() => {
    if (!user || !hasKioskAccess) {
      return;
    }

    let isCancelled = false;

    void Promise.resolve().then(async () => {
      if (!isCancelled) {
        setIsLoading(true);
      }

      try {
        const [keyResponse, settingsResponse, classesResponse] = await Promise.all([
          getCompanyApiKey(user.company_id),
          getSchoolSettings(user.company_id),
          getSchoolClasses(user.company_id),
        ]);
        if (!isCancelled) {
          setApiKey(keyResponse.api_key);
          setSchoolPhone(settingsResponse.school_phone ?? "");
          setWhatsappPhoneId(settingsResponse.whatsapp_phone_id ?? "");
          setSchoolSettings(settingsResponse);
          setSchoolClasses(classesResponse);
          setClassId((currentClassId) =>
            currentClassId || (classesResponse[0]?.id.toString() ?? ""),
          );
          setHasError(false);
        }
      } catch {
        if (!isCancelled) {
          setHasError(true);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [hasKioskAccess, user]);

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
    const normalizedClass = classId.trim();
    if (!normalizedClass) {
      return "";
    }
    const baseUrl = getKioskBaseUrl();
    if (!baseUrl) {
      return "";
    }
    return `${baseUrl}/kiosk?key=${encodeURIComponent(
      apiKey,
    )}&class_id=${encodeURIComponent(normalizedClass)}`;
  }, [apiKey, classId]);

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
      setShowKey(false);
      setToastMessage("Kiosk API key regenerated");
      setIsRegenerateDialogOpen(false);
    } catch {
      setHasError(true);
    } finally {
      setIsRegenerating(false);
    }
  }

  async function handleSaveSettings(): Promise<void> {
    if (!user || isSavingSettings) {
      return;
    }

    setIsSavingSettings(true);
    setHasError(false);
    try {
      const response = await updateSchoolSettings(user.company_id, {
        school_phone: schoolPhone.trim() || null,
        whatsapp_phone_id: whatsappPhoneId.trim() || null,
        whatsapp_token: whatsappToken.trim() || undefined,
      });
      setSchoolPhone(response.school_phone ?? "");
      setWhatsappPhoneId(response.whatsapp_phone_id ?? "");
      setSchoolSettings(response);
      setWhatsappToken("");
      setToastMessage("School WhatsApp settings saved");
    } catch {
      setHasError(true);
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function handleTestWhatsapp(): Promise<void> {
    if (isTestingWhatsapp || !testPhone.trim()) {
      return;
    }
    setIsTestingWhatsapp(true);
    setHasError(false);
    try {
      const result = await sendWhatsappTest(
        testPhone.trim(),
        "Face Attendance test message from school settings.",
      );
      setToastMessage(
        result.success
          ? "Test WhatsApp message sent"
          : `Test failed: ${result.error ?? "Unknown error"}`,
      );
    } catch (error) {
      const detail =
        (error as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Unable to send test WhatsApp message.";
      setToastMessage(`Test failed: ${detail}`);
      setHasError(true);
    } finally {
      setIsTestingWhatsapp(false);
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-balance sm:text-3xl">
          Settings
        </h1>
        <p className="mt-2 text-muted-foreground text-pretty">
          Organization settings and kiosk setup.
        </p>
      </div>

      {hasError ? <ApiError /> : null}

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
        <div>
          <h2 className="text-xl font-semibold">WhatsApp Configuration</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure Meta WhatsApp Business API credentials and absence alert timing.
          </p>
        </div>

        {!hasKioskAccess ? (
          <p className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Only admins can manage WhatsApp configuration.
          </p>
        ) : (
          <div className="mt-6 grid gap-5">
            {schoolSettings ? (
              <div className="grid gap-2">
                {schoolSettings.whatsapp_test_mode ? (
                  <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                    WhatsApp test mode is active. Messages can only be sent to {schoolSettings.whatsapp_test_recipient_masked ?? "the configured test recipient"}; all other recipients are blocked before contacting Meta.
                  </p>
                ) : null}
                <p
                  className={cn(
                    "rounded-md border px-3 py-2 text-sm",
                    schoolSettings.whatsapp_token_configured
                      ? "border-green-200 bg-green-50 text-green-800"
                      : "border-amber-200 bg-amber-50 text-amber-800",
                  )}
                >
                  {schoolSettings.whatsapp_token_configured
                    ? schoolSettings.whatsapp_uses_default_credentials
                      ? "WhatsApp is ready using the default backend token and phone number ID. Admins can leave the school-specific fields blank."
                      : "WhatsApp is ready using this school's configured credentials."
                    : "WhatsApp is not configured. Add school credentials here or configure default backend credentials."}
                </p>
                <div className="grid gap-2 rounded-md border bg-muted/20 p-3 text-sm sm:grid-cols-2">
                  <span>
                    Secure webhook: {schoolSettings.whatsapp_webhook_secure ? "Ready" : "Missing META_APP_SECRET"}
                  </span>
                  <span>
                    Parent chatbot: {schoolSettings.whatsapp_chatbot_ready ? "Ready" : "Not ready"}
                  </span>
                  <span>
                    Check-in template: {schoolSettings.whatsapp_checkin_template_configured ? "Configured" : "Missing"}
                  </span>
                  <span>
                    Check-out template: {schoolSettings.whatsapp_checkout_template_configured ? "Configured" : "Missing"}
                  </span>
                  <span>
                    Absent template: {schoolSettings.whatsapp_absent_template_configured ? "Configured" : "Missing"}
                  </span>
                </div>
              </div>
            ) : null}

            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="whatsapp-token">
                WhatsApp Access Token
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="whatsapp-token"
                  type={showWhatsappToken ? "text" : "password"}
                  value={whatsappToken}
                  onChange={(event) => setWhatsappToken(event.target.value)}
                  placeholder="Paste a new token to replace the stored token"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2 sm:w-auto"
                  onClick={() => setShowWhatsappToken((current) => !current)}
                >
                  {showWhatsappToken ? (
                    <EyeOff aria-hidden="true" className="size-4" />
                  ) : (
                    <Eye aria-hidden="true" className="size-4" />
                  )}
                  {showWhatsappToken ? "Hide" : "Show"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Leave blank to keep the existing token.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <label className="text-sm font-medium" htmlFor="phone-number-id">
                  Phone Number ID
                </label>
                <Input
                  id="phone-number-id"
                  value={whatsappPhoneId}
                  onChange={(event) => setWhatsappPhoneId(event.target.value)}
                  placeholder="Meta phone number ID"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium" htmlFor="absent-alert-time">
                  Attendance Mode
                </label>
                <Input
                  id="absent-alert-time"
                  value="Real-time class sessions only"
                  disabled
                />
                <p className="text-xs text-muted-foreground">
                  Students are marked only when this class session is ON in Attendance.
                </p>
              </div>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="school-phone">
                School Phone Number
              </label>
              <Input
                id="school-phone"
                inputMode="numeric"
                value={schoolPhone}
                onChange={(event) => setSchoolPhone(event.target.value)}
                placeholder="923001111111"
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="test-phone">
                Test WhatsApp Number
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="test-phone"
                  inputMode="numeric"
                  value={testPhone}
                  onChange={(event) => setTestPhone(event.target.value)}
                  placeholder="923001234567"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2 sm:w-auto"
                  disabled={isTestingWhatsapp || !testPhone.trim()}
                  onClick={() => void handleTestWhatsapp()}
                >
                  {isTestingWhatsapp ? "Testing..." : "Test WhatsApp"}
                </Button>
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                disabled={isSavingSettings}
                onClick={() => void handleSaveSettings()}
              >
                {isSavingSettings ? "Saving..." : "Save WhatsApp Settings"}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-card p-4 sm:p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Kiosk Setup</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Use this key to run a class attendance kiosk without JWT login.
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
            {isRegenerating ? "Regenerating..." : "Regenerate Key"}
          </Button>
        </div>

        {!hasKioskAccess ? (
          <p className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Only admins can view kiosk setup.
          </p>
        ) : (
          <div className="mt-6 grid gap-5">
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="api-key">
                Company API Key
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="api-key"
                  readOnly
                  value={
                    isLoading
                      ? "Loading..."
                      : apiKey
                        ? showKey
                          ? apiKey
                          : maskApiKey(apiKey)
                        : "No key available"
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2 sm:w-auto"
                  disabled={!apiKey}
                  onClick={() => setShowKey((current) => !current)}
                >
                  {showKey ? (
                    <EyeOff aria-hidden="true" className="size-4" />
                  ) : (
                    <Eye aria-hidden="true" className="size-4" />
                  )}
                  {showKey ? "Hide Key" : "Show Key"}
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="kiosk-class">
                Class ID
              </label>
              <select
                id="kiosk-class"
                value={classId}
                onChange={(event) => setClassId(event.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Select class</option>
                {schoolClasses.map((schoolClass) => (
                  <option key={schoolClass.id} value={schoolClass.id}>
                    {schoolClass.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="kiosk-url">
                Kiosk URL
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="kiosk-url"
                  readOnly
                  value={kioskUrl}
                  onFocus={(event) => event.target.select()}
                />
                <Button
                  type="button"
                  className="gap-2 sm:w-auto"
                  disabled={!kioskUrl}
                  onClick={() => void handleCopyKioskUrl()}
                >
                  <Copy aria-hidden="true" className="size-4" />
                  Copy Kiosk URL
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={isRegenerateDialogOpen}
        title="Regenerate kiosk key?"
        description="Every existing kiosk link will stop working immediately. You will need to copy and redistribute the new link for each class."
        confirmLabel="Regenerate key"
        busyLabel="Regenerating..."
        destructive
        isConfirming={isRegenerating}
        onOpenChange={setIsRegenerateDialogOpen}
        onConfirm={() => void handleRegenerateKey()}
      />
    </section>
  );
}
