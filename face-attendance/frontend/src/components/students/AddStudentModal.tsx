"use client";

import { useRef, useState, type ChangeEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createStudent,
  enrollStudentFace,
  updateStudent,
  type Student,
  type StudentInput,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/errors";
import {
  MAX_FACE_ENROLLMENT_IMAGES,
  MAX_SOURCE_IMAGE_MB,
  optimizeImageFile,
} from "@/lib/images";

const grades = Array.from({ length: 12 }, (_, index) => `Class ${index + 1}`);
const sections = ["A", "B", "C", "D"];

interface AddStudentModalProps {
  open: boolean;
  student: Student | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (student: Student, mode: "created" | "updated") => void;
}

function getErrorMessage(error: unknown): string {
  return getApiErrorMessage(error, "Unable to save student.");
}

function getFaceErrorMessage(error: unknown): string {
  return getApiErrorMessage(
    error,
    "Face enrollment failed. Upload a clear front-facing photo.",
  );
}

function isValidParentPhone(phone: string): boolean {
  const normalized = phone.trim().replace(/[\s\-()+]/g, "");
  return /^92\d{10}$/.test(normalized) || /^03\d{9}$/.test(normalized);
}

export function AddStudentModal({
  open,
  student,
  onOpenChange,
  onSaved,
}: AddStudentModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [studentName, setStudentName] = useState(student?.student_name ?? "");
  const [studentCode, setStudentCode] = useState(student?.student_code ?? "");
  const [grade, setGrade] = useState(student?.grade ?? "Class 1");
  const [section, setSection] = useState(student?.section ?? "A");
  const [parentName, setParentName] = useState(student?.parent_name ?? "");
  const [parentPhone, setParentPhone] = useState(student?.parent_phone ?? "");
  const [parentPhone2, setParentPhone2] = useState(student?.parent_phone_2 ?? "");
  const [profileImage, setProfileImage] = useState<string | null>(
    student?.profile_image ?? null,
  );
  const [enrollmentImages, setEnrollmentImages] = useState<string[]>([]);
  const [shouldEnrollFace, setShouldEnrollFace] = useState(false);
  const [draftSavedStudent, setDraftSavedStudent] = useState<Student | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imageMessage, setImageMessage] = useState<string | null>(null);
  const [isProcessingImages, setIsProcessingImages] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const saveTarget = draftSavedStudent ?? student;
  const isEditing = saveTarget !== null;

  async function handleImageUpload(
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (selectedFiles.length === 0) {
      return;
    }

    const remainingSlots =
      MAX_FACE_ENROLLMENT_IMAGES - enrollmentImages.length;
    if (remainingSlots <= 0) {
      setError(
        `A face enrollment can use up to ${MAX_FACE_ENROLLMENT_IMAGES} photos. Remove a sample before adding another.`,
      );
      return;
    }

    const files = selectedFiles.slice(0, remainingSlots);
    setIsProcessingImages(true);
    try {
      const optimizedImages: string[] = [];
      for (const file of files) {
        optimizedImages.push(await optimizeImageFile(file));
      }

      const uniqueImages = optimizedImages.filter(
        (image, index) =>
          !enrollmentImages.includes(image) &&
          optimizedImages.indexOf(image) === index,
      );
      if (uniqueImages.length === 0) {
        setError("Those face photos are already selected.");
        return;
      }

      setProfileImage((currentImage) => currentImage ?? uniqueImages[0]);
      setEnrollmentImages((currentImages) => [
        ...currentImages,
        ...uniqueImages,
      ]);
      setShouldEnrollFace(true);
      setError(null);
      setImageMessage(
        selectedFiles.length > files.length
          ? `Added ${uniqueImages.length} photo${uniqueImages.length === 1 ? "" : "s"}. Face enrollment is limited to ${MAX_FACE_ENROLLMENT_IMAGES} samples, so the extra selection was not added.`
          : `Added ${uniqueImages.length} face photo${uniqueImages.length === 1 ? "" : "s"}. Existing photos were kept.`,
      );
    } catch (imageError) {
      setError(
        imageError instanceof Error
          ? imageError.message
          : "Unable to read image file.",
      );
    } finally {
      setIsProcessingImages(false);
    }
  }

  function removeEnrollmentImage(index: number): void {
    const nextImages = enrollmentImages.filter(
      (_image, imageIndex) => imageIndex !== index,
    );
    setEnrollmentImages(nextImages);
    if (nextImages.length === 0) {
      setShouldEnrollFace(false);
    }
    setImageMessage("Face sample removed. The profile photo was not changed.");
    setError(null);
  }

  async function handleSave(): Promise<void> {
    if (isSubmitting) {
      return;
    }

    if (!studentName.trim() || !studentCode.trim() || !parentName.trim()) {
      setError("Student name, roll number, and parent name are required.");
      return;
    }
    if (!isValidParentPhone(parentPhone)) {
      setError("Parent WhatsApp number format: 923001234567 or 03001234567.");
      return;
    }
    if (parentPhone2.trim() && !isValidParentPhone(parentPhone2.trim())) {
      setError("Second parent number format: 923001234567 or 03001234567.");
      return;
    }

    const payload: StudentInput = {
      student_name: studentName.trim(),
      student_code: studentCode.trim(),
      grade,
      section,
      parent_name: parentName.trim(),
      parent_phone: parentPhone.trim(),
      parent_phone_2: parentPhone2.trim() || null,
      profile_image: profileImage,
    };

    setIsSubmitting(true);
    setError(null);
    try {
      const savedStudent = isEditing
        ? await updateStudent(saveTarget.id, payload)
        : await createStudent(payload);

      if (shouldEnrollFace && enrollmentImages.length > 0) {
        try {
          await enrollStudentFace(
            savedStudent.id,
            enrollmentImages,
            { updateProfileImage: false },
          );
        } catch (enrollError) {
          setDraftSavedStudent(savedStudent);
          setError(
            `Student saved, but face enrollment failed: ${getFaceErrorMessage(
              enrollError,
            )}`,
          );
          return;
        }
      }

      onSaved(
        shouldEnrollFace && enrollmentImages.length > 0
          ? { ...savedStudent, has_face_enrolled: true }
          : savedStudent,
        isEditing ? "updated" : "created",
      );
      onOpenChange(false);
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit student" : "Add student"}</DialogTitle>
          <DialogDescription>
            Student records include parent WhatsApp numbers for notifications.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="student-name">Student Full Name</Label>
            <Input
              id="student-name"
              value={studentName}
              onChange={(event) => setStudentName(event.target.value)}
              placeholder="Student full name"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="student-code">Roll Number</Label>
            <Input
              id="student-code"
              value={studentCode}
              onChange={(event) => setStudentCode(event.target.value)}
              placeholder="R-1001"
            />
          </div>

          <div className="grid gap-2">
            <Label>Student Photo (optional)</Label>
            <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-center">
              {profileImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt="Selected student"
                  src={profileImage}
                  className="size-20 rounded-full border bg-background object-cover"
                />
              ) : (
                <div className="flex size-20 items-center justify-center rounded-full border bg-background text-xs font-medium text-muted-foreground">
                  No photo
                </div>
              )}
              <div className="grid flex-1 gap-2">
                <p className="text-xs text-muted-foreground">
                  Add up to {MAX_FACE_ENROLLMENT_IMAGES} clear face photos. New
                  selections are appended; the current profile photo stays until
                  you remove or explicitly replace it.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(event) => void handleImageUpload(event)}
                />
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full sm:w-auto"
                    disabled={
                      isProcessingImages ||
                      enrollmentImages.length >= MAX_FACE_ENROLLMENT_IMAGES
                    }
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {isProcessingImages
                      ? "Processing photos..."
                      : enrollmentImages.length > 0
                        ? "Add Face Photos"
                        : "Choose Face Photos"}
                  </Button>
                  {profileImage ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full text-red-600 hover:text-red-700 sm:w-auto"
                      onClick={() => {
                        setProfileImage(null);
                        setImageMessage(
                          "Profile photo removed. Selected face samples were kept.",
                        );
                      }}
                    >
                      Remove Profile Photo
                    </Button>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  Each original may be up to {MAX_SOURCE_IMAGE_MB} MB. It is
                  compressed on this device; the original file is not uploaded
                  or stored in Neon.
                </p>
                {enrollmentImages.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex gap-3 overflow-x-auto pb-1">
                      {enrollmentImages.map((image, index) => (
                        <div
                          className="w-24 shrink-0 space-y-1"
                          key={`${image.slice(-24)}-${index}`}
                        >
                          <div className="relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              alt={`Face sample ${index + 1}`}
                              className="size-24 rounded-md border bg-background object-cover"
                              src={image}
                            />
                            <button
                              type="button"
                              aria-label={`Remove face sample ${index + 1}`}
                              className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-full bg-black/70 text-sm font-bold text-white hover:bg-black"
                              onClick={() => removeEnrollmentImage(index)}
                            >
                              ×
                            </button>
                          </div>
                          {profileImage === image ? (
                            <p className="text-center text-[11px] font-medium text-blue-700">
                              Profile photo
                            </p>
                          ) : (
                            <button
                              type="button"
                              className="w-full text-center text-[11px] font-medium text-blue-700 hover:underline"
                              onClick={() => {
                                setProfileImage(image);
                                setImageMessage(
                                  `Face sample ${index + 1} will become the profile photo when you save.`,
                                );
                              }}
                            >
                              Use as profile
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <label className="flex items-start gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={shouldEnrollFace}
                        onChange={(event) =>
                          setShouldEnrollFace(event.target.checked)
                        }
                      />
                      <span>
                        Enroll {enrollmentImages.length} selected photo
                        {enrollmentImages.length === 1 ? "" : "s"} for
                        attendance. Two or three angles give better results.
                      </span>
                    </label>
                  </div>
                ) : null}
                {imageMessage ? (
                  <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                    {imageMessage}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="student-grade">Grade</Label>
              <select
                id="student-grade"
                value={grade}
                onChange={(event) => setGrade(event.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {grades.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="student-section">Section</Label>
              <select
                id="student-section"
                value={section}
                onChange={(event) => setSection(event.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {sections.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="parent-name">Parent/Guardian Name</Label>
            <Input
              id="parent-name"
              value={parentName}
              onChange={(event) => setParentName(event.target.value)}
              placeholder="Parent name"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="parent-phone">Parent WhatsApp Number</Label>
            <Input
              id="parent-phone"
              inputMode="numeric"
              value={parentPhone}
              onChange={(event) => setParentPhone(event.target.value)}
              placeholder="923001234567"
            />
            <p className="text-xs text-muted-foreground">
              Format: 923001234567 or 03001234567
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="parent-phone-2">Second Parent Number (optional)</Label>
            <Input
              id="parent-phone-2"
              inputMode="numeric"
              value={parentPhone2}
              onChange={(event) => setParentPhone2(event.target.value)}
              placeholder="923001234567"
            />
          </div>

          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="w-full sm:w-auto"
              disabled={isSubmitting || isProcessingImages}
              onClick={() => void handleSave()}
            >
              {isSubmitting
                ? "Saving..."
                : isEditing
                  ? "Save changes"
                  : "Add Student"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
