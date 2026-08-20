"use client";

import { Edit, Search, Trash2, UserCheck, UserPlus, UserX } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError } from "@/components/api-error";
import { ConfirmDialog } from "@/components/confirm-dialog";
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
  getUsers,
  permanentlyDeleteUser,
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
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide",
        role === "admin" || role === "super_admin"
          ? "bg-red-50 text-red-700 ring-1 ring-red-600/10"
          : role === "hr"
            ? "bg-blue-50 text-blue-700 ring-1 ring-blue-600/10"
            : role === "branch_manager"
              ? "bg-yellow-50 text-yellow-700 ring-1 ring-yellow-600/10"
              : "bg-slate-50 text-slate-500 ring-1 ring-slate-500/10",
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
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide",
        isActive
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/10"
          : "bg-slate-50 text-slate-500 ring-1 ring-slate-500/10",
      )}
    >
      <span className={cn("size-1.5 rounded-full", isActive ? "bg-emerald-500" : "bg-slate-400")} />
      {isActive ? "Active" : "Inactive"}
    </span>
  );
}

function UserActions({
  user,
  isOwnUser,
  isProtected,
  isBusy,
  className,
  onEdit,
  onDeactivate,
  onActivate,
  onRemove,
}: Readonly<{
  user: PortalUser;
  isOwnUser: boolean;
  isProtected: boolean;
  isBusy: boolean;
  className?: string;
  onEdit: () => void;
  onDeactivate: () => void;
  onActivate: () => void;
  onRemove: () => void;
}>) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="gap-1"
        disabled={isOwnUser || isProtected || isBusy}
        onClick={onEdit}
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
          disabled={isOwnUser || isProtected || isBusy}
          onClick={onDeactivate}
        >
          <UserX aria-hidden="true" className="size-3" />
          {isBusy ? "Updating..." : "Deactivate"}
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="gap-1 text-green-700 hover:text-green-800"
          disabled={isProtected || isBusy}
          onClick={onActivate}
        >
          <UserCheck aria-hidden="true" className="size-3" />
          {isBusy ? "Updating..." : "Activate"}
        </Button>
      )}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="gap-1 text-red-700 hover:text-red-800"
        disabled={isOwnUser || isProtected || isBusy}
        onClick={onRemove}
      >
        <Trash2 aria-hidden="true" className="size-3" />
        Remove permanently
      </Button>
    </div>
  );
}

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<PortalUser | null>(null);
  const [pendingPermanentDelete, setPendingPermanentDelete] =
    useState<PortalUser | null>(null);
  const [statusChangingUserId, setStatusChangingUserId] = useState<number | null>(
    null,
  );
  const hasUserManagementAccess = canManageUsers(currentUser);
  const isSuperAdmin = isSuperAdminRole(currentUser?.role);
  const tableColumnCount = 6;

  const loadUsers = useCallback(async (): Promise<void> => {
    if (!hasUserManagementAccess) {
      return;
    }

    setIsLoading(true);
    try {
      const records = await getUsers();
      setUsers(records);
      setHasError(false);
    } catch {
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, [hasUserManagementAccess]);

  useEffect(() => {
    void Promise.resolve().then(loadUsers);
  }, [loadUsers]);

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
      return (
        user.name.toLowerCase().includes(normalizedSearch) ||
        user.email.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [searchTerm, users]);

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

  async function handlePermanentDelete(): Promise<void> {
    const user = pendingPermanentDelete;
    if (!user || statusChangingUserId !== null || currentUser?.id === user.id) {
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
      setPendingPermanentDelete(null);
    } catch (deleteError) {
      setActionError(
        getApiErrorMessage(
          deleteError,
          "Unable to permanently remove user. Deactivate the user if historical records exist.",
        ),
      );
    } finally {
      setStatusChangingUserId(null);
      setPendingPermanentDelete(null);
    }
  }

  if (!hasUserManagementAccess) {
    return (
      <section className="animate-page-enter space-y-4">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          <span className="text-gradient">Users</span>
        </h1>
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 shadow-sm">
          You do not have permission to manage portal users.
        </p>
      </section>
    );
  }

  return (
    <section className="animate-page-enter space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            <span className="text-gradient">Users</span>
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground text-pretty">
            Manage users who can access this organization portal.
          </p>
        </div>
        <Button
          type="button"
          className="w-full gap-2 shadow-md sm:w-auto"
          onClick={() => setIsAddModalOpen(true)}
        >
          <UserPlus aria-hidden="true" className="size-4" />
          Add User
        </Button>
      </div>

      <div className="relative rounded-xl border bg-card p-4 shadow-card">
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
        <p
          className="animate-fade-in rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-700 shadow-sm"
          role="status"
          aria-live="polite"
        >
          ✓ {toastMessage}
        </p>
      ) : null}

      {hasError ? (
        <ApiError onRetry={() => void loadUsers()} isRetrying={isLoading} />
      ) : null}

      {actionError ? (
        <p
          className="animate-fade-in rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700 shadow-sm"
          role="alert"
        >
          {actionError}
        </p>
      ) : null}

      <div className="grid gap-3 md:hidden">
        {isLoading ? (
          <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground shadow-card">
            Loading users...
          </div>
        ) : null}
        {!isLoading && filteredUsers.length === 0 ? (
          <div className="rounded-xl border bg-card p-8 text-center shadow-card">
            <p className="font-medium">
              {searchTerm.trim() ? "No matching users" : "No portal users yet"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {searchTerm.trim()
                ? "Try searching by a different name or email."
                : "Add a user to share access to this organization."}
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-4"
              onClick={() => {
                if (searchTerm.trim()) {
                  setSearchTerm("");
                } else {
                  setIsAddModalOpen(true);
                }
              }}
            >
              {searchTerm.trim() ? "Clear search" : "Add User"}
            </Button>
          </div>
        ) : null}
        {filteredUsers.map((user) => {
          const isOwnUser = currentUser?.id === user.id;
          const isProtected = !isSuperAdmin && isSuperAdminRole(user.role);
          return (
            <article className="card-hover rounded-xl border bg-card p-4 shadow-card" key={user.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{user.name}</p>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {user.email}
                  </p>
                </div>
                <StatusBadge isActive={user.is_active} />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Role</dt>
                  <dd className="mt-1"><RoleBadge role={user.role} /></dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Created</dt>
                  <dd className="mt-1 tabular-nums">
                    {dateFormatter.format(new Date(user.created_at))}
                  </dd>
                </div>
              </dl>
              <UserActions
                user={user}
                isOwnUser={isOwnUser}
                isProtected={isProtected}
                isBusy={statusChangingUserId === user.id}
                className="mt-4 grid grid-cols-2"
                onEdit={() => setEditingUser(user)}
                onDeactivate={() => void handleDeactivate(user)}
                onActivate={() => void handleActivate(user)}
                onRemove={() => {
                  setActionError(null);
                  setPendingPermanentDelete(user);
                }}
              />
              {isOwnUser || isProtected ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  {isOwnUser
                    ? "You cannot change or remove the account you are signed in with."
                    : "Only a super administrator can manage this account."}
                </p>
              ) : null}
            </article>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border bg-card shadow-card md:block">
        <table
          className="min-w-[980px] w-full text-left text-sm"
        >
          <thead className="border-b bg-muted/30">
            <tr>
              <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
              <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email</th>
              <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Role</th>
              <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
              <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Created At</th>
              <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
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
                  className="px-4 py-12 text-center text-muted-foreground"
                  colSpan={tableColumnCount}
                >
                  No users found.
                </td>
              </tr>
            ) : null}

            {filteredUsers.map((user) => {
              const isOwnUser = currentUser?.id === user.id;
              const isProtected = !isSuperAdmin && isSuperAdminRole(user.role);
              return (
                <tr className="transition-colors hover:bg-muted/30" key={user.id}>
                  <td className="px-4 py-3.5 font-medium">{user.name}</td>
                  <td className="px-4 py-3.5 text-muted-foreground">
                    {user.email}
                  </td>
                  <td className="px-4 py-3.5">
                    <RoleBadge role={user.role} />
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadge isActive={user.is_active} />
                  </td>
                  <td className="px-4 py-3.5 tabular-nums text-muted-foreground">
                    {dateFormatter.format(new Date(user.created_at))}
                  </td>
                  <td className="px-4 py-3.5">
                    <UserActions
                      user={user}
                      isOwnUser={isOwnUser}
                      isProtected={isProtected}
                      isBusy={statusChangingUserId === user.id}
                      onEdit={() => setEditingUser(user)}
                      onDeactivate={() => void handleDeactivate(user)}
                      onActivate={() => void handleActivate(user)}
                      onRemove={() => {
                        setActionError(null);
                        setPendingPermanentDelete(user);
                      }}
                    />
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

      <ConfirmDialog
        open={pendingPermanentDelete !== null}
        title="Permanently remove this user?"
        description={
          pendingPermanentDelete
            ? `${pendingPermanentDelete.name}'s portal account will be deleted and cannot be restored. If you only want to block access, cancel and deactivate the user instead.`
            : "This portal account will be permanently deleted."
        }
        confirmLabel="Remove permanently"
        busyLabel="Removing..."
        destructive
        isConfirming={
          pendingPermanentDelete !== null &&
          statusChangingUserId === pendingPermanentDelete.id
        }
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setPendingPermanentDelete(null);
          }
        }}
        onConfirm={() => void handlePermanentDelete()}
      />
    </section>
  );
}
