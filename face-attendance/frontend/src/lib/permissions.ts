import type { User } from "@/lib/api";

const ADMIN_ROLES = new Set(["admin", "super_admin"]);
const ATTENDANCE_MANAGER_ROLES = new Set([
  "super_admin",
  "admin",
  "hr",
  "branch_manager",
]);

const ROLE_ALIASES: Record<string, string> = {
  company_admin: "admin",
  organization_admin: "admin",
  owner: "admin",
};

export function normalizeRole(role: string | null | undefined): string {
  const normalized = role?.trim().toLowerCase().replace(/[\s-]+/g, "_") ?? "";
  return ROLE_ALIASES[normalized] ?? normalized;
}

export function isSuperAdminRole(role: string | null | undefined): boolean {
  return normalizeRole(role) === "super_admin";
}

export function canManageUsers(user: User | null | undefined): boolean {
  return ADMIN_ROLES.has(normalizeRole(user?.role));
}

export function canManageKiosk(user: User | null | undefined): boolean {
  return canManageUsers(user);
}

export function canManageAttendanceSessions(
  user: User | null | undefined,
): boolean {
  return ATTENDANCE_MANAGER_ROLES.has(normalizeRole(user?.role));
}
