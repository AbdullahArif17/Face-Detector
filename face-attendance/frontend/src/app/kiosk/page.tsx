"use client";

import {
  Camera,
  CameraOff,
  CheckCircle2,
  Clock3,
  ImageUp,
  LoaderCircle,
  RefreshCcw,
  ScanFace,
  ShieldCheck,
  Upload,
  XCircle,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import Webcam from "react-webcam";

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
  width: { ideal: 960 },
  height: { ideal: 720 },
};

type CameraState = "starting" | "ready" | "unavailable";

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

function ResultCard({
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
      <div className="flex min-h-28 items-center justify-center gap-3 rounded-2xl border border-blue-400/30 bg-blue-500/10 px-5 text-blue-100 shadow-2xl">
        <LoaderCircle aria-hidden="true" className="size-6 animate-spin" />
        <div>
          <p className="font-semibold">Checking attendance</p>
          <p className="mt-1 text-sm text-blue-200/70">
            Hold still while the face is verified.
          </p>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex min-h-28 items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-5 text-slate-300 shadow-2xl">
        <span
          className={cn(
            "flex size-11 items-center justify-center rounded-full",
            attendanceActive ? "bg-emerald-400/10" : "bg-slate-800",
          )}
        >
          {attendanceActive ? (
            <ScanFace aria-hidden="true" className="size-6 text-emerald-300" />
          ) : (
            <Clock3 aria-hidden="true" className="size-6 text-slate-400" />
          )}
        </span>
        <div>
          <p className="font-semibold text-white">
            {attendanceActive
              ? "Ready for the next student"
              : "Attendance session is closed"}
          </p>
          <p className="mt-1 text-sm text-slate-400">
            {attendanceActive
              ? "Look at the camera and keep your face inside the guide."
              : "An administrator must turn this class ON from Attendance."}
          </p>
        </div>
      </div>
    );
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
      ? "Parent notification failed"
      : result.notification_status
        ? "Parent notification submitted"
        : null;

  return (
    <div
      aria-live="polite"
      className={cn(
        "flex min-h-28 items-center gap-4 rounded-2xl border px-5 py-4 shadow-2xl transition",
        !result.matched
          ? "border-rose-400/40 bg-rose-500/15 text-rose-50"
          : result.action === "check_in"
            ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-50"
            : result.action === "check_out"
              ? "border-blue-400/40 bg-blue-500/15 text-blue-50"
              : result.action === "too_soon"
                ? "border-amber-400/40 bg-amber-500/15 text-amber-50"
                : "border-white/15 bg-white/[0.06] text-white",
      )}
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-black/20">
        {isSuccessfulAction ? (
          <CheckCircle2 aria-hidden="true" className="size-7" />
        ) : (
          <XCircle aria-hidden="true" className="size-7" />
        )}
      </span>
      <div className="min-w-0">
        <p className="text-lg font-semibold sm:text-xl">{title}</p>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm opacity-75">
          {classText ? <span>{classText}</span> : null}
          {result.time ? <span>{result.time}</span> : null}
          {result.confidence_score ? (
            <span>{Math.round(result.confidence_score * 100)}% match</span>
          ) : null}
          {notificationText ? <span>{notificationText}</span> : null}
        </div>
        {!result.matched && result.message !== title ? (
          <p className="mt-1 text-sm opacity-80">{result.message}</p>
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
  const [classId, setClassId] = useState<number | null>(null);
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
    const rawClassId =
      params.get("class_id") ?? params.get("class") ?? params.get("branch") ?? "";
    const parsedClassId = Number.parseInt(rawClassId, 10);
    window.setTimeout(() => {
      setApiKey(key);
      setClassId(
        Number.isInteger(parsedClassId) && parsedClassId > 0
          ? parsedClassId
          : null,
      );
    }, 0);
  }, []);

  useEffect(() => {
    const clockInterval = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(clockInterval);
  }, []);

  const loadKioskInfo = useCallback(async (): Promise<void> => {
    if (!apiKey || classId === null) {
      setIsKioskInfoLoading(false);
      return;
    }

    try {
      const company = await getKioskCompanyInfo(apiKey, classId);
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
  }, [apiKey, classId]);

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
        classId === null ||
        !kioskInfo?.attendance_active ||
        processingRef.current
      ) {
        return;
      }

      processingRef.current = true;
      setIsProcessing(true);

      try {
        const markResult = await autoMarkAttendance(apiKey, classId, image);
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
    [apiKey, classId, kioskInfo?.attendance_active, loadKioskInfo],
  );

  useEffect(() => {
    if (
      !apiKey ||
      classId === null ||
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
  }, [apiKey, classId, isCameraReady, kioskInfo?.attendance_active, submitImageForAttendance]);

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

  const hasValidConfig = Boolean(apiKey && classId !== null);
  const attendanceActive = kioskInfo?.attendance_active ?? false;
  const liveCameraBlocked = isSecureContext === false;
  const shouldStartCamera =
    hasValidConfig && attendanceActive && !liveCameraBlocked;
  const cameraMessage =
    cameraError ??
    (liveCameraBlocked
      ? "Live camera requires HTTPS. Use Take photo or Upload image below."
      : null);
  const cameraState: CameraState = cameraMessage
    ? "unavailable"
    : isCameraReady
      ? "ready"
      : "starting";
  const fallbackDisabled =
    !hasValidConfig || !attendanceActive || isProcessing;

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#050816] text-white">
      <div className="pointer-events-none absolute -left-40 top-24 size-96 rounded-full bg-blue-600/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-40 bottom-10 size-96 rounded-full bg-cyan-500/10 blur-3xl" />

      <div className="relative mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-3 py-3 sm:px-6 sm:py-6 lg:px-8">
        <header className="flex flex-col gap-5 border-b border-white/10 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 text-white shadow-lg shadow-blue-500/20 sm:size-14">
              <ScanFace aria-hidden="true" className="size-7" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-300">
                Attendance Kiosk
              </p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
                {kioskInfo?.name ??
                  (isKioskInfoLoading
                    ? "Loading organization..."
                    : kioskInfoError
                      ? "Kiosk unavailable"
                      : "Face Attendance")}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-300">
                <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1">
                  {kioskInfo?.class_name ??
                    (classId ? `Class ${classId}` : "Class not selected")}
                </span>
                {kioskInfo ? (
                  <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1">
                    {kioskInfo.student_count} students
                  </span>
                ) : null}
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium",
                    attendanceActive
                      ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
                      : "border-amber-400/25 bg-amber-400/10 text-amber-200",
                  )}
                >
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      attendanceActive ? "bg-emerald-300" : "bg-amber-300",
                    )}
                  />
                  {attendanceActive ? "Session open" : "Session closed"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:text-right">
            <span className="hidden size-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-300 sm:flex">
              <Clock3 aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-sm text-slate-400">{formatDate(clock)}</p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums sm:text-2xl">
                {formatTime(clock)}
              </p>
            </div>
          </div>
        </header>

        {kioskInfoError ? (
          <div className="mt-5 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100" role="alert">
            {kioskInfoError}
          </div>
        ) : null}

        <section className="grid flex-1 gap-5 py-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 shadow-2xl shadow-black/30 backdrop-blur">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-5">
              <div>
                <p className="font-semibold">Live face scanner</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  Automatic scan every {AUTO_SCAN_INTERVAL_MS / 1_000} seconds
                </p>
              </div>
              <span
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium",
                  cameraState === "ready"
                    ? "bg-emerald-400/10 text-emerald-300"
                    : cameraState === "unavailable"
                      ? "bg-rose-400/10 text-rose-200"
                      : "bg-blue-400/10 text-blue-200",
                )}
              >
                <span
                  className={cn(
                    "size-2 rounded-full",
                    cameraState === "ready"
                      ? "animate-pulse bg-emerald-300"
                      : cameraState === "unavailable"
                        ? "bg-rose-300"
                        : "animate-pulse bg-blue-300",
                  )}
                />
                {cameraState === "ready"
                  ? "Camera ready"
                  : cameraState === "unavailable"
                    ? "Camera unavailable"
                    : attendanceActive
                      ? "Starting camera"
                      : "Camera paused"}
              </span>
            </div>

            <div className="relative aspect-[4/3] min-h-72 overflow-hidden bg-[#090f20] sm:aspect-video sm:min-h-64">
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
                  className="absolute inset-0 size-full object-cover"
                  onUserMedia={() => {
                    setCameraError(null);
                    setIsCameraReady(true);
                  }}
                  onUserMediaError={(error) => {
                    setIsCameraReady(false);
                    setCameraError(getCameraErrorMessage(error));
                  }}
                />
              ) : null}

              {isCameraReady && attendanceActive ? (
                <>
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/35 via-transparent to-slate-950/20" />
                  <div className="pointer-events-none absolute left-1/2 top-1/2 h-[72%] w-[42%] min-w-44 -translate-x-1/2 -translate-y-1/2 rounded-[48%] border-2 border-white/70 shadow-[0_0_0_999px_rgba(2,6,23,0.18)]" />
                  <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-slate-950/70 px-4 py-2 text-xs text-slate-100 backdrop-blur">
                    Center one face inside the guide
                  </div>
                </>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
                  <div className="max-w-md">
                    <span className="mx-auto flex size-16 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05]">
                      {attendanceActive ? (
                        cameraMessage ? (
                          <CameraOff aria-hidden="true" className="size-8 text-rose-300" />
                        ) : (
                          <LoaderCircle aria-hidden="true" className="size-8 animate-spin text-blue-300" />
                        )
                      ) : (
                        <Clock3 aria-hidden="true" className="size-8 text-amber-200" />
                      )}
                    </span>
                    <h2 className="mt-4 text-lg font-semibold">
                      {!hasValidConfig
                        ? "Kiosk link is incomplete"
                        : !attendanceActive
                          ? "Attendance has not started"
                          : cameraMessage
                            ? "Live camera could not start"
                            : "Connecting to camera"}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      {!hasValidConfig
                        ? "Open a class kiosk URL generated from Settings."
                        : !attendanceActive
                          ? "Ask an administrator to turn this class ON from the Attendance page. This screen refreshes automatically."
                          : cameraMessage ?? "Approve camera access when your browser asks."}
                    </p>
                    {cameraMessage && !liveCameraBlocked ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-4 gap-2 border-white/15 bg-white/[0.06] text-white hover:bg-white/10 hover:text-white"
                        onClick={handleRetryCamera}
                      >
                        <RefreshCcw aria-hidden="true" className="size-4" />
                        Try camera again
                      </Button>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Current class
                  </p>
                  <h2 className="mt-2 text-xl font-semibold">
                    {kioskInfo?.class_name ?? "Not available"}
                  </h2>
                  <p className="mt-1 text-sm text-slate-400">
                    {kioskInfo?.class_location ?? "Classroom"}
                  </p>
                </div>
                <span
                  className={cn(
                    "flex size-10 items-center justify-center rounded-xl",
                    attendanceActive
                      ? "bg-emerald-400/10 text-emerald-300"
                      : "bg-amber-400/10 text-amber-200",
                  )}
                >
                  {attendanceActive ? (
                    <CheckCircle2 aria-hidden="true" className="size-5" />
                  ) : (
                    <Clock3 aria-hidden="true" className="size-5" />
                  )}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-center">
                <div className="rounded-xl bg-black/20 px-3 py-3">
                  <p className="text-xl font-semibold tabular-nums">
                    {kioskInfo?.student_count ?? "—"}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">Students</p>
                </div>
                <div className="rounded-xl bg-black/20 px-3 py-3">
                  <p
                    className={cn(
                      "text-sm font-semibold",
                      attendanceActive ? "text-emerald-300" : "text-amber-200",
                    )}
                  >
                    {attendanceActive ? "OPEN" : "CLOSED"}
                  </p>
                  <p className="mt-2 text-xs text-slate-400">Session</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur">
              <div className="flex items-center gap-2">
                <ImageUp aria-hidden="true" className="size-5 text-blue-300" />
                <h2 className="font-semibold">Photo fallback</h2>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                If live video is unavailable, take a fresh photo or choose a clear existing image.
              </p>

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

              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                <Button
                  type="button"
                  disabled={fallbackDisabled}
                  className="h-11 gap-2 bg-blue-500 text-white hover:bg-blue-400"
                  onClick={() => captureInputRef.current?.click()}
                >
                  <Camera aria-hidden="true" className="size-4" />
                  Take photo
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={fallbackDisabled}
                  className="h-11 gap-2 border-white/15 bg-slate-800 text-white hover:bg-slate-700 hover:text-white"
                  onClick={() => uploadInputRef.current?.click()}
                >
                  <Upload aria-hidden="true" className="size-4" />
                  Upload image
                </Button>
              </div>

              {!attendanceActive ? (
                <p className="mt-3 text-xs text-amber-200/80">
                  Photo actions unlock when this class session opens.
                </p>
              ) : null}
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
              <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-emerald-300" />
              <p className="leading-6">
                Images are used for attendance verification. Only one student should be visible at a time.
              </p>
            </div>
          </aside>
        </section>

        <footer className="pb-2">
          <ResultCard
            result={result}
            isProcessing={isProcessing}
            attendanceActive={attendanceActive}
          />
        </footer>
      </div>
    </main>
  );
}
