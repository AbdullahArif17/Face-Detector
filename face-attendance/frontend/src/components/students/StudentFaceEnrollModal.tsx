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
import { optimizeImageDataUrl, optimizeImageFile } from "@/lib/images";

const videoConstraints = {
  facingMode: "user",
};

function getErrorMessage(error: unknown): string {
  return getApiErrorMessage(
    error,
    "Face enrollment failed. Capture or upload a clear front-facing photo.",
  );
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
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [isCameraActive, setIsCameraActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isUpdating = student.has_face_enrolled;

  async function handleCapture(): Promise<void> {
    const screenshot = webcamRef.current?.getScreenshot();
    if (!screenshot) {
      setError("Unable to capture photo from webcam.");
      return;
    }
    setIsProcessingImage(true);
    try {
      const image = await optimizeImageDataUrl(screenshot);
      setSelectedImages((images) => [...images, image].slice(-3));
      setIsCameraActive(false);
      setStatusMessage("Photo captured. Review it before saving.");
      setError(null);
    } catch (imageError) {
      setError(
        imageError instanceof Error
          ? imageError.message
          : "Unable to process captured image.",
      );
    } finally {
      setIsProcessingImage(false);
    }
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    try {
      const image = await optimizeImageFile(file);
      setSelectedImages((images) => [...images, image].slice(-3));
      setIsCameraActive(false);
      setStatusMessage("Photo uploaded. Review it before saving.");
      setError(null);
    } catch (imageError) {
      setError(
        imageError instanceof Error
          ? imageError.message
          : "Unable to read image file.",
      );
    }
  }

  async function handleEnroll(): Promise<void> {
    if (selectedImages.length === 0 || isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    setError(null);
    setStatusMessage(isUpdating ? "Updating face..." : "Enrolling face...");
    try {
      await enrollStudentFace(student.id, selectedImages);
      onEnrolled(student.id, selectedImages[0]);
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
            ) : selectedImages[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt="Selected student face preview"
                src={selectedImages[0]}
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
                setIsCameraActive(true);
                setStatusMessage(null);
                setError(null);
              }}
            >
              {selectedImages.length > 0 ? "Add camera sample" : "Use Camera"}
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
              disabled={
                !isCameraActive ||
                selectedImages.length >= 3 ||
                isProcessingImage
              }
              onClick={() => void handleCapture()}
            >
              {isProcessingImage ? "Processing..." : "Capture Photo"}
            </Button>
            <Button
              type="button"
              className="w-full sm:w-auto"
              disabled={selectedImages.length === 0 || isSubmitting}
              onClick={() => void handleEnroll()}
            >
              {isSubmitting
                ? "Saving..."
                : isUpdating
                  ? "Update Face"
                : `Enroll Face${selectedImages.length > 1 ? ` (${selectedImages.length})` : ""}`}
            </Button>
          </div>
          {selectedImages.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              {selectedImages.length}/3 samples selected. Add different clear angles for better matching.
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
