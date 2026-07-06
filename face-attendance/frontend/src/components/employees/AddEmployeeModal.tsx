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
  createEmployee,
  enrollEmployeeFace,
  type Employee,
  type EmployeeInput,
  updateEmployee,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/errors";

interface AddEmployeeModalProps {
  open: boolean;
  employee: Employee | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (
    employee: Employee,
    mode: "created" | "updated",
    message?: string,
  ) => void;
}

function getErrorMessage(error: unknown): string {
  return getApiErrorMessage(
    error,
    "Unable to save employee. Check the details and try again.",
  );
}

function optionalValue(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const MAX_UPLOAD_BYTES = 2_000_000;

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

export function AddEmployeeModal({
  open,
  employee,
  onOpenChange,
  onSaved,
}: AddEmployeeModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(employee?.name ?? "");
  const [email, setEmail] = useState(employee?.email ?? "");
  const [phone, setPhone] = useState(employee?.phone ?? "");
  const [designation, setDesignation] = useState(employee?.designation ?? "");
  const [department, setDepartment] = useState(employee?.department ?? "");
  const [branch, setBranch] = useState(
    employee?.branch_id ? String(employee.branch_id) : "",
  );
  const [faceImage, setFaceImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStep, setSubmitStep] = useState<"idle" | "saving" | "enrolling">(
    "idle",
  );
  const [savedEmployeeForFaceRetry, setSavedEmployeeForFaceRetry] =
    useState<Employee | null>(null);
  const [savedModeForFaceRetry, setSavedModeForFaceRetry] = useState<
    "created" | "updated" | null
  >(null);

  const isEditing = employee !== null;
  const isProfileLocked = savedEmployeeForFaceRetry !== null;
  const hasExistingFaceEnrollment = employee?.has_face_enrolled === true;
  const shouldShowInlineFaceEnrollment =
    !hasExistingFaceEnrollment || savedEmployeeForFaceRetry !== null;

  function getSubmitButtonLabel(): string {
    if (isSubmitting) {
      return submitStep === "enrolling" ? "Enrolling face..." : "Saving...";
    }

    if (savedEmployeeForFaceRetry !== null) {
      return "Retry face enrollment";
    }

    return isEditing ? "Save changes" : "Add employee";
  }

  async function handleFaceImageUpload(
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
      setFaceImage(await readFileAsDataUrl(file));
      setError(null);
    } catch {
      setError("Unable to read image file.");
    }
  }

  async function handleSubmit(): Promise<void> {
    if (isSubmitting) {
      return;
    }

    if (savedEmployeeForFaceRetry !== null) {
      if (!faceImage) {
        setError("Upload a face photo before retrying enrollment.");
        return;
      }

      setIsSubmitting(true);
      setSubmitStep("enrolling");
      setError(null);

      try {
        await enrollEmployeeFace(savedEmployeeForFaceRetry.id, faceImage);
        const enrolledEmployee = {
          ...savedEmployeeForFaceRetry,
          has_face_enrolled: true,
          headshot_url: faceImage,
        };
        onSaved(
          enrolledEmployee,
          savedModeForFaceRetry ?? "updated",
          "Face enrolled successfully",
        );
        setSavedEmployeeForFaceRetry(null);
        setSavedModeForFaceRetry(null);
        onOpenChange(false);
      } catch (enrollError) {
        setError(
          `Employee profile is saved, but face enrollment still failed: ${getErrorMessage(enrollError)}`,
        );
      } finally {
        setIsSubmitting(false);
        setSubmitStep("idle");
      }
      return;
    }

    if (!name.trim() || !email.trim()) {
      setError("Full name and email are required.");
      return;
    }

    const trimmedBranch = branch.trim();
    const branchId =
      trimmedBranch.length > 0 ? Number.parseInt(trimmedBranch, 10) : undefined;
    if (
      branchId !== undefined &&
      (!Number.isInteger(branchId) || branchId <= 0)
    ) {
      setError("Branch must be a positive numeric branch ID.");
      return;
    }

    const payload: EmployeeInput = {
      name: name.trim(),
      email: email.trim(),
      phone: optionalValue(phone),
      designation: optionalValue(designation),
      department: optionalValue(department),
      ...(branchId !== undefined ? { branch_id: branchId } : {}),
    };

    setIsSubmitting(true);
    setSubmitStep("saving");
    setError(null);

    try {
      const mode = employee === null ? "created" : "updated";
      let savedEmployee =
        employee === null
          ? await createEmployee(payload)
          : await updateEmployee(employee.id, payload);

      let message =
        mode === "created" ? "Employee added" : "Employee updated";

      if (faceImage) {
        try {
          setSubmitStep("enrolling");
          await enrollEmployeeFace(savedEmployee.id, faceImage);
          savedEmployee = {
            ...savedEmployee,
            has_face_enrolled: true,
            headshot_url: faceImage,
          };
          message =
            mode === "created"
              ? "Employee added and face enrolled"
              : "Employee updated and face enrolled";
        } catch (enrollError) {
          onSaved(savedEmployee, mode);
          setSavedEmployeeForFaceRetry(savedEmployee);
          setSavedModeForFaceRetry(mode);
          setError(
            `Employee profile was saved, but face enrollment failed: ${getErrorMessage(enrollError)}. Keep this window open, fix the issue, then retry face enrollment.`,
          );
          return;
        }
      }

      onSaved(savedEmployee, mode, message);
      onOpenChange(false);
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSubmitting(false);
      setSubmitStep("idle");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit employee" : "Add employee"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update this employee profile."
              : "Create an employee profile before enrolling their face."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="employee-name">Full Name</Label>
            <Input
              id="employee-name"
              value={name}
              disabled={isProfileLocked}
              onChange={(event) => setName(event.target.value)}
              placeholder="Employee full name"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="employee-email">Email</Label>
            <Input
              id="employee-email"
              type="email"
              value={email}
              disabled={isProfileLocked}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="employee@example.com"
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="employee-phone">Phone</Label>
              <Input
                id="employee-phone"
                value={phone}
                disabled={isProfileLocked}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+1 555 0100"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="employee-branch">Branch ID (optional)</Label>
              <Input
                id="employee-branch"
                inputMode="numeric"
                value={branch}
                disabled={isProfileLocked}
                onChange={(event) => setBranch(event.target.value)}
                placeholder="Leave blank for Main Branch"
              />
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="employee-designation">Designation</Label>
              <Input
                id="employee-designation"
                value={designation}
                disabled={isProfileLocked}
                onChange={(event) => setDesignation(event.target.value)}
                placeholder="HR Manager"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="employee-department">Department</Label>
              <Input
                id="employee-department"
                value={department}
                disabled={isProfileLocked}
                onChange={(event) => setDepartment(event.target.value)}
                placeholder="Human Resources"
              />
            </div>
          </div>

          {shouldShowInlineFaceEnrollment ? (
            <div className="grid gap-3 rounded-lg border bg-muted/30 p-3">
              <div>
                <Label>Face enrollment (optional)</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Upload a clear front-facing photo now, or enroll later from
                  the employee table.
                </p>
                {isProfileLocked ? (
                  <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    The employee profile is already saved. This retry will only
                    enroll the selected face photo.
                  </p>
                ) : null}
              </div>
              {faceImage ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt="Selected face enrollment preview"
                    src={faceImage}
                    className="size-16 rounded-lg border object-cover"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() => setFaceImage(null)}
                  >
                    Remove photo
                  </Button>
                </div>
              ) : null}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => void handleFaceImageUpload(event)}
              />
              <div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {faceImage ? "Change photo" : "Upload face photo"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
              Face is already enrolled. Use Update Face from the employee row
              if the stored photo needs to be replaced.
            </div>
          )}

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
              onClick={handleSubmit}
            >
              {getSubmitButtonLabel()}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
