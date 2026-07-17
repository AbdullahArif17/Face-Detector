"use client";

import { ShieldCheck } from "lucide-react";
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
import { useAuth } from "@/context/AuthContext";
import { createUser, type PortalUser } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/errors";

interface AddUserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (user: PortalUser) => void;
}

const userRoles = [
  { value: "admin", label: "Admin" },
  { value: "hr", label: "HR" },
  { value: "branch_manager", label: "Branch Manager" },
  { value: "viewer", label: "Viewer" },
] as const;

function getErrorMessage(error: unknown): string {
  return getApiErrorMessage(
    error,
    "Unable to create user. Check the details and try again.",
  );
}

export function AddUserModal({
  open,
  onOpenChange,
  onCreated,
}: AddUserModalProps) {
  const { user: currentUser } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<(typeof userRoles)[number]["value"]>("hr");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(): Promise<void> {
    if (isSubmitting) {
      return;
    }
    if (!name.trim() || !email.trim() || password.length < 8) {
      setError("Name, email, and a password of at least 8 characters are required.");
      return;
    }
    if (!currentUser) {
      setError("Your session could not be verified. Sign in again and retry.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const createdUser = await createUser({
        name: name.trim(),
        email: email.trim(),
        password,
        role,
      });
      onCreated(createdUser);
      onOpenChange(false);
    } catch (createError) {
      setError(getErrorMessage(createError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add user</DialogTitle>
          <DialogDescription>
            Create a portal user in the organization you are currently signed into.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="user-name">Full Name</Label>
            <Input
              id="user-name"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Jane Doe"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="user-email">Email</Label>
            <Input
              id="user-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="jane@example.com"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="user-password">Password</Label>
            <Input
              id="user-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
            />
            <p className="text-xs text-muted-foreground">
              Use at least 8 characters, avoid reused credentials, and share the
              password through a secure channel.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="user-role">Role</Label>
            <select
              id="user-role"
              value={role}
              onChange={(event) =>
                setRole(event.target.value as (typeof userRoles)[number]["value"])
              }
              className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {userRoles.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-start gap-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-medium">Organization locked</p>
              <p className="mt-1 text-pretty text-blue-700">
                This account can only be created in your current organization.
                Organization access cannot be selected or overridden here.
              </p>
            </div>
          </div>

          {error ? (
            <p
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              role="alert"
            >
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
              {isSubmitting ? "Creating..." : "Add User"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
