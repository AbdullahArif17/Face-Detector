"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { 
  Bell, 
  Mail, 
  Smartphone, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  RotateCw,
  Send,
  BellRing,
  ShieldAlert,
} from "lucide-react";
import { 
  getNotificationLogs, 
  registerDeviceToken, 
  sendTestNotification, 
  getDeviceStatus, 
  NotificationLog 
} from "@/lib/api";
import { requestForToken } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

export default function NotificationsPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Push notification device state
  const [devicePermission, setDevicePermission] = useState<NotificationPermission>(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      return Notification.permission;
    }
    return "default";
  });
  const [registeredDeviceCount, setRegisteredDeviceCount] = useState<number | null>(null);
  const [isEnablingPush, setIsEnablingPush] = useState(false);
  const [isTestingPush, setIsTestingPush] = useState(false);
  const [pushFeedback, setPushFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const syncDeviceStatus = useCallback(async () => {
    try {
      const res = await getDeviceStatus();
      setRegisteredDeviceCount(res.device_count);
      return res;
    } catch (err) {
      console.warn("Could not check device registration count:", err);
      return null;
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const initDeviceSync = async () => {
      try {
        const res = await getDeviceStatus();
        if (isMounted) {
          setRegisteredDeviceCount(res.device_count);
        }

        if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
          const token = await requestForToken();
          if (token && isMounted) {
            await registerDeviceToken(token);
            const updated = await getDeviceStatus();
            if (isMounted) {
              setRegisteredDeviceCount(updated.device_count);
            }
          }
        }
      } catch (err) {
        console.warn("Background device sync failed:", err);
      }
    };

    void initDeviceSync();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleEnablePush = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      const isIos = typeof window !== "undefined" && /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
      if (isIos) {
        setPushFeedback({
          type: "error",
          message:
            "On iPhone, push notifications require adding the app to your Home Screen first. Tap the Share button in Safari, select 'Add to Home Screen', and launch the app from your Home Screen.",
        });
        return;
      }
      setPushFeedback({
        type: "error",
        message: "Push notifications are not supported by this browser.",
      });
      return;
    }

    setIsEnablingPush(true);
    setPushFeedback(null);
    try {
      const permissionResult = await Notification.requestPermission();
      setDevicePermission(permissionResult);
      if (permissionResult === "granted") {
        const token = await requestForToken();
        if (token) {
          let deviceName = "Web Browser";
          const ua = window.navigator.userAgent;
          const isIos = /iphone|ipad|ipod/i.test(ua);
          const isAndroid = /android/i.test(ua);
          const isStandalone =
            window.matchMedia("(display-mode: standalone)").matches ||
            (window.navigator as unknown as { standalone?: boolean }).standalone === true;

          if (isIos) {
            deviceName = isStandalone ? "iPhone (App)" : "iPhone (Safari)";
          } else if (isAndroid) {
            deviceName = isStandalone ? "Android (App)" : "Android (Chrome)";
          } else if (/macintosh|mac os x/i.test(ua)) {
            deviceName = "Mac Browser";
          } else if (/windows/i.test(ua)) {
            deviceName = "Windows Browser";
          }

          await registerDeviceToken(token, deviceName);
          await syncDeviceStatus();
          setPushFeedback({
            type: "success",
            message: `Push notifications enabled and device synced as "${deviceName}"! This device will now receive staff check-in and check-out alerts.`,
          });
        } else {
          setPushFeedback({
            type: "error",
            message: "Could not generate device registration token. Please verify network or Firebase setup.",
          });
        }
      } else if (permissionResult === "denied") {
        setPushFeedback({
          type: "error",
          message: "Notification permission was blocked. Please reset site permissions in your browser settings to allow notifications.",
        });
      }
    } catch (err: unknown) {
      setPushFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to enable notifications.",
      });
    } finally {
      setIsEnablingPush(false);
    }
  };

  const handleSendTestPush = async () => {
    setIsTestingPush(true);
    setPushFeedback(null);
    try {
      if (typeof window !== "undefined" && "Notification" in window) {
        if (Notification.permission !== "granted") {
          const perm = await Notification.requestPermission();
          setDevicePermission(perm);
          if (perm !== "granted") {
            setPushFeedback({
              type: "error",
              message: "Please allow notification permission in your browser to receive push notifications.",
            });
            setIsTestingPush(false);
            return;
          }
        }
      }

      // 1. Ensure current device token is active in backend database
      const token = await requestForToken();
      if (!token) {
        setPushFeedback({
          type: "error",
          message: "Could not generate device registration token on this device. Please check browser permissions.",
        });
        setIsTestingPush(false);
        return;
      }

      let deviceName = "Web Browser";
      if (typeof window !== "undefined") {
        const ua = window.navigator.userAgent;
        const isIos = /iphone|ipad|ipod/i.test(ua);
        const isAndroid = /android/i.test(ua);
        const isStandalone =
          window.matchMedia("(display-mode: standalone)").matches ||
          (window.navigator as unknown as { standalone?: boolean }).standalone === true;

        if (isIos) {
          deviceName = isStandalone ? "iPhone (App)" : "iPhone (Safari)";
        } else if (isAndroid) {
          deviceName = isStandalone ? "Android (App)" : "Android (Chrome)";
        }
      }

      await registerDeviceToken(token, deviceName);
      await syncDeviceStatus();

      // 2. Dispatch the test notification
      const res = await sendTestNotification();
      setPushFeedback({
        type: "success",
        message: res.message || "Test push notification sent successfully!",
      });
      await syncDeviceStatus();
    } catch (err: unknown) {
      let msg = "Failed to dispatch test notification.";
      if (axios.isAxiosError(err) && err.response?.data?.detail) {
        msg = String(err.response.data.detail);
      } else if (err instanceof Error) {
        msg = err.message;
      }
      setPushFeedback({
        type: "error",
        message: msg,
      });
    } finally {
      setIsTestingPush(false);
    }
  };

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getNotificationLogs({ limit: 100 });
      setLogs(data);
    } catch (err: unknown) {
      let message = "Failed to load notifications. Please try again later.";
      if (axios.isAxiosError(err) && err.response?.data?.detail) {
        message = String(err.response.data.detail);
      }
      setError(message);
      console.error("Failed to load notifications:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(fetchLogs);
  }, [fetchLogs]);

  return (
    <section className="animate-page-enter space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            <span className="text-gradient">Notifications</span>
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground text-pretty">
            Monitor system-generated emails and push notifications.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchLogs}
          disabled={loading}
          className="gap-2 self-start lg:self-auto"
        >
          <RotateCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Push Notification Settings Card */}
      <div className="rounded-xl border bg-card p-5 shadow-card space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400 mt-0.5">
              <BellRing className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-foreground">
                  Staff Check-In & Check-Out Notifications
                </h2>
                {user?.role === "viewer" ? (
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    Viewer
                  </span>
                ) : (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-600/10 dark:bg-emerald-950 dark:text-emerald-300">
                    {user?.role?.replace("_", " ").toUpperCase()}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
                {user?.role === "viewer"
                  ? "Viewers have read-only access and do not receive staff check-in or check-out push notifications."
                  : "All active organization users (except viewers) receive real-time push notifications on their registered devices when staff check in or check out."}
              </p>
            </div>
          </div>

          {user?.role !== "viewer" && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {devicePermission !== "granted" ? (
                <Button
                  type="button"
                  onClick={() => void handleEnablePush()}
                  disabled={isEnablingPush}
                  className="gap-2 shadow-sm bg-primary text-primary-foreground"
                >
                  <BellRing className="size-4" />
                  {isEnablingPush ? "Enabling..." : "Enable Push Notifications"}
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleEnablePush()}
                    disabled={isEnablingPush || isTestingPush}
                    className="gap-2 shadow-sm"
                  >
                    <RotateCw className={`size-4 ${isEnablingPush ? "animate-spin" : ""}`} />
                    {isEnablingPush ? "Syncing..." : "Re-sync Device"}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void handleSendTestPush()}
                    disabled={isTestingPush || isEnablingPush}
                    className="gap-2 shadow-sm bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    <Send className={`size-4 ${isTestingPush ? "animate-pulse" : ""}`} />
                    {isTestingPush ? "Sending..." : "Send Test Notification"}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        {user?.role === "viewer" ? (
          <div className="flex items-center gap-2 rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 dark:bg-slate-900/50 dark:border-slate-800 dark:text-slate-400">
            <ShieldAlert className="size-4 shrink-0 text-slate-500" />
            <span>
              Staff attendance push notifications are distributed to admins, HR, managers, and teachers in your school. Viewers can monitor the audit log below.
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">Device Status:</span>
              {devicePermission === "granted" ? (
                registeredDeviceCount && registeredDeviceCount > 0 ? (
                  <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    Active ({registeredDeviceCount} device{registeredDeviceCount === 1 ? "" : "s"} registered)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400">
                    <span className="size-1.5 rounded-full bg-amber-500" />
                    Browser allowed — click &ldquo;Send Test Notification&rdquo; or &ldquo;Re-sync Device&rdquo; to complete setup
                  </span>
                )
              ) : devicePermission === "denied" ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-rose-600 dark:text-rose-400">
                  <span className="size-1.5 rounded-full bg-rose-500" />
                  Blocked in browser settings
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400">
                  <span className="size-1.5 rounded-full bg-amber-500" />
                  Not enabled on this device
                </span>
              )}
            </div>
            <span>Check-in & check-out alerts arrive via Firebase Cloud Messaging</span>
          </div>
        )}

        {pushFeedback && (
          <div
            className={cn(
              "rounded-lg border px-3 py-2 text-xs font-medium animate-in fade-in duration-200",
              pushFeedback.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300"
                : "border-destructive/30 bg-destructive/10 text-destructive",
            )}
          >
            {pushFeedback.message}
          </div>
        )}
      </div>

      {error && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchLogs}
            disabled={loading}
            className="border-destructive/30 hover:bg-destructive/10 shrink-0"
          >
            Try Again
          </Button>
        </div>
      )}

      <div className="rounded-xl border bg-card shadow-card overflow-hidden">
        {loading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="p-12 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-destructive/60 mb-4" />
            <p className="font-semibold text-foreground">Could not load notifications</p>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm mx-auto">
              There was an issue connecting to the notification service. Please try again.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchLogs}
              className="mt-4 gap-2"
            >
              <RotateCw className="size-3.5" />
              Retry
            </Button>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center">
            <Bell className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="font-semibold">No Notifications Found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              There are currently no notification logs to display.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {logs.map((log) => (
              <div key={log.id} className="p-4 sm:p-6 hover:bg-muted/50 transition-colors flex gap-4">
                <div className="shrink-0 mt-1">
                  {log.notification_type === "email" ? (
                    <Mail className="h-5 w-5 text-blue-500" />
                  ) : (
                    <Smartphone className="h-5 w-5 text-indigo-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-4 mb-1">
                    <p className="font-medium text-foreground truncate">
                      {log.event_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </p>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                  </div>
                  
                  <div className="text-sm text-muted-foreground mb-2 line-clamp-2">
                    {log.message_content}
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-foreground">To:</span>
                      <span className="text-muted-foreground truncate max-w-[200px]" title={log.recipient_email || log.recipient_fcm_token || 'Broadcast'}>
                        {log.recipient_email || (log.recipient_fcm_token ? 'Mobile Device' : 'Broadcast')}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-foreground">Status:</span>
                      {log.status === "sent" ? (
                        <span className="inline-flex items-center text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                          Delivered
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-destructive">
                          <AlertCircle className="mr-1 h-3.5 w-3.5" />
                          Failed
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {log.error_message && (
                    <div className="mt-2 text-xs p-2 bg-destructive/10 text-destructive rounded-md font-mono break-all">
                      {log.error_message}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
