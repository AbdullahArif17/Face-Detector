"use client";

import { useEffect, useState } from "react";

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
import {
  createUser,
  getCompanies,
  type Company,
  type PortalUser,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/errors";
import { isSuperAdminRole } from "@/lib/permissions";

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
  const [companyId, setCompanyId] = useState(
    currentUser?.company_id ? String(currentUser.company_id) : "",
  );
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSuperAdmin = isSuperAdminRole(currentUser?.role);

  useEffect(() => {
    if (!open || !isSuperAdmin) {
      return;
    }

    let isCancelled = false;

    void Promise.resolve().then(async () => {
      try {
        const records = await getCompanies();
        if (isCancelled) {
          return;
        }
        setCompanies(records);
        if (records.length > 0) {
          setCompanyId((currentCompanyId) =>
            currentCompanyId || String(records[0].id),
          );
        }
      } catch (companiesError) {
        if (!isCancelled) {
          setError(getErrorMessage(companiesError));
        }
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [isSuperAdmin, open]);

  async function handleSubmit(): Promise<void> {
    if (isSubmitting) {
      return;
    }
    if (!name.trim() || !email.trim() || password.length < 8) {
      setError("Name, email, and a password of at least 8 characters are required.");
      return;
    }

    let parsedCompanyId: number | undefined;
    if (isSuperAdmin) {
      parsedCompanyId = Number.parseInt(companyId.trim(), 10);
      if (!Number.isInteger(parsedCompanyId) || parsedCompanyId <= 0) {
        setError("Super admins must provide a valid numeric company ID.");
        return;
      }
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const createdUser = await createUser({
        name: name.trim(),
        email: email.trim(),
        password,
        role,
        ...(parsedCompanyId ? { company_id: parsedCompanyId } : {}),
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
            Create a portal user for this organization.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="user-name">Full Name</Label>
            <Input
              id="user-name"
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
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
            />
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
          {isSuperAdmin ? (
            <div className="grid gap-2">
              <Label htmlFor="user-company">Organization</Label>
              {companies.length > 0 ? (
                <select
                  id="user-company"
                  value={companyId}
                  onChange={(event) => setCompanyId(event.target.value)}
                  className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name} (ID {company.id})
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id="user-company"
                  inputMode="numeric"
                  value={companyId}
                  onChange={(event) => setCompanyId(event.target.value)}
                  placeholder="Company ID"
                />
              )}
            </div>
          ) : null}

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
              {isSubmitting ? "Creating..." : "Add User"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
