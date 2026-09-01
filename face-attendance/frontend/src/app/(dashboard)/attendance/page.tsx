"use client";

import { Power, PowerOff, RefreshCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/components/api-error";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { KioskSettings } from "@/components/kiosk-settings";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { getApiErrorMessage } from "@/lib/errors";
import { canManageAttendanceSessions } from "@/lib/permissions";
import {
  getActiveAttendanceSession,
  startAttendanceSession,
  stopAttendanceSession,
  type AttendanceSession,
  type AttendanceSessionStatus,
} from "@/lib/api";

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default function AttendancePage() {
  const { user } = useAuth();
  const canManageSessions = canManageAttendanceSessions(user);
  
  const [globalSession, setGlobalSession] = useState<AttendanceSessionStatus | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  
  const [isUpdatingSession, setIsUpdatingSession] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [sessionMessage, setSessionMessage] = useState("");
  const [sessionMessageIsError, setSessionMessageIsError] = useState(false);
  
  const [pendingStopSession, setPendingStopSession] = useState<AttendanceSession | null>(null);

  const loadGlobalSession = useCallback(async (): Promise<void> => {
    setIsSessionLoading(true);
    try {
      const status = await getActiveAttendanceSession();
      setGlobalSession(status);
      setHasError(false);
    } catch {
      setHasError(true);
    } finally {
      setIsSessionLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGlobalSession();
  }, [loadGlobalSession]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadGlobalSession();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [loadGlobalSession]);

  async function handleRefresh(): Promise<void> {
    await loadGlobalSession();
  }

  async function handleStartSession(sessionType: "check_in" | "check_out"): Promise<void> {
    setIsUpdatingSession(true);
    setSessionMessage("");
    setSessionMessageIsError(false);
    try {
      await startAttendanceSession(sessionType);
      setSessionMessage(`Global ${sessionType.replace("_", "-")} session started.`);
      await loadGlobalSession();
    } catch (error) {
      setSessionMessageIsError(true);
      setSessionMessage(
        getApiErrorMessage(error, `Unable to start ${sessionType.replace("_", "-")} session.`),
      );
    } finally {
      setIsUpdatingSession(false);
    }
  }

  async function handleStopSession(): Promise<void> {
    if (!pendingStopSession) {
      return;
    }

    setIsUpdatingSession(true);
    setSessionMessage("");
    setSessionMessageIsError(false);
    try {
      await stopAttendanceSession(pendingStopSession.id);
      setSessionMessage("Attendance session stopped.");
      await loadGlobalSession();
    } catch (error) {
      setSessionMessageIsError(true);
      setSessionMessage(
        getApiErrorMessage(error, "Unable to stop attendance session."),
      );
    } finally {
      setIsUpdatingSession(false);
      setPendingStopSession(null);
    }
  }

  const isCheckInActive = Boolean(globalSession?.active_check_in_session);
  const isCheckOutActive = Boolean(globalSession?.active_check_out_session);

  return (
    <section className="animate-page-enter space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            <span className="text-gradient">Live Attendance</span>
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground text-pretty">
            Live attendance session status.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-full gap-2 shadow-sm sm:w-auto"
          onClick={() => void handleRefresh()}
        >
          <RefreshCcw aria-hidden="true" className="size-4" />
          Refresh
        </Button>
      </div>

      <KioskSettings />

      <div className="space-y-4 rounded-xl border bg-card p-5 shadow-card">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Global attendance session</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Turn attendance on to allow kiosk scans.
              Open sessions automatically expire at the end of the school day.
            </p>
          </div>
          {!canManageSessions ? (
            <p className="text-xs text-muted-foreground">
              Your role can view sessions but cannot change them.
            </p>
          ) : null}
        </div>

        {sessionMessage ? (
          <div
            className={cn(
              "animate-fade-in rounded-lg border px-3 py-2 text-sm shadow-sm",
              sessionMessageIsError
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700",
            )}
            role={sessionMessageIsError ? "alert" : "status"}
          >
            {sessionMessage}
          </div>
        ) : null}

        {isSessionLoading ? (
          <p className="text-sm text-muted-foreground">
            Loading session status...
          </p>
        ) : null}

        {!isSessionLoading && globalSession && (
          <div className="grid gap-4 md:grid-cols-2 lg:max-w-3xl">
            <article
              className={cn(
                "space-y-3 rounded-xl border p-4 shadow-card transition-shadow",
                isCheckInActive && "border-primary ring-1 ring-primary/20 shadow-glow",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">Check-in Session</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Students and staff arriving
                  </p>
                </div>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold tracking-wider",
                    isCheckInActive
                      ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-600/10"
                      : "bg-slate-100 text-slate-500 ring-1 ring-slate-500/10",
                  )}
                >
                  <span className={cn("size-1.5 rounded-full", isCheckInActive ? "bg-emerald-500 animate-pulse" : "bg-slate-400")} />
                  {isCheckInActive ? "ON" : "OFF"}
                </span>
              </div>

              <p className="min-h-10 text-sm text-muted-foreground">
                {isCheckInActive && globalSession.active_check_in_session
                  ? `Started ${dateTimeFormatter.format(
                      new Date(globalSession.active_check_in_session.started_at),
                    )}`
                  : "Kiosk check-in scans are currently blocked."}
              </p>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={isCheckInActive ? "outline" : "default"}
                  disabled={!canManageSessions || isUpdatingSession}
                  className="w-full gap-2"
                  onClick={() =>
                    isCheckInActive
                      ? setPendingStopSession(globalSession.active_check_in_session)
                      : void handleStartSession("check_in")
                  }
                >
                  {isCheckInActive ? (
                    <PowerOff aria-hidden="true" className="size-4" />
                  ) : (
                    <Power aria-hidden="true" className="size-4" />
                  )}
                  {isUpdatingSession
                    ? isCheckInActive
                      ? "Stopping..."
                      : "Starting..."
                    : isCheckInActive
                      ? "Turn OFF"
                      : "Turn ON"}
                </Button>
              </div>
            </article>

            <article
              className={cn(
                "space-y-3 rounded-lg border p-4",
                isCheckOutActive && "border-primary ring-1 ring-primary/20",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">Check-out Session</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Students and staff leaving
                  </p>
                </div>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold tracking-wider",
                    isCheckOutActive
                      ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-600/10"
                      : "bg-slate-100 text-slate-500 ring-1 ring-slate-500/10",
                  )}
                >
                  <span className={cn("size-1.5 rounded-full", isCheckOutActive ? "bg-emerald-500 animate-pulse" : "bg-slate-400")} />
                  {isCheckOutActive ? "ON" : "OFF"}
                </span>
              </div>

              <p className="min-h-10 text-sm text-muted-foreground">
                {isCheckOutActive && globalSession.active_check_out_session
                  ? `Started ${dateTimeFormatter.format(
                      new Date(globalSession.active_check_out_session.started_at),
                    )}`
                  : "Kiosk check-out scans are currently blocked."}
              </p>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={isCheckOutActive ? "outline" : "default"}
                  disabled={!canManageSessions || isUpdatingSession}
                  className="w-full gap-2"
                  onClick={() =>
                    isCheckOutActive
                      ? setPendingStopSession(globalSession.active_check_out_session)
                      : void handleStartSession("check_out")
                  }
                >
                  {isCheckOutActive ? (
                    <PowerOff aria-hidden="true" className="size-4" />
                  ) : (
                    <Power aria-hidden="true" className="size-4" />
                  )}
                  {isUpdatingSession
                    ? isCheckOutActive
                      ? "Stopping..."
                      : "Starting..."
                    : isCheckOutActive
                      ? "Turn OFF"
                      : "Turn ON"}
                </Button>
              </div>
            </article>
          </div>
        )}
      </div>

      {hasError ? (
        <ApiError
          onRetry={() => void handleRefresh()}
          isRetrying={isSessionLoading}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingStopSession)}
        title="Stop attendance session?"
        description={
          pendingStopSession
            ? `Are you sure you want to stop the ${pendingStopSession.session_type.replace("_", "-")} session? Kiosk scans for this session will be blocked.`
            : ""
        }
        confirmLabel="Stop session"
        busyLabel="Stopping..."
        destructive
        isConfirming={isUpdatingSession}
        onOpenChange={(open) => !open && setPendingStopSession(null)}
        onConfirm={() => {
          if (pendingStopSession) {
            void handleStopSession();
          }
        }}
      />
    </section>
  );
}
