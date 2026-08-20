"use client";

import { Edit, Search, ShieldCheck, ShieldX, Trash2, UserPlus, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ApiError } from "@/components/api-error";
import { AddEmployeeModal } from "@/components/employees/AddEmployeeModal";
import { EmployeeAvatar } from "@/components/employees/EmployeeAvatar";
import { FaceEnrollModal } from "@/components/employees/FaceEnrollModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  deleteEmployee,
  getAllEmployees,
  type Employee,
} from "@/lib/api";

interface EmployeeDirectoryProps {
  variant: "teachers" | "staff";
}

type FaceFilter = "all" | "enrolled" | "not_enrolled";

const COPY = {
  teachers: {
    title: "Teachers",
    description:
      "Manage teacher records and face enrollment status. Teachers check in and out at the kiosk like students, and alerts go to the school number in Settings.",
    addLabel: "Add Teacher",
  },
  staff: {
    title: "Staff",
    description:
      "Manage staff records and face enrollment status. Staff check in and out at the kiosk like students, and alerts go to the school number in Settings.",
    addLabel: "Add Staff Member",
  },
} as const;

function StatusBadge({ status }: Readonly<{ status: string }>) {
  const isActive = status.toLowerCase() === "active";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold capitalize tracking-wide",
        isActive
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/10"
          : "bg-slate-50 text-slate-500 ring-1 ring-slate-500/10",
      )}
    >
      <span className={cn("size-1.5 rounded-full", isActive ? "bg-emerald-500" : "bg-slate-400")} />
      {status}
    </span>
  );
}

function FaceBadge({
  hasFaceEnrolled,
}: Readonly<{ hasFaceEnrolled: boolean }>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide",
        hasFaceEnrolled
          ? "bg-blue-50 text-blue-700 ring-1 ring-blue-600/10"
          : "bg-amber-50 text-amber-700 ring-1 ring-amber-600/10",
      )}
    >
      {hasFaceEnrolled ? (
        <ShieldCheck aria-hidden="true" className="size-3.5" />
      ) : (
        <ShieldX aria-hidden="true" className="size-3.5" />
      )}
      {hasFaceEnrolled ? "Enrolled" : "Not Enrolled"}
    </span>
  );
}

// ponytail: freeform designation grouping; switch to enum/badge options
// if schools want strict teacher/staff bucketing
function isTeacher(designation: string | null): boolean {
  return Boolean(designation && designation.toLowerCase().includes("teacher"));
}

