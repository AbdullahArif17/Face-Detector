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
import {
  MAX_FACE_ENROLLMENT_IMAGES,
  MAX_SOURCE_IMAGE_MB,
  optimizeImageDataUrl,
  optimizeImageFile,
} from "@/lib/images";

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
  onEnrolled: (studentId: number, profileImage: string | null) => void;
}>) {
  const webcamRef = useRef<Webcam>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [useAsProfile, setUseAsProfile] = useState(
    student.profile_image === null,
  );
  const [isCameraActive, setIsCameraActive] = useState(true);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const isUpdating = student.has_face_enrolled;
  const previewImage = selectedImages[previewIndex] ?? selectedImages[0];

  async function handleCapture(): Promise<void> {
    if (selectedImages.length >= MAX_FACE_ENROLLMENT_IMAGES) {
      setError(
        `A face enrollment can use up to ${MAX_FACE_ENROLLMENT_IMAGES} photos. Remove a sample before adding another.`,
      );
      return;
    }
    const screenshot = webcamRef.current?.getScreenshot();
    if (!screenshot) {
      setError("Unable to capture photo from webcam.");
      return;
    }
    setIsProcessingImage(true);
    try {
      const image = await optimizeImageDataUrl(screenshot);
      if (selectedImages.includes(image)) {
        setError("This face photo is already selected.");
        return;
      }
      setSelectedImages((images) => [...images, image]);
      setPreviewIndex(selectedImages.length);
      setIsCameraActive(false);
      setIsCameraReady(false);
      setCameraError(null);
      setStatusMessage("Photo captured. Existing samples were kept.");
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
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (selectedFiles.length === 0) {
      return;
    }

    const remainingSlots =
      MAX_FACE_ENROLLMENT_IMAGES - selectedImages.length;
    if (remainingSlots <= 0) {
      setError(
        `A face enrollment can use up to ${MAX_FACE_ENROLLMENT_IMAGES} photos. Remove a sample before adding another.`,
      );
      return;
    }

    const files = selectedFiles.slice(0, remainingSlots);
    setIsProcessingImage(true);
    try {
      const optimizedImages: string[] = [];
      for (const file of files) {
        optimizedImages.push(await optimizeImageFile(file));
      }
      const uniqueImages = optimizedImages.filter(
        (image, index) =>
          !selectedImages.includes(image) &&
          optimizedImages.indexOf(image) === index,
      );
      if (uniqueImages.length === 0) {
        setError("Those face photos are already selected.");
        return;
      }

      setSelectedImages((images) => [...images, ...uniqueImages]);
      setPreviewIndex(selectedImages.length);
      setIsCameraActive(false);
      setIsCameraReady(false);
      setCameraError(null);
      setStatusMessage(
        selectedFiles.length > files.length
          ? `Added ${uniqueImages.length} photo${uniqueImages.length === 1 ? "" : "s"}. The extra selection was not added because enrollment is limited to ${MAX_FACE_ENROLLMENT_IMAGES} samples.`
          : `Added ${uniqueImages.length} photo${uniqueImages.length === 1 ? "" : "s"}. Existing samples were kept.`,
      );
      setError(null);
    } catch (imageError) {
      setError(
        imageError instanceof Error
          ? imageError.message
          : "Unable to read image file.",
      );
    } finally {
      setIsProcessingImage(false);
    }
  }

  function removeSelectedImage(index: number): void {
    const nextImages = selectedImages.filter(
      (_image, imageIndex) => imageIndex !== index,
    );
    setSelectedImages(nextImages);
    setPreviewIndex((currentIndex) =>
      Math.min(currentIndex, Math.max(0, nextImages.length - 1)),
    );
    setStatusMessage("Face sample removed. The saved profile photo was not changed.");
    setError(null);
  }

  async function handleEnroll(): Promise<void> {
    if (selectedImages.length === 0 || isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    setError(null);
    setStatusMessage(isUpdating ? "Updating face..." : "Enrolling face...");
    try {
      const result = await enrollStudentFace(student.id, selectedImages, {
        updateProfileImage: useAsProfile,
      });
      onEnrolled(student.id, result.profile_image);
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
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isUpdating ? "Update face" : "Enroll face"}</DialogTitle>
          <DialogDescription>
            Capture or upload up to {MAX_FACE_ENROLLMENT_IMAGES} clear face
            images for {student.student_name}. Existing samples stay selected
            until you remove them.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-lg border bg-muted/20 p-3">
            {student.profile_image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={`${student.student_name} current profile`}
                className="size-16 shrink-0 rounded-full border bg-background object-cover"
                src={student.profile_image}
              />
            ) : (
              <div className="flex size-16 shrink-0 items-center justify-center rounded-full border bg-background text-xs text-muted-foreground">
                No photo
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium">Current profile photo</p>
              <p className="text-xs text-muted-foreground">
                It stays unchanged unless you choose to replace it below. Face
                enrollment and the profile photo are saved separately.
              </p>
            </div>
          </div>

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
                onUserMedia={() => {
                  setIsCameraReady(true);
                  setCameraError(null);
                }}
                onUserMediaError={() => {
                  setIsCameraActive(false);
                  setIsCameraReady(false);
                  setCameraError(
                    "Camera access is unavailable. Allow camera permission in your browser, make sure this page uses HTTPS, or add photos from this device instead.",
                  );
                }}
              />
            ) : previewImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt="Selected student face preview"
                src={previewImage}
                className="aspect-video w-full object-cover"
              />
            ) : (
              <div className="flex aspect-video items-center justify-center text-sm text-muted-foreground">
                Webcam preview or uploaded photo will appear here.
              </div>
            )}
          </div>

          {cameraError ? (
            <div
              className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
              role="alert"
            >
              <p className="font-medium">Camera could not start</p>
              <p className="mt-1 text-pretty">{cameraError}</p>
            </div>
          ) : null}

          {selectedImages.length > 0 ? (
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex gap-3 overflow-x-auto pb-1">
                {selectedImages.map((image, index) => (
                  <div
                    className="relative size-24 shrink-0"
                    key={`${image.slice(-24)}-${index}`}
                  >
                    <button
                      type="button"
                      className="block size-24"
                      aria-label={`Preview face sample ${index + 1}`}
                      onClick={() => {
                        setPreviewIndex(index);
                        setIsCameraActive(false);
                        setIsCameraReady(false);
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        alt={`Face sample ${index + 1}`}
                        className={`size-24 rounded-md border-2 bg-background object-cover ${
                          previewIndex === index
                            ? "border-blue-600"
                            : "border-transparent"
                        }`}
                        src={image}
                      />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove face sample ${index + 1}`}
                      className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-full bg-black/70 text-sm font-bold text-white hover:bg-black"
                      onClick={() => removeSelectedImage(index)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={useAsProfile}
                  onChange={(event) => setUseAsProfile(event.target.checked)}
                />
                <span>
                  Use the first selected photo as the profile photo. Leave this
                  unchecked to preserve the current profile photo.
                </span>
              </label>
              <p className="text-xs text-muted-foreground">
                Each original may be up to {MAX_SOURCE_IMAGE_MB} MB and is
                compressed locally before upload. Original files are not stored
                in Neon.
              </p>
            </div>
          ) : null}

          {statusMessage ? (
            <p
              className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700"
              role="status"
              aria-live="polite"
            >
              {statusMessage}
            </p>
          ) : null}

          {error ? (
            <p
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <div className="grid gap-2 sm:flex sm:flex-wrap sm:justify-end">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => void handleUpload(event)}
            />
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              disabled={isProcessingImage || isSubmitting}
              onClick={() => {
                setIsCameraActive(true);
                setIsCameraReady(false);
                setCameraError(null);
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
              disabled={
                selectedImages.length >= MAX_FACE_ENROLLMENT_IMAGES ||
                isProcessingImage
              }
              onClick={() => fileInputRef.current?.click()}
            >
              {isProcessingImage ? "Processing..." : "Add Photos"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              disabled={
                !isCameraActive ||
                !isCameraReady ||
                selectedImages.length >= MAX_FACE_ENROLLMENT_IMAGES ||
                isProcessingImage
              }
              onClick={() => void handleCapture()}
            >
              {isProcessingImage
                ? "Processing..."
                : isCameraActive && !isCameraReady
                  ? "Starting camera..."
                  : "Capture Photo"}
            </Button>
            <Button
              type="button"
              className="w-full sm:w-auto"
              disabled={
                selectedImages.length === 0 ||
                isProcessingImage ||
                isSubmitting
              }
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
              {selectedImages.length}/{MAX_FACE_ENROLLMENT_IMAGES} samples
              selected. Add different clear angles for better matching.
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            On phones, camera access requires an HTTPS kiosk or dashboard URL and
            browser permission. Photo upload remains available if the camera is
            blocked.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
