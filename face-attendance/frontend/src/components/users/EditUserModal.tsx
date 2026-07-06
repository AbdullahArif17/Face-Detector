"use client";

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
import { updateUser, type PortalUser } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/errors";

interface EditUserModalProps {
  open: boolean;
  user: PortalUser;
  onOpenChange: (open: boolean) => void;
  onUpdated: (user: PortalUser) => void;
}

const roleOptions = [
  { value: "admin", label: "Admin" },
  { value: "hr", label: "HR" },
  { value: "branch_manager", label: "Branch Manager" },
  { value: "viewer", label: "Viewer" },
] as const;

function getErrorMessage(error: unknown): string {
  return getApiErrorMessage(error, "Unable to update user role. Try again.");
}

export function EditUserModal({
  open,
  user,
  onOpenChange,
  onUpdated,
}: EditUserModalProps) {
  const { user: currentUser } = useAuth();
  const [role, setRole] = useState(user.role);
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOwnUser = currentUser?.id === user.id;

  async function handleSubmit(): Promise<void> {
    if (isOwnUser || isSubmitting) {
      return;
    }
    if (password && password.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const updatedUser = await updateUser(user.id, {
        role,
        ...(password ? { password } : {}),
      });
      onUpdated(updatedUser);
      onOpenChange(false);
    } catch (updateError) {
      setError(getErrorMessage(updateError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>
            Change portal access or reset the password for {user.name}.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <p className="font-medium">{user.name}</p>
            <p className="text-muted-foreground">{user.email}</p>
          </div>

          {isOwnUser ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              You cannot edit your own role.
            </p>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="edit-user-role">Role</Label>
              <select
                id="edit-user-role"
                value={role}
                onChange={(event) => setRole(event.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {roleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="edit-user-password">New password</Label>
            <Input
              id="edit-user-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Leave blank to keep current password"
              disabled={isOwnUser}
            />
            <p className="text-xs text-muted-foreground">
              Set this only when the user cannot sign in or needs a password reset.
            </p>
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
              disabled={isOwnUser || isSubmitting}
              onClick={handleSubmit}
            >
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
