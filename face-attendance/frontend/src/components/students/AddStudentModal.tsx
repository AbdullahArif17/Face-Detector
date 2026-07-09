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
  updateStudent,
  type Student,
  type StudentInput,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/errors";

const grades = Array.from({ length: 12 }, (_, index) => `Class ${index + 1}`);
const sections = ["A", "B", "C", "D"];
const MAX_UPLOAD_BYTES = 2_000_000;

interface AddStudentModalProps {
  open: boolean;
  student: Student | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (student: Student, mode: "created" | "updated") => void;
}

function getErrorMessage(error: unknown): string {
  return getApiErrorMessage(error, "Unable to save student.");
}

function isValidParentPhone(phone: string): boolean {
  const normalized = phone.trim().replace(/[\s\-()+]/g, "");
  return /^92\d{10}$/.test(normalized) || /^03\d{9}$/.test(normalized);
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
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = student !== null;

  async function handleImageUpload(
    event: ChangeEvent<HTMLInputElement>,
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
      setProfileImage(await readFileAsDataUrl(file));
      setError(null);
    } catch {
      setError("Unable to read image file.");
    }
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
        ? await updateStudent(student.id, payload)
        : await createStudent(payload);
      onSaved(savedStudent, isEditing ? "updated" : "created");
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
                  This image is used as the student profile photo. Use the table&apos;s
                  Enroll Face action for attendance recognition.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => void handleImageUpload(event)}
                />
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Upload Photo
                  </Button>
                  {profileImage ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full text-red-600 hover:text-red-700 sm:w-auto"
                      onClick={() => setProfileImage(null)}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
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
              disabled={isSubmitting}
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
