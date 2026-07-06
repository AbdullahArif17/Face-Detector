"use client";

import { useRef, useState } from "react";
import Webcam from "react-webcam";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { enrollEmployeeFace, type Employee } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/errors";

interface FaceEnrollModalProps {
  open: boolean;
  employee: Employee | null;
  onOpenChange: (open: boolean) => void;
  onEnrolled: (employeeId: number, headshotUrl: string) => void;
}

const videoConstraints = {
  facingMode: "user",
};

const MAX_UPLOAD_BYTES = 2_000_000;

function getErrorMessage(error: unknown): string {
  return getApiErrorMessage(
    error,
    "Face enrollment failed. Capture or upload a clear front-facing photo and try again.",
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Unable to read image file."));
    };
    reader.onerror = () => reject(new Error("Unable to read image file."));
    reader.readAsDataURL(file);
  });
}

export function FaceEnrollModal({
  open,
  employee,
  onOpenChange,
  onEnrolled,
}: FaceEnrollModalProps) {
  const webcamRef = useRef<Webcam>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isUpdatingExistingFace = employee?.has_face_enrolled === true;

  function handleCapture(): void {
    const screenshot = webcamRef.current?.getScreenshot();
    if (!screenshot) {
      setError("Unable to capture photo from webcam.");
      return;
    }

    setCapturedImage(screenshot);
    setIsCameraActive(false);
    setStatusMessage(
      isUpdatingExistingFace
        ? "Photo captured. Review it before updating."
        : "Photo captured. Review it before enrolling.",
    );
    setError(null);
  }

  async function handleFileUpload(
    event: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Upload a valid image file.");
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      setError("Image is too large. Use an image under 2 MB.");
      return;
    }

    try {
      const imageDataUrl = await readFileAsDataUrl(file);
      setCapturedImage(imageDataUrl);
      setIsCameraActive(false);
      setStatusMessage(
        isUpdatingExistingFace
          ? "Photo uploaded. Review it before updating."
          : "Photo uploaded. Review it before enrolling.",
      );
      setError(null);
    } catch {
      setError("Unable to read image file.");
    }
  }

  async function handleEnroll(): Promise<void> {
    if (!employee || !capturedImage || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setStatusMessage(
      isUpdatingExistingFace ? "Updating face..." : "Enrolling face...",
    );

    try {
      await enrollEmployeeFace(employee.id, capturedImage);
      setStatusMessage(
        isUpdatingExistingFace
          ? "Face updated successfully"
          : "Face enrolled successfully",
      );
      onEnrolled(employee.id, capturedImage);
    } catch (enrollError) {
      setError(getErrorMessage(enrollError));
      setStatusMessage(null);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isUpdatingExistingFace ? "Update face" : "Enroll face"}
          </DialogTitle>
          <DialogDescription>
            {employee
              ? isUpdatingExistingFace
                ? `Replace the enrolled face image for ${employee.name}.`
                : `Capture or upload a clear face image for ${employee.name}.`
              : "Select an employee before enrolling a face."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="overflow-hidden rounded-lg border bg-muted">
            {isCameraActive ? (
              <Webcam
                ref={webcamRef}
                audio={false}
                mirrored
                screenshotFormat="image/jpeg"
                videoConstraints={videoConstraints}
                className="aspect-video w-full object-cover"
              />
            ) : capturedImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt="Selected employee face preview"
                src={capturedImage}
                className="aspect-video w-full object-cover"
              />
            ) : (
              <div className="flex aspect-video items-center justify-center text-sm text-muted-foreground">
                Webcam preview or uploaded photo will appear here.
              </div>
            )}
          </div>

          {statusMessage ? (
            <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
              {statusMessage}
            </p>
          ) : null}

          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <div className="grid gap-2 sm:flex sm:flex-wrap sm:justify-end">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => void handleFileUpload(event)}
            />
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => {
                setCapturedImage(null);
                setStatusMessage(null);
                setError(null);
                setIsCameraActive(true);
              }}
            >
              Use Camera
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => fileInputRef.current?.click()}
            >
              Upload Photo
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              disabled={!isCameraActive}
              onClick={handleCapture}
            >
              Capture Photo
            </Button>
            <Button
              type="button"
              className="w-full sm:w-auto"
              disabled={!capturedImage || isSubmitting}
              onClick={handleEnroll}
            >
              {isSubmitting
                ? isUpdatingExistingFace
                  ? "Updating..."
                  : "Enrolling..."
                : isUpdatingExistingFace
                  ? "Update Face"
                  : "Enroll Face"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
