"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import Webcam from "react-webcam";

import { Button } from "@/components/ui/button";
import {
  autoMarkAttendance,
  getKioskCompanyInfo,
  type KioskAttendanceResult,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/errors";
import { optimizeImageFile } from "@/lib/images";
import { cn } from "@/lib/utils";

const videoConstraints = {
  facingMode: "user",
};

function getCameraErrorMessage(error: unknown): string {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "Live camera is blocked because this kiosk is not running in a trusted HTTPS secure context. Use a trusted HTTPS URL, or use Capture/Upload Photo below.";
  }

  const cameraError = error as { name?: string; message?: string };
  if (cameraError.name === "NotAllowedError") {
    return "Camera permission was denied. Allow camera access in the browser, then reload this page.";
  }
  if (
    cameraError.name === "NotFoundError" ||
    cameraError.name === "DevicesNotFoundError"
  ) {
    return "No camera was found on this device.";
  }
  return cameraError.message ?? "Unable to open the camera on this device.";
}

function formatClock(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(date);
}

function ResultCard({
  result,
}: Readonly<{ result: KioskAttendanceResult | null }>) {
  if (!result) {
    return (
      <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4 text-center text-slate-400 shadow-2xl sm:p-6">
        Waiting for student face...
      </div>
    );
  }

  const student = result.student ?? result.employee;
  const studentName = student?.name ?? "Student";
  const classText = student ? `${student.grade}-${student.section}` : "";
  const notificationText =
    result.notification_status === "failed"
      ? "⚠️ WhatsApp notification failed"
      : result.notification_status === "pending" || result.notification_status === "sent"
        ? "📱 Parent notified via WhatsApp"
        : "";
  const message =
    result.action === "check_in"
      ? `Welcome ${studentName}! ✓\n${classText}\n${notificationText}`.trim()
      : result.action === "check_out"
        ? `Goodbye ${studentName}! 🏠\n${notificationText || "Departure recorded"}`.trim()
        : result.message;

  return (
    <div
      className={cn(
        "rounded-2xl border p-4 text-center text-base font-semibold shadow-2xl transition sm:p-6 sm:text-xl",
        !result.matched
          ? "border-red-400 bg-red-500/90 text-white"
          : result.action === "check_in"
            ? "border-green-300 bg-green-500 text-white"
            : result.action === "check_out"
              ? "border-blue-300 bg-blue-500 text-white"
              : result.action === "too_soon"
                ? "border-yellow-300 bg-yellow-400 text-yellow-950"
                : "border-slate-500 bg-slate-700 text-white",
      )}
    >
      <span className="whitespace-pre-line">{message}</span>
    </div>
  );
}