export function EmployeeDirectory({
  variant,
}: Readonly<EmployeeDirectoryProps>) {
  const copy = COPY[variant];
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [faceFilter, setFaceFilter] = useState<FaceFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [enrollingEmployee, setEnrollingEmployee] = useState<Employee | null>(null);
  const [deletingEmployeeId, setDeletingEmployeeId] = useState<number | null>(null);

  useEffect(() => {
    let isCancelled = false;

    void getAllEmployees(
      variant === "teachers" ? { designation: "teacher" } : {},
    )
      .then((records) => {
        if (!isCancelled) {
          setEmployees(
            variant === "teachers"
              ? records
              : records.filter((record) => !isTeacher(record.designation)),
          );
          setHasError(false);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setHasError(true);
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [variant]);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timeout = window.setTimeout(() => setToastMessage(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  const filteredEmployees = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return employees.filter((employee) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        employee.name.toLowerCase().includes(normalizedSearch);
      const matchesFaceFilter =
        faceFilter === "all" ||
        (faceFilter === "enrolled" && employee.has_face_enrolled) ||
        (faceFilter === "not_enrolled" && !employee.has_face_enrolled);

      return matchesSearch && matchesFaceFilter;
    });
  }, [employees, faceFilter, searchTerm]);

  function handleSavedEmployee(
    savedEmployee: Employee,
    mode: "created" | "updated",
    message?: string,
  ): void {
    setEmployees((currentEmployees) => {
      const exists = currentEmployees.some(
        (employee) => employee.id === savedEmployee.id,
      );
      if (!exists) {
        return [...currentEmployees, savedEmployee].sort((first, second) =>
          first.id - second.id,
        );
      }
      return currentEmployees.map((employee) =>
        employee.id === savedEmployee.id ? savedEmployee : employee,
      );
    });
    setEditingEmployee(null);
    setToastMessage(
      message ??
        (mode === "created"
          ? variant === "teachers"
            ? "Teacher added"
            : "Staff member added"
          : "Profile updated"),
    );
  }

  async function handleDeleteEmployee(employee: Employee): Promise<void> {
    if (deletingEmployeeId !== null) {
      return;
    }

    setDeletingEmployeeId(employee.id);
    setHasError(false);

    try {
      await deleteEmployee(employee.id);
      setEmployees((currentEmployees) =>
        currentEmployees.filter((currentEmployee) => currentEmployee.id !== employee.id)
      );
      setToastMessage("Permanently removed");
    } catch {
      setHasError(true);
    } finally {
      setDeletingEmployeeId(null);
    }
  }

  function handleFaceEnrolled(employeeId: number, headshotUrl: string): void {
    const wasAlreadyEnrolled =
      employees.find((employee) => employee.id === employeeId)
        ?.has_face_enrolled === true;

    setEmployees((currentEmployees) =>
      currentEmployees.map((employee) =>
        employee.id === employeeId
          ? {
              ...employee,
              has_face_enrolled: true,
              headshot_url: headshotUrl,
            }
          : employee,
      ),
    );
    setToastMessage(
      wasAlreadyEnrolled
        ? "Face updated successfully"
        : "Face enrolled successfully",
    );
  }

  return (
    <section className="animate-page-enter space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            <span className="text-gradient">{copy.title}</span>
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground text-pretty">
            {copy.description}
          </p>
        </div>
        <Button
          type="button"
          className="w-full gap-2 shadow-md sm:w-auto"
          onClick={() => {
            setEditingEmployee(null);
            setIsAddModalOpen(true);
          }}
        >
          <UserPlus aria-hidden="true" className="size-4" />
          {copy.addLabel}
        </Button>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-card md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search
            aria-hidden="true"
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label={`Search ${copy.title.toLowerCase()} by name`}
            className="pl-9"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search by name"
          />
        </div>
        <select
          aria-label="Filter by face enrollment"
          value={faceFilter}
          onChange={(event) => setFaceFilter(event.target.value as FaceFilter)}
          className="h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring md:w-auto"
        >
          <option value="all">All</option>
          <option value="enrolled">Enrolled</option>
          <option value="not_enrolled">Not Enrolled</option>
        </select>
      </div>

      {toastMessage ? (
        <p className="animate-fade-in rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-700 shadow-sm">
          ✓ {toastMessage}
        </p>
      ) : null}

      {hasError ? <ApiError /> : null}

      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-xl border bg-card shadow-card md:block">
        <table className="min-w-[960px] w-full text-left text-sm">
          <thead className="border-b bg-muted/30">
            <tr>
              <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
              <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email</th>
              <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Phone</th>
              <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Designation</th>
              <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Department</th>
              <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
              <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Face</th>
              <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <tr key={`skeleton-${index}`}>
                  {Array.from({ length: 8 }).map((_, colIndex) => (
                    <td key={colIndex} className="px-4 py-4">
                      <div className="skeleton h-4 w-20 rounded" />
                    </td>
                  ))}
                </tr>
              ))
            ) : null}

            {!isLoading && filteredEmployees.length === 0 ? (
              <tr>
                <td className="px-4 py-12 text-center" colSpan={8}>
                  <div className="mx-auto flex max-w-sm flex-col items-center">
                    <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                      <Users aria-hidden="true" className="size-6 text-muted-foreground" />
                    </div>
                    <p className="mt-3 font-semibold">No {copy.title.toLowerCase()} found</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Try adjusting your search or add a new {variant === "teachers" ? "teacher" : "staff member"}.
                    </p>
                  </div>
                </td>
              </tr>
            ) : null}

            {filteredEmployees.map((employee) => (
              <tr className="transition-colors hover:bg-muted/30" key={employee.id}>
                <td className="px-4 py-3.5 font-medium">
                  <div className="flex items-center gap-3">
                    <EmployeeAvatar employee={employee} />
                    <span>{employee.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3.5 text-muted-foreground">
                  {employee.email}
                </td>
                <td className="px-4 py-3.5 tabular-nums text-muted-foreground">
                  {employee.phone ?? "—"}
                </td>
                <td className="px-4 py-3.5">
                  {employee.designation ?? <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-3.5">
                  {employee.department ?? <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-3.5">
                  <StatusBadge status={employee.status} />
                </td>
                <td className="px-4 py-3.5">
                  <FaceBadge hasFaceEnrolled={employee.has_face_enrolled} />
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1 shadow-sm"
                      onClick={() => setEditingEmployee(employee)}
                    >
                      <Edit aria-hidden="true" className="size-3" />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="shadow-sm"
                      onClick={() => setEnrollingEmployee(employee)}
                    >
                      {employee.has_face_enrolled ? "Update Face" : "Enroll Face"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="gap-1 text-destructive hover:text-destructive"
                      disabled={deletingEmployeeId === employee.id}
                      onClick={() => void handleDeleteEmployee(employee)}
                    >
                      <Trash2 aria-hidden="true" className="size-3" />
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="grid gap-3 md:hidden">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, index) => (
            <div key={`skeleton-mobile-${index}`} className="rounded-xl border bg-card p-4 shadow-card">
              <div className="flex items-center gap-3">
                <div className="skeleton size-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-32 rounded" />
                  <div className="skeleton h-3 w-24 rounded" />
                </div>
              </div>
            </div>
          ))
        ) : null}
        {!isLoading && filteredEmployees.length === 0 ? (
          <div className="rounded-xl border bg-card p-8 text-center shadow-card">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
              <Users aria-hidden="true" className="size-6 text-muted-foreground" />
            </div>
            <p className="mt-3 font-semibold">No {copy.title.toLowerCase()} found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add your first {variant === "teachers" ? "teacher" : "staff member"} to get started.
            </p>
          </div>
        ) : null}
        {filteredEmployees.map((employee) => (
          <article className="card-hover rounded-xl border bg-card p-4 shadow-card" key={employee.id}>
            <div className="flex items-start gap-3">
              <EmployeeAvatar employee={employee} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{employee.name}</p>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  {employee.designation ?? employee.department ?? employee.email}
                </p>
              </div>
              <StatusBadge status={employee.status} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <FaceBadge hasFaceEnrolled={employee.has_face_enrolled} />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Button type="button" size="sm" variant="outline" className="gap-1 shadow-sm" onClick={() => setEditingEmployee(employee)}>
                <Edit aria-hidden="true" className="size-3" /> Edit
              </Button>
              <Button type="button" size="sm" variant="outline" className="shadow-sm" onClick={() => setEnrollingEmployee(employee)}>
                {employee.has_face_enrolled ? "Update Face" : "Enroll Face"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="gap-1 text-destructive hover:text-destructive"
                disabled={deletingEmployeeId === employee.id}
                onClick={() => void handleDeleteEmployee(employee)}
              >
                <Trash2 aria-hidden="true" className="size-3" /> Delete
              </Button>
            </div>
          </article>
        ))}
      </div>

      {isAddModalOpen || editingEmployee !== null ? (
        <AddEmployeeModal
          key={editingEmployee?.id ?? "new-employee"}
          open
          employee={editingEmployee}
          variant={variant}
          onOpenChange={(open) => {
            setIsAddModalOpen(open);
            if (!open) {
              setEditingEmployee(null);
            }
          }}
          onSaved={handleSavedEmployee}
        />
      ) : null}

      {enrollingEmployee !== null ? (
        <FaceEnrollModal
          key={enrollingEmployee.id}
          open
          employee={enrollingEmployee}
          onOpenChange={(open) => {
            if (!open) {
              setEnrollingEmployee(null);
            }
          }}
          onEnrolled={handleFaceEnrolled}
        />
      ) : null}
    </section>
  );
}