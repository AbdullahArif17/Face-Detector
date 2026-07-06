"use client";

import { Edit, Search, Trash2, UserCheck, UserPlus, UserX } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ApiError } from "@/components/api-error";
import { AddUserModal } from "@/components/users/AddUserModal";
import { EditUserModal } from "@/components/users/EditUserModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { canManageUsers, isSuperAdminRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import {
  activateUser,
  deactivateUser,
  getCompanies,
  getUsers,
  permanentlyDeleteUser,
  type Company,
  type PortalUser,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/errors";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
});

const roleLabels: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  hr: "HR",
  branch_manager: "Branch Manager",
  viewer: "Viewer",
};

function RoleBadge({ role }: Readonly<{ role: string }>) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-1 text-xs font-medium",
        role === "admin" || role === "super_admin"
          ? "bg-red-50 text-red-700"
          : role === "hr"
            ? "bg-blue-50 text-blue-700"
            : role === "branch_manager"
              ? "bg-yellow-50 text-yellow-700"
              : "bg-slate-100 text-slate-600",
      )}
    >
      {roleLabels[role] ?? role}
    </span>
  );
}

function StatusBadge({ isActive }: Readonly<{ isActive: boolean }>) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-1 text-xs font-medium",
        isActive
          ? "bg-green-50 text-green-700"
          : "bg-slate-100 text-slate-600",
      )}
    >
      {isActive ? "Active" : "Inactive"}
    </span>
  );
}

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [companyNamesById, setCompanyNamesById] = useState<Record<number, string>>(
    {},
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<PortalUser | null>(null);
  const [statusChangingUserId, setStatusChangingUserId] = useState<number | null>(
    null,
  );
  const hasUserManagementAccess = canManageUsers(currentUser);
  const isSuperAdmin = isSuperAdminRole(currentUser?.role);
  const tableColumnCount = isSuperAdmin ? 7 : 6;

  useEffect(() => {
    if (!hasUserManagementAccess) {
      return;
    }

    let isCancelled = false;

    void Promise.resolve().then(async () => {
      if (!isCancelled) {
        setIsLoading(true);
      }

      try {
        const records = await getUsers();
        let companies: Company[] = [];
        if (isSuperAdmin) {
          companies = await getCompanies();
        }
        if (!isCancelled) {
          setUsers(records);
          setCompanyNamesById(
            Object.fromEntries(
              companies.map((company) => [company.id, company.name]),
            ),
          );
          setHasError(false);
        }
      } catch {
        if (!isCancelled) {
          setHasError(true);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [hasUserManagementAccess, isSuperAdmin]);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }
    const timeout = window.setTimeout(() => setToastMessage(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  const filteredUsers = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch) {
      return users;
    }
    return users.filter((user) => {
      const companyName = companyNamesById[user.company_id]?.toLowerCase() ?? "";
      return (
        user.name.toLowerCase().includes(normalizedSearch) ||
        user.email.toLowerCase().includes(normalizedSearch) ||
        companyName.includes(normalizedSearch)
      );
    });
  }, [companyNamesById, searchTerm, users]);

  function handleCreated(user: PortalUser): void {
    setUsers((currentUsers) => {
      const userAlreadyExists = currentUsers.some(
        (currentUserRecord) => currentUserRecord.id === user.id,
      );
      if (userAlreadyExists) {
        return currentUsers.map((currentUserRecord) =>
          currentUserRecord.id === user.id ? user : currentUserRecord,
        );
      }
      return [...currentUsers, user].sort((a, b) => a.id - b.id);
    });
    setActionError(null);
    setToastMessage("User created or reactivated");
  }

  function handleUpdated(user: PortalUser): void {
    setUsers((currentUsers) =>
      currentUsers.map((currentUserRecord) =>
        currentUserRecord.id === user.id ? user : currentUserRecord,
      ),
    );
    setEditingUser(null);
    setActionError(null);
    setToastMessage("User updated");
  }

  async function handleDeactivate(user: PortalUser): Promise<void> {
    if (statusChangingUserId !== null || currentUser?.id === user.id) {
      return;
    }

    setStatusChangingUserId(user.id);
    setHasError(false);
    setActionError(null);
    try {
      await deactivateUser(user.id);
      setUsers((currentUsers) =>
        currentUsers.map((currentUserRecord) =>
          currentUserRecord.id === user.id
            ? { ...currentUserRecord, is_active: false }
            : currentUserRecord,
        ),
      );
      setToastMessage("User deactivated");
    } catch (deactivateError) {
      setActionError(
        getApiErrorMessage(deactivateError, "Unable to deactivate user."),
      );
    } finally {
      setStatusChangingUserId(null);
    }
  }

  async function handleActivate(user: PortalUser): Promise<void> {
    if (statusChangingUserId !== null) {
      return;
    }

    setStatusChangingUserId(user.id);
    setHasError(false);
    setActionError(null);
    try {
      const activatedUser = await activateUser(user.id);
      setUsers((currentUsers) =>
        currentUsers.map((currentUserRecord) =>
          currentUserRecord.id === activatedUser.id
            ? activatedUser
            : currentUserRecord,
        ),
      );
      setToastMessage("User activated");
    } catch (activateError) {
      setActionError(getApiErrorMessage(activateError, "Unable to activate user."));
    } finally {
      setStatusChangingUserId(null);
    }
  }

  async function handlePermanentDelete(user: PortalUser): Promise<void> {
    if (statusChangingUserId !== null || currentUser?.id === user.id) {
      return;
    }

    const confirmed = window.confirm(
      `Permanently remove ${user.name}? This deletes the portal user account and cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }

    setStatusChangingUserId(user.id);
    setHasError(false);
    setActionError(null);
    try {
      await permanentlyDeleteUser(user.id);
      setUsers((currentUsers) =>
        currentUsers.filter((currentUserRecord) => currentUserRecord.id !== user.id),
      );
      setToastMessage("User permanently removed");
    } catch (deleteError) {
      setActionError(
        getApiErrorMessage(
          deleteError,
          "Unable to permanently remove user. Deactivate the user if historical records exist.",
        ),
      );
    } finally {
      setStatusChangingUserId(null);
    }
  }

  if (!hasUserManagementAccess) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-bold text-balance sm:text-3xl">Users</h1>
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          You do not have permission to manage portal users.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-balance sm:text-3xl">
            Users
          </h1>
          <p className="mt-2 text-muted-foreground text-pretty">
            Manage users who can access this organization portal.
          </p>
        </div>
        <Button
          type="button"
          className="w-full gap-2 sm:w-auto"
          onClick={() => setIsAddModalOpen(true)}
        >
          <UserPlus aria-hidden="true" className="size-4" />
          Add User
        </Button>
      </div>

      <div className="relative rounded-lg border bg-card p-4">
        <Search
          aria-hidden="true"
          className="absolute left-7 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-label="Search users by name or email"
          className="pl-9"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search users"
        />
      </div>

      {toastMessage ? (
        <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-medium text-green-700">
          {toastMessage}
        </p>
      ) : null}

      {hasError ? <ApiError /> : null}

      {actionError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
          {actionError}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table
          className={cn(
            "w-full text-left text-sm",
            isSuperAdmin ? "min-w-[1120px]" : "min-w-[980px]",
          )}
        >
          <thead className="border-b bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              {isSuperAdmin ? (
                <th className="px-4 py-3 font-medium">Organization</th>
              ) : null}
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Created At</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td
                  className="px-4 py-6 text-muted-foreground"
                  colSpan={tableColumnCount}
                >
                  Loading users...
                </td>
              </tr>
            ) : null}

            {!isLoading && filteredUsers.length === 0 ? (
              <tr>
                <td
                  className="px-4 py-6 text-muted-foreground"
                  colSpan={tableColumnCount}
                >
                  No users found.
                </td>
              </tr>
            ) : null}

            {filteredUsers.map((user) => {
              const isOwnUser = currentUser?.id === user.id;
              return (
                <tr className="border-b last:border-0" key={user.id}>
                  <td className="px-4 py-3 font-medium">{user.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {user.email}
                  </td>
                  {isSuperAdmin ? (
                    <td className="px-4 py-3 text-muted-foreground">
                      {companyNamesById[user.company_id] ??
                        `Company ${user.company_id}`}
                    </td>
                  ) : null}
                  <td className="px-4 py-3">
                    <RoleBadge role={user.role} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge isActive={user.is_active} />
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {dateFormatter.format(new Date(user.created_at))}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        disabled={isOwnUser}
                        onClick={() => setEditingUser(user)}
                      >
                        <Edit aria-hidden="true" className="size-3" />
                        Edit User
                      </Button>
                      {user.is_active ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="gap-1 text-red-600 hover:text-red-700"
                          disabled={
                            isOwnUser || statusChangingUserId === user.id
                          }
                          onClick={() => void handleDeactivate(user)}
                        >
                          <UserX aria-hidden="true" className="size-3" />
                          Deactivate
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="gap-1 text-green-700 hover:text-green-800"
                          disabled={statusChangingUserId === user.id}
                          onClick={() => void handleActivate(user)}
                        >
                          <UserCheck aria-hidden="true" className="size-3" />
                          Activate
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="gap-1 text-red-700 hover:text-red-800"
                        disabled={isOwnUser || statusChangingUserId === user.id}
                        onClick={() => void handlePermanentDelete(user)}
                      >
                        <Trash2 aria-hidden="true" className="size-3" />
                        Remove
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {isAddModalOpen ? (
        <AddUserModal
          open
          onOpenChange={setIsAddModalOpen}
          onCreated={handleCreated}
        />
      ) : null}

      {editingUser ? (
        <EditUserModal
          open
          user={editingUser}
          onOpenChange={(open) => {
            if (!open) {
              setEditingUser(null);
            }
          }}
          onUpdated={handleUpdated}
        />
      ) : null}
    </section>
  );
}