export default function KioskPage() {
  const webcamRef = useRef<Webcam>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const intervalRef = useRef<number | null>(null);
  const processingRef = useRef(false);
  const resultTimeoutRef = useRef<number | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [classId, setClassId] = useState<number | null>(null);
  const [organizationName, setOrganizationName] = useState<string | null>(null);
  const [hasOrganizationError, setHasOrganizationError] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  const [result, setResult] = useState<KioskAttendanceResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSecureContext] = useState<boolean | null>(() =>
    typeof window === "undefined" ? null : window.isSecureContext,
  );
  const [cameraError, setCameraError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!apiKey) {
      return;
    }

    let isCancelled = false;
    const kioskApiKey = apiKey;

    void Promise.resolve().then(async () => {
      try {
        const company = await getKioskCompanyInfo(kioskApiKey);
        if (!isCancelled) {
          setOrganizationName(company.name);
          setHasOrganizationError(false);
        }
      } catch {
        if (!isCancelled) {
          setOrganizationName(null);
          setHasOrganizationError(true);
        }
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [apiKey]);

  useEffect(() => {
    processingRef.current = isProcessing;
  }, [isProcessing]);

  const submitImageForAttendance = useCallback(
    async (image: string): Promise<void> => {
      if (!apiKey || classId === null || processingRef.current) {
        return;
      }

      processingRef.current = true;
      setIsProcessing(true);

      try {
        const markResult = await autoMarkAttendance(apiKey, classId, image);
        setResult(markResult);

        if (resultTimeoutRef.current) {
          window.clearTimeout(resultTimeoutRef.current);
        }

        resultTimeoutRef.current = window.setTimeout(
          () => setResult(null),
          markResult.matched ? 4000 : 2000,
        );
      } catch (markError) {
        setResult({
          matched: false,
          message: getApiErrorMessage(markError, "Kiosk could not mark attendance"),
          student: null,
          employee: null,
          action: null,
          time: null,
          confidence_score: null,
          notification_status: null,
        });
        resultTimeoutRef.current = window.setTimeout(() => setResult(null), 2000);
      } finally {
        processingRef.current = false;
        setIsProcessing(false);
      }
    },
    [apiKey, classId],
  );

  useEffect(() => {
    if (!apiKey || classId === null) {
      return;
    }

    async function captureAndMark(): Promise<void> {
      if (processingRef.current) {
        return;
      }

      const image = webcamRef.current?.getScreenshot();
      if (!image) {
        return;
      }

      await submitImageForAttendance(image);
    }

    intervalRef.current = window.setInterval(() => {
      void captureAndMark();
    }, 2500);

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }
      if (resultTimeoutRef.current) {
        window.clearTimeout(resultTimeoutRef.current);
      }
    };
  }, [apiKey, classId, submitImageForAttendance]);

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

  const hasValidConfig = Boolean(apiKey && classId !== null);
  const liveCameraBlocked = isSecureContext === false;
  const cameraMessage = cameraError ?? (liveCameraBlocked
    ? "Live camera is blocked outside a trusted HTTPS secure context. Use a trusted HTTPS URL for live kiosk mode, or use Capture/Upload Photo."
    : null);

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="flex min-h-screen flex-col p-4 sm:p-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white text-base font-bold text-slate-950 sm:size-12 sm:text-lg">
              FA
            </div>
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-slate-400">
                Attendance Kiosk
              </p>
              <h1 className="text-xl font-semibold sm:text-2xl">
                {organizationName ??
                  (!apiKey
                    ? "Face Attendance"
                    : hasOrganizationError
                      ? "Unknown Organization"
                      : "Loading organization...")}
              </h1>
              {classId ? (
                <p className="mt-1 text-sm text-slate-500">
                  Class #{classId}
                </p>
              ) : null}
            </div>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-sm text-slate-400">Current Time</p>
            <p className="text-base font-semibold tabular-nums sm:text-xl">
              {formatClock(clock)}
            </p>
          </div>
        </header>

        <section className="flex flex-1 items-center justify-center py-6 sm:py-8">
          <div className="w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 shadow-2xl">
            {hasValidConfig ? (
              <>
                <Webcam
                  ref={webcamRef}
                  audio={false}
                  mirrored
                  playsInline
                  screenshotFormat="image/jpeg"
                  videoConstraints={videoConstraints}
                  className="aspect-video w-full object-cover"
                  onUserMedia={() => setCameraError(null)}
                  onUserMediaError={(error) =>
                    setCameraError(getCameraErrorMessage(error))
                  }
                />
                <div className="border-t border-slate-700 p-4">
                  {cameraMessage ? (
                    <p className="mb-3 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
                      {cameraMessage}
                    </p>
                  ) : null}
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-slate-400">
                      Live camera auto-scans every few seconds. If the browser
                      blocks camera access, use the photo fallback.
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      capture="user"
                      className="hidden"
                      onChange={(event) => void handleFileCapture(event)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isProcessing}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Capture/Upload Photo
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex aspect-video items-center justify-center p-8 text-center text-slate-300">
                Missing kiosk configuration. Open this page with
                /kiosk?key=[API_KEY]&class_id=[CLASS_ID].
              </div>
            )}
          </div>
        </section>

        <footer className="mx-auto w-full max-w-3xl">
          <ResultCard result={result} />
          {isProcessing ? (
            <p className="mt-3 text-center text-xs text-slate-500">
              Processing silently...
            </p>
          ) : null}
        </footer>
      </div>
    </main>
  );
}
