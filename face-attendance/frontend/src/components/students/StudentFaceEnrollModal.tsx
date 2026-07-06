"use client";

import { useRef, useState, type ChangeEvent } from "react";
import Webcam from "react-webcam";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { enrollStudentFace, type Student } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/errors";

const videoConstraints = {
  facingMode: "user",
};

const MAX_UPLOAD_BYTES = 2_000_000;

function getErrorMessage(error: unknown): string {
  return getApiErrorMessage(
    error,
    "Face enrollment failed. Capture or upload a clear front-facing photo.",
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

export function StudentFaceEnrollModal({
  open,
  student,
  onOpenChange,
  onEnrolled,
}: Readonly<{
  open: boolean;
  student: Student;
  onOpenChange: (open: boolean) => void;
  onEnrolled: (studentId: number, profileImage: string) => void;
}>) {
  const webcamRef = useRef<Webcam>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isUpdating = student.has_face_enrolled;

  function handleCapture(): void {
    const screenshot = webcamRef.current?.getScreenshot();
    if (!screenshot) {
      setError("Unable to capture photo from webcam.");
      return;
    }
    setSelectedImage(screenshot);
    setIsCameraActive(false);
    setStatusMessage("Photo captured. Review it before saving.");
    setError(null);
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>): Promise<void> {
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
      setSelectedImage(await readFileAsDataUrl(file));
      setIsCameraActive(false);
      setStatusMessage("Photo uploaded. Review it before saving.");
      setError(null);
    } catch {
      setError("Unable to read image file.");
    }
  }

  async function handleEnroll(): Promise<void> {
    if (!selectedImage || isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    setError(null);
    setStatusMessage(isUpdating ? "Updating face..." : "Enrolling face...");
    try {
      await enrollStudentFace(student.id, selectedImage);
      onEnrolled(student.id, selectedImage);
      setStatusMessage(isUpdating ? "Face updated." : "Face enrolled.");
      onOpenChange(false);
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
          <DialogTitle>{isUpdating ? "Update face" : "Enroll face"}</DialogTitle>
          <DialogDescription>
            Capture or upload a clear face image for {student.student_name}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="overflow-hidden rounded-lg border bg-muted">
            {isCameraActive ? (
              <Webcam
                ref={webcamRef}
                audio={false}
                mirrored
                playsInline
                screenshotFormat="image/jpeg"
                videoConstraints={videoConstraints}
                className="aspect-video w-full object-cover"
              />
            ) : selectedImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt="Selected student face preview"
                src={selectedImage}
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
              onChange={(event) => void handleUpload(event)}
            />
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => {
                setSelectedImage(null);
                setIsCameraActive(true);
                setStatusMessage(null);
                setError(null);
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
              disabled={!selectedImage || isSubmitting}
              onClick={() => void handleEnroll()}
            >
              {isSubmitting
                ? "Saving..."
                : isUpdating
                  ? "Update Face"
                  : "Enroll Face"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
