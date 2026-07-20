"use client";

import {
  Camera,
  CameraOff,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  RefreshCcw,
  Upload,
  XCircle,
  LogOut,
  LogIn,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import Webcam from "react-webcam";

import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import {
  autoMarkAttendance,
  getKioskCompanyInfo,
  type CompanyKioskInfoResponse,
  type KioskAttendanceResult,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/errors";
import { optimizeImageFile } from "@/lib/images";
import { cn } from "@/lib/utils";

const AUTO_SCAN_INTERVAL_MS = 3_000;
const KIOSK_STATUS_INTERVAL_MS = 15_000;

const videoConstraints = {
  facingMode: "user",
  width: { ideal: 1920 },
  height: { ideal: 1080 },
};

// Camera state is tracked inline via cameraReady / cameraError booleans.

function getCameraErrorMessage(error: unknown): string {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "Live camera requires HTTPS. Use the photo options or open this kiosk from its secure production URL.";
  }

  const cameraError = error as { name?: string; message?: string };
  if (cameraError.name === "NotAllowedError") {
    return "Camera access was denied. Allow camera permission for this site, then try again.";
  }
  if (
    cameraError.name === "NotFoundError" ||
    cameraError.name === "DevicesNotFoundError"
  ) {
    return "No camera was found on this device. You can still take or upload a photo.";
  }
  if (
    cameraError.name === "NotReadableError" ||
    cameraError.name === "TrackStartError"
  ) {
    return "The camera is already being used by another app or browser tab. Close it there, then try again.";
  }
  if (cameraError.name === "OverconstrainedError") {
    return "This camera does not support the requested video mode. Try another camera or upload a photo.";
  }
  if (cameraError.message?.includes("Could not start video source")) {
    return "The camera could not start. It may be busy in another app; close other camera apps and try again.";
  }
  return cameraError.message ?? "Unable to open the camera on this device.";
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(date);
}

function ResultOverlay({
  result,
  isProcessing,
  attendanceActive,
}: Readonly<{
  result: KioskAttendanceResult | null;
  isProcessing: boolean;
  attendanceActive: boolean;
}>) {
  if (isProcessing) {
    return (
      <div className="absolute inset-x-4 bottom-4 z-50 flex min-h-28 items-center justify-center gap-3 rounded-2xl bg-blue-600/90 px-6 py-4 text-white shadow-2xl backdrop-blur-md sm:bottom-8 sm:left-1/2 sm:w-[480px] sm:-translate-x-1/2">
        <LoaderCircle aria-hidden="true" className="size-8 animate-spin" />
        <div>
          <p className="text-lg font-semibold">Verifying...</p>
          <p className="text-blue-100">Hold still while the face is checked.</p>
        </div>
      </div>
    );
  }

  if (!result) {
    if (!attendanceActive) {
      return (
        <div className="absolute inset-x-4 bottom-4 z-50 flex min-h-28 items-center justify-center gap-4 rounded-2xl bg-black/80 px-6 py-4 text-white shadow-2xl backdrop-blur-md sm:bottom-8 sm:left-1/2 sm:w-[480px] sm:-translate-x-1/2">
          <Clock3 aria-hidden="true" className="size-8 text-slate-400" />
          <div>
            <p className="text-lg font-semibold">Session Closed</p>
            <p className="text-sm text-slate-300">
              An administrator must turn on Attendance.
            </p>
          </div>
        </div>
      );
    }
    return null; // Don't show default placeholder to keep UI clean
  }

  const student = result.student ?? result.employee;
  const studentName = student?.name ?? "Student";
  const classText = student ? `${student.grade}-${student.section}` : null;
  const isSuccessfulAction =
    result.matched &&
    (result.action === "check_in" ||
      result.action === "check_out" ||
      result.action === "already_done");
  const title =
    result.action === "check_in"
      ? `Welcome, ${studentName}`
      : result.action === "check_out"
        ? `Goodbye, ${studentName}`
        : result.action === "already_done"
          ? `${studentName} is already complete`
          : result.action === "too_soon"
            ? `${studentName}, please wait`
            : result.message;
  const notificationText =
    result.notification_status === "failed"
      ? "Notification failed"
      : result.notification_status
        ? "Notification sent"
        : null;

  return (
    <div
      aria-live="polite"
      className={cn(
        "absolute inset-x-4 bottom-4 z-50 flex min-h-28 items-center gap-5 rounded-2xl px-6 py-4 shadow-2xl backdrop-blur-xl transition sm:bottom-8 sm:left-1/2 sm:w-[500px] sm:-translate-x-1/2",
        !result.matched
          ? "bg-rose-600/90 text-white"
          : result.action === "check_in"
            ? "bg-emerald-600/90 text-white"
            : result.action === "check_out"
              ? "bg-blue-600/90 text-white"
              : result.action === "too_soon"
                ? "bg-amber-500/90 text-white"
                : "bg-slate-800/90 text-white",
      )}
    >
      <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-black/20">
        {isSuccessfulAction ? (
          <CheckCircle2 aria-hidden="true" className="size-8" />
        ) : (
          <XCircle aria-hidden="true" className="size-8" />
        )}
      </span>
      <div className="min-w-0">
        <p className="text-xl font-bold">{title}</p>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm font-medium text-white/80">
          {classText ? <span>{classText}</span> : null}
          {result.time ? <span>{result.time}</span> : null}
          {result.confidence_score ? (
            <span>{Math.round(result.confidence_score * 100)}% match</span>
          ) : null}
          {notificationText ? <span>{notificationText}</span> : null}
        </div>
        {!result.matched && result.message !== title ? (
          <p className="mt-1 text-sm text-white/90">{result.message}</p>
        ) : null}
      </div>
    </div>
  );
}

export default function KioskPage() {
  const webcamRef = useRef<Webcam>(null);
  const captureInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const intervalRef = useRef<number | null>(null);
  const processingRef = useRef(false);
  const resultTimeoutRef = useRef<number | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [actionType, setActionType] = useState<"check_in" | "check_out">("check_in");
  const [kioskInfo, setKioskInfo] =
    useState<CompanyKioskInfoResponse | null>(null);
  const [isKioskInfoLoading, setIsKioskInfoLoading] = useState(true);
  const [kioskInfoError, setKioskInfoError] = useState<string | null>(null);
  const [clock, setClock] = useState(() => new Date());
  const [result, setResult] = useState<KioskAttendanceResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSecureContext] = useState<boolean | null>(() =>
    typeof window === "undefined" ? null : window.isSecureContext,
  );
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [cameraAttempt, setCameraAttempt] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const key = params.get("key");
    window.setTimeout(() => setApiKey(key), 0);
  }, []);

  useEffect(() => {
    const clockInterval = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(clockInterval);
  }, []);

  const loadKioskInfo = useCallback(async (): Promise<void> => {
    if (!apiKey) {
      setIsKioskInfoLoading(false);
      return;
    }

    try {
      const company = await getKioskCompanyInfo(apiKey);
      setKioskInfo(company);
      setKioskInfoError(null);
      if (!company.attendance_active) {
        setIsCameraReady(false);
      }
    } catch (error) {
      setKioskInfo(null);
      setKioskInfoError(
        getApiErrorMessage(error, "Unable to load this kiosk configuration."),
      );
    } finally {
      setIsKioskInfoLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    void Promise.resolve().then(loadKioskInfo);
    const statusInterval = window.setInterval(() => {
      void loadKioskInfo();
    }, KIOSK_STATUS_INTERVAL_MS);
    return () => window.clearInterval(statusInterval);
  }, [loadKioskInfo]);

  useEffect(() => {
    processingRef.current = isProcessing;
  }, [isProcessing]);

  const submitImageForAttendance = useCallback(
    async (image: string): Promise<void> => {
      if (
        !apiKey ||
        !kioskInfo?.attendance_active ||
        processingRef.current
      ) {
        return;
      }

      processingRef.current = true;
      setIsProcessing(true);

      try {
        const markResult = await autoMarkAttendance(apiKey, image, actionType);
        setResult(markResult);

        if (markResult.action === "session_closed") {
          await loadKioskInfo();
        }

        if (resultTimeoutRef.current) {
          window.clearTimeout(resultTimeoutRef.current);
        }
        resultTimeoutRef.current = window.setTimeout(
          () => setResult(null),
          markResult.matched ? 5_000 : 3_500,
        );
      } catch (markError) {
        setResult({
          matched: false,
          message: getApiErrorMessage(
            markError,
            "Kiosk could not mark attendance",
          ),
          student: null,
          employee: null,
          action: null,
          time: null,
          confidence_score: null,
          notification_status: null,
        });
        resultTimeoutRef.current = window.setTimeout(
          () => setResult(null),
          3_500,
        );
      } finally {
        processingRef.current = false;
        setIsProcessing(false);
      }
    },
    [apiKey, actionType, kioskInfo?.attendance_active, loadKioskInfo],
  );

  useEffect(() => {
    if (
      !apiKey ||
      !kioskInfo?.attendance_active ||
      !isCameraReady
    ) {
      return;
    }

    async function captureAndMark(): Promise<void> {
      if (processingRef.current) {
        return;
      }

      const image = webcamRef.current?.getScreenshot();
      if (image) {
        await submitImageForAttendance(image);
      }
    }

    intervalRef.current = window.setInterval(() => {
      void captureAndMark();
    }, AUTO_SCAN_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }
    };
  }, [apiKey, isCameraReady, kioskInfo?.attendance_active, submitImageForAttendance]);

  useEffect(
    () => () => {
      if (resultTimeoutRef.current) {
        window.clearTimeout(resultTimeoutRef.current);
      }
    },
    [],
  );

  async function handleFileCapture(
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      const image = await optimizeImageFile(file);
      await submitImageForAttendance(image);
    } catch (imageError) {
      setResult({
        matched: false,
        message:
          imageError instanceof Error
            ? imageError.message
            : "Unable to read the selected image.",
        student: null,
        employee: null,
        action: null,
        time: null,
        confidence_score: null,
        notification_status: null,
      });
    }
  }

  function handleRetryCamera(): void {
    setCameraError(null);
    setIsCameraReady(false);
    setCameraAttempt((attempt) => attempt + 1);
  }

  const hasValidConfig = Boolean(apiKey);
  const attendanceActive = kioskInfo?.attendance_active ?? false;
  const liveCameraBlocked = isSecureContext === false;
  const shouldStartCamera =
    hasValidConfig && attendanceActive && !liveCameraBlocked;
  const cameraMessage =
    cameraError ??
    (liveCameraBlocked
      ? "Live camera requires HTTPS. Use Take photo or Upload image below."
      : null);
  const fallbackDisabled =
    !hasValidConfig || !attendanceActive || isProcessing;

  return (
    <main className="relative flex h-dvh w-screen flex-col overflow-hidden bg-black text-white">
      {/* Absolute Fullscreen Camera Background */}
      <div className="absolute inset-0 z-0">
        {shouldStartCamera ? (
          <Webcam
            key={cameraAttempt}
            ref={webcamRef}
            audio={false}
            mirrored
            playsInline
            screenshotFormat="image/jpeg"
            screenshotQuality={0.8}
            videoConstraints={videoConstraints}
            className="size-full object-cover opacity-90"
            onUserMedia={() => {
              setCameraError(null);
              setIsCameraReady(true);
            }}
            onUserMediaError={(error) => {
              setIsCameraReady(false);
              setCameraError(getCameraErrorMessage(error));
            }}
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-slate-900 p-6 text-center">
            <div className="max-w-md">
              <span className="mx-auto flex size-20 items-center justify-center rounded-3xl bg-slate-800">
                {attendanceActive ? (
                  cameraMessage ? (
                    <CameraOff aria-hidden="true" className="size-10 text-rose-400" />
                  ) : (
                    <LoaderCircle aria-hidden="true" className="size-10 animate-spin text-blue-400" />
                  )
                ) : (
                  <Clock3 aria-hidden="true" className="size-10 text-amber-400" />
                )}
              </span>
              <h2 className="mt-6 text-2xl font-semibold">
                {!hasValidConfig
                  ? "Kiosk link is incomplete"
                  : !attendanceActive
                    ? "Attendance has not started"
                    : cameraMessage
                      ? "Live camera could not start"
                      : "Connecting to camera"}
              </h2>
              <p className="mt-3 text-base text-slate-400">
                {!hasValidConfig
                  ? "Open a kiosk URL generated from Settings."
                  : !attendanceActive
                    ? "Ask an administrator to turn ON the session. This screen refreshes automatically."
                    : cameraMessage ?? "Approve camera access when your browser asks."}
              </p>
              {cameraMessage && !liveCameraBlocked ? (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-6 gap-2 border-white/20 bg-white/10 text-white hover:bg-white/20"
                  onClick={handleRetryCamera}
                >
                  <RefreshCcw aria-hidden="true" className="size-4" />
                  Try camera again
                </Button>
              ) : null}
            </div>
          </div>
        )}

        {isCameraReady && attendanceActive ? (
          <>
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/60" />
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-[75%] w-[45%] min-w-64 -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-4 border-white/40 shadow-[0_0_0_9999px_rgba(0,0,0,0.3)] transition-all duration-1000" />
          </>
        ) : null}
      </div>

      {/* Top Header Overlay */}
      <header className="relative z-10 flex w-full flex-col sm:flex-row sm:items-center sm:justify-between p-4 sm:p-6 lg:p-8 gap-4">
        <div className="flex items-center gap-4">
          <BrandLogo
            showName={false}
            markClassName="size-12 rounded-2xl shadow-xl ring-2 ring-white/20"
          />
          <div className="hidden sm:block">
            <h1 className="text-xl font-bold tracking-tight drop-shadow-md">
              {kioskInfo?.name ??
                (isKioskInfoLoading
                  ? "Loading organization..."
                  : kioskInfoError
                    ? "Kiosk unavailable"
                    : "Face Attendance")}
            </h1>
            <div className="mt-1 flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold backdrop-blur-md",
                  attendanceActive
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "bg-amber-500/20 text-amber-300",
                )}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    attendanceActive ? "bg-emerald-400" : "bg-amber-400",
                  )}
                />
                {attendanceActive ? "Session Open" : "Session Closed"}
              </span>
              {kioskInfo ? (
                <span className="rounded-full bg-black/40 px-2.5 py-0.5 text-xs font-medium text-white/90 backdrop-blur-md">
                  {kioskInfo.student_count} students
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Action Toggle (Check In / Check Out) */}
        {attendanceActive && (
          <div className="flex items-center rounded-2xl bg-black/40 p-1 backdrop-blur-lg self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setActionType("check_in")}
              className={cn(
                "flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all",
                actionType === "check_in"
                  ? "bg-emerald-500 text-white shadow-lg"
                  : "text-white/60 hover:text-white hover:bg-white/10",
              )}
            >
              <LogIn className="size-4" />
              Check In
            </button>
            <button
              type="button"
              onClick={() => setActionType("check_out")}
              className={cn(
                "flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all",
                actionType === "check_out"
                  ? "bg-blue-500 text-white shadow-lg"
                  : "text-white/60 hover:text-white hover:bg-white/10",
              )}
            >
              <LogOut className="size-4" />
              Check Out
            </button>
          </div>
        )}

        <div className="hidden items-center gap-3 text-right drop-shadow-md md:flex">
          <div>
            <p className="text-sm font-medium text-white/80">{formatDate(clock)}</p>
            <p className="text-2xl font-bold tabular-nums">
              {formatTime(clock)}
            </p>
          </div>
        </div>
      </header>

      {/* Main Content Area / Overlays */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-end p-6 pointer-events-none">
        <ResultOverlay
          result={result}
          isProcessing={isProcessing}
          attendanceActive={attendanceActive}
        />
        
        {/* Hidden File Inputs */}
        <input
          ref={captureInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="user"
          className="hidden"
          onChange={(event) => void handleFileCapture(event)}
        />
        <input
          ref={uploadInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(event) => void handleFileCapture(event)}
        />
      </div>

      {/* Bottom Floating Action Buttons */}
      {attendanceActive && (
        <div className="absolute bottom-6 right-6 z-20 flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            disabled={fallbackDisabled}
            size="icon"
            className="size-12 rounded-full bg-white/20 text-white shadow-xl backdrop-blur-md hover:bg-white/30"
            onClick={() => uploadInputRef.current?.click()}
            title="Upload image"
          >
            <Upload aria-hidden="true" className="size-5" />
          </Button>
          <Button
            type="button"
            disabled={fallbackDisabled}
            size="icon"
            className="size-12 rounded-full bg-white/20 text-white shadow-xl backdrop-blur-md hover:bg-white/30"
            onClick={() => captureInputRef.current?.click()}
            title="Take photo manually"
          >
            <Camera aria-hidden="true" className="size-5" />
          </Button>
        </div>
      )}
    </main>
  );
}
