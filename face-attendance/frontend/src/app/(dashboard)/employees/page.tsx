"use client";

import { Edit, Search, ShieldCheck, ShieldX, Trash2, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ApiError } from "@/components/api-error";
import { AddEmployeeModal } from "@/components/employees/AddEmployeeModal";
import { FaceEnrollModal } from "@/components/employees/FaceEnrollModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  deleteEmployee,
  getEmployees,
  type Employee,
} from "@/lib/api";

type FaceFilter = "all" | "enrolled" | "not_enrolled";

function StatusBadge({ status }: Readonly<{ status: string }>) {
  const isActive = status.toLowerCase() === "active";
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-1 text-xs font-medium capitalize",
        isActive
          ? "bg-green-50 text-green-700"
          : "bg-slate-100 text-slate-600",
      )}
    >
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
        "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium",
        hasFaceEnrolled
          ? "bg-blue-50 text-blue-700"
          : "bg-amber-50 text-amber-700",
      )}
    >
      {hasFaceEnrolled ? (
        <ShieldCheck aria-hidden="true" className="size-3" />
      ) : (
        <ShieldX aria-hidden="true" className="size-3" />
      )}
      {hasFaceEnrolled ? "Enrolled ✓" : "Not Enrolled ✕"}
    </span>
  );
}

export default function EmployeesPage() {
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

    void getEmployees()
      .then((records) => {
        if (!isCancelled) {
          setEmployees(records);
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
  }, []);

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
      mode === "created" ? "Employee added" : "Employee updated",
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
        currentEmployees.map((currentEmployee) =>
          currentEmployee.id === employee.id
            ? { ...currentEmployee, status: "inactive" }
            : currentEmployee,
        ),
      );
      setToastMessage("Employee marked inactive");
    } catch {
      setHasError(true);
    } finally {
      setDeletingEmployeeId(null);
    }
  }

  function handleFaceEnrolled(employeeId: number): void {
    setEmployees((currentEmployees) =>
      currentEmployees.map((employee) =>
        employee.id === employeeId
          ? { ...employee, has_face_enrolled: true }
          : employee,
      ),
    );
    setToastMessage("Face enrolled successfully");
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-balance">Employees</h1>
          <p className="mt-2 text-muted-foreground text-pretty">
            Manage employee records and face enrollment status.
          </p>
        </div>
        <Button
          type="button"
          className="gap-2"
          onClick={() => {
            setEditingEmployee(null);
            setIsAddModalOpen(true);
          }}
        >
          <UserPlus aria-hidden="true" className="size-4" />
          Add Employee
        </Button>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search
            aria-hidden="true"
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Search employees by name"
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
          className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="all">All</option>
          <option value="enrolled">Enrolled</option>
          <option value="not_enrolled">Not Enrolled</option>
        </select>
      </div>

      {toastMessage ? (
        <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-medium text-green-700">
          {toastMessage}
        </p>
      ) : null}

      {hasError ? <ApiError /> : null}

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Designation</th>
              <th className="px-4 py-3 font-medium">Department</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Face</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td className="px-4 py-6 text-muted-foreground" colSpan={8}>
                  Loading employees...
                </td>
              </tr>
            ) : null}

            {!isLoading && filteredEmployees.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-muted-foreground" colSpan={8}>
                  No employees found.
                </td>
              </tr>
            ) : null}

            {filteredEmployees.map((employee) => (
              <tr className="border-b last:border-0" key={employee.id}>
                <td className="px-4 py-3 font-medium">{employee.name}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {employee.email}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {employee.phone ?? "—"}
                </td>
                <td className="px-4 py-3">
                  {employee.designation ?? "Not assigned"}
                </td>
                <td className="px-4 py-3">
                  {employee.department ?? "Not assigned"}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={employee.status} />
                </td>
                <td className="px-4 py-3">
                  <FaceBadge hasFaceEnrolled={employee.has_face_enrolled} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      onClick={() => setEditingEmployee(employee)}
                    >
                      <Edit aria-hidden="true" className="size-3" />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setEnrollingEmployee(employee)}
                    >
                      Enroll Face
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="gap-1 text-red-600 hover:text-red-700"
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

      {isAddModalOpen || editingEmployee !== null ? (
        <AddEmployeeModal
          key={editingEmployee?.id ?? "new-employee"}
          open
          employee={editingEmployee}
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
