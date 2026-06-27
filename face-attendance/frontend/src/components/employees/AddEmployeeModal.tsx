"use client";

import axios from "axios";
import { useState } from "react";

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
  type Employee,
  type EmployeeInput,
  updateEmployee,
} from "@/lib/api";

interface AddEmployeeModalProps {
  open: boolean;
  employee: Employee | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (employee: Employee, mode: "created" | "updated") => void;
}

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") {
      return detail;
    }
  }
  return "Unable to save employee. Check the details and try again.";
}

function optionalValue(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function AddEmployeeModal({
  open,
  employee,
  onOpenChange,
  onSaved,
}: AddEmployeeModalProps) {
  const [name, setName] = useState(employee?.name ?? "");
  const [email, setEmail] = useState(employee?.email ?? "");
  const [phone, setPhone] = useState(employee?.phone ?? "");
  const [designation, setDesignation] = useState(employee?.designation ?? "");
  const [department, setDepartment] = useState(employee?.department ?? "");
  const [branch, setBranch] = useState(
    employee?.branch_id ? String(employee.branch_id) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEditing = employee !== null;

  async function handleSubmit(): Promise<void> {
    if (isSubmitting) {
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
    setError(null);

    try {
      const savedEmployee =
        employee === null
          ? await createEmployee(payload)
          : await updateEmployee(employee.id, payload);
      onSaved(savedEmployee, employee === null ? "created" : "updated");
      onOpenChange(false);
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSubmitting(false);
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
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+1 555 0100"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="employee-branch">Branch</Label>
              <Input
                id="employee-branch"
                inputMode="numeric"
                value={branch}
                onChange={(event) => setBranch(event.target.value)}
                placeholder="Optional branch ID"
              />
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="employee-designation">Designation</Label>
              <Input
                id="employee-designation"
                value={designation}
                onChange={(event) => setDesignation(event.target.value)}
                placeholder="HR Manager"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="employee-department">Department</Label>
              <Input
                id="employee-department"
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
                placeholder="Human Resources"
              />
            </div>
          </div>

          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={isSubmitting} onClick={handleSubmit}>
              {isSubmitting
                ? "Saving..."
                : isEditing
                  ? "Save changes"
                  : "Add employee"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
