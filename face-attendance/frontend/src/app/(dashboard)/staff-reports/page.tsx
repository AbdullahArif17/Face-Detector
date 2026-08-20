"use client";

import { Download, Pencil, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError } from "@/components/api-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { getApiErrorMessage } from "@/lib/errors";
import { canManageAttendanceSessions } from "@/lib/permissions";
import {
  exportStaffAttendanceHistory,
  getAllEmployees,
  getStaffAttendanceHistory,
  updateStaffManualAttendance,
  type AttendanceManualUpdateInput,
  type Employee,
  type StaffAttendanceRecord,
} from "@/lib/api";

type AttendanceEditableStatus = "present" | "absent" | "excused";

interface StaffEditState {
  record: StaffAttendanceRecord;
  status: AttendanceEditableStatus;
  checkInTime: string;
  checkOutTime: string;
  error: string;
}

type DesignationFilter = "" | "Teacher" | "staff-only";

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  timeStyle: "short",
});

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}


function timeInputValue(value: string | null): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toTimeString().slice(0, 5);
}

function defaultCheckInTime(): string {
  return new Date().toTimeString().slice(0, 5);
}

function formatTime(value: string | null): string {
  return value ? timeFormatter.format(new Date(value)) : "—";
}

function StatusBadge({ status }: Readonly<{ status: string }>) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-1 text-xs font-medium capitalize",
        status === "present"
          ? "bg-green-50 text-green-700"
          : status === "late"
            ? "bg-yellow-50 text-yellow-700"
            : status === "absent"
              ? "bg-red-50 text-red-700"
              : status === "excused"
                ? "bg-blue-50 text-blue-700"
                : "bg-slate-100 text-slate-600",
      )}
    >
      {status}
    </span>
  );
}

function DesignationBadge({ designation }: Readonly<{ designation: string | null }>) {
  const isTeacher = designation?.toLowerCase() === "teacher";
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-1 text-xs font-medium",
        isTeacher
          ? "bg-purple-50 text-purple-700"
          : "bg-sky-50 text-sky-700",
      )}
    >
      {designation ?? "—"}
    </span>
  );
}

function StatCard({
  label,
  value,
  color,
}: Readonly<{
  label: string;
  value: string | number;
  color: "green" | "red" | "blue" | "amber" | "slate" | "purple";
}>) {
  const colorMap = {
    green: "border-green-200 bg-green-50 text-green-700",
    red: "border-red-200 bg-red-50 text-red-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
    purple: "border-purple-200 bg-purple-50 text-purple-700",
  };
  return (
    <div
      className={cn(
        "rounded-lg border p-4 text-center",
        colorMap[color],
      )}
    >
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-xs font-medium uppercase tracking-wide opacity-80">
        {label}
      </p>
    </div>
  );
}

export default function StaffReportsPage() {
  const { user } = useAuth();
  const canEditAttendance = canManageAttendanceSessions(user);

  const [historyRecords, setHistoryRecords] = useState<StaffAttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [designationFilter, setDesignationFilter] = useState<DesignationFilter>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState(todayInputValue());
  const [endDate, setEndDate] = useState(todayInputValue());
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  const [editState, setEditState] = useState<StaffEditState | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const loadHistory = useCallback(async (): Promise<void> => {
    setIsHistoryLoading(true);
    try {
      const records = await getStaffAttendanceHistory({
        startDate,
        endDate,
        employeeId: selectedEmployeeId
          ? Number.parseInt(selectedEmployeeId, 10)
          : undefined,
      });
      setHistoryRecords(records);
      setHasError(false);
    } catch {
      setHasError(true);
    } finally {
      setIsHistoryLoading(false);
    }
  }, [endDate, selectedEmployeeId, startDate]);

  useEffect(() => {
    let isCancelled = false;

    void Promise.resolve().then(async () => {
      try {
        const employeeRecords = await getAllEmployees();
        if (!isCancelled) {
          setEmployees(employeeRecords);
        }
      } catch {
        if (!isCancelled) {
          setHasError(true);
        }
      }
    });

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadHistory);
  }, [loadHistory]);

  // Filter records by designation and search term
  const filteredRecords = useMemo(() => {
    return historyRecords.filter((record) => {
      // Designation filter
      if (designationFilter === "Teacher") {
        if (record.designation?.toLowerCase() !== "teacher") {
          return false;
        }
      } else if (designationFilter === "staff-only") {
        if (record.designation?.toLowerCase() === "teacher") {
          return false;
        }
      }

      // Name search
      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase();
        const nameMatch = record.employee_name.toLowerCase().includes(term);
        const designationMatch = record.designation?.toLowerCase().includes(term) ?? false;
        if (!nameMatch && !designationMatch) {
          return false;
        }
      }
      return true;
    });
  }, [historyRecords, designationFilter, searchTerm]);

  // Summary statistics
  const stats = useMemo(() => {
    const total = filteredRecords.length;
    const present = filteredRecords.filter(
      (r) => r.status === "present" || r.status === "late",
    ).length;
    const absent = filteredRecords.filter((r) => r.status === "absent").length;
    const excused = filteredRecords.filter((r) => r.status === "excused").length;
    const rate = total > 0 ? ((present / total) * 100).toFixed(1) : "0.0";

    // Unique employees
    const uniqueIds = new Set(filteredRecords.map((r) => r.employee_id));
    return { total, present, absent, excused, rate, uniqueCount: uniqueIds.size };
  }, [filteredRecords]);

  // Filtered employees for the dropdown
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      if (designationFilter === "Teacher") {
        return emp.designation?.toLowerCase() === "teacher";
      }
      if (designationFilter === "staff-only") {
        return emp.designation?.toLowerCase() !== "teacher";
      }
      return true;
    });
  }, [employees, designationFilter]);

  // Unique designations for display
  const uniqueDesignations = useMemo(() => {
    const designations = new Set(
      employees
        .map((emp) => emp.designation)
        .filter((d): d is string => d !== null && d !== undefined),
    );
    return Array.from(designations).sort();
  }, [employees]);

  function handleEditRecord(record: StaffAttendanceRecord): void {
    const normalizedStatus = ["present", "absent", "excused"].includes(record.status)
      ? (record.status as AttendanceEditableStatus)
      : "present";
    setEditState({
      record,
      status: normalizedStatus,
      checkInTime:
        normalizedStatus === "present"
          ? timeInputValue(record.check_in) || defaultCheckInTime()
          : "",
      checkOutTime: normalizedStatus === "present" ? timeInputValue(record.check_out) : "",
      error: "",
    });
  }

  async function handleSaveAttendanceEdit(): Promise<void> {
    if (!editState || isSavingEdit) {
      return;
    }
    if (editState.status === "present" && !editState.checkInTime) {
      setEditState({ ...editState, error: "Check-in time is required." });
      return;
    }

    setIsSavingEdit(true);
    try {
      const payload: AttendanceManualUpdateInput = {
        attendance_id: editState.record.attendance_id,
        employee_id: editState.record.employee_id,
        attendance_date: editState.record.attendance_date,
        status: editState.status,
        check_in_time: editState.status === "present" ? editState.checkInTime : null,
        check_out_time:
          editState.status === "present" && editState.checkOutTime
            ? editState.checkOutTime
            : null,
      };
      await updateStaffManualAttendance(payload);
      setEditState(null);
      await loadHistory();
    } catch (error) {
      setEditState({
        ...editState,
        error: getApiErrorMessage(error, "Unable to save attendance."),
      });
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function handleExport(): Promise<void> {
    try {
      const blob = await exportStaffAttendanceHistory({
        startDate,
        endDate,
        employeeId: selectedEmployeeId
          ? Number.parseInt(selectedEmployeeId, 10)
          : undefined,
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const suffix = designationFilter === "Teacher"
        ? "teacher"
        : designationFilter === "staff-only"
          ? "staff"
          : "staff-teacher";
      link.download = `${suffix}-attendance-${startDate}-to-${endDate}.csv`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch {
      setHasError(true);
    }
  }

  const hasActiveFilters = Boolean(designationFilter || searchTerm.trim());

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-balance sm:text-3xl">
            Staff &amp; Teacher Reports
          </h1>
          <p className="mt-2 text-muted-foreground text-pretty">
            View, filter, and export attendance reports for teachers and non-teaching staff.
          </p>
        </div>
        {uniqueDesignations.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            {uniqueDesignations.length} designation{uniqueDesignations.length !== 1 ? "s" : ""}: {uniqueDesignations.join(", ")}
          </p>
        ) : null}
      </div>

      {/* Filters */}
      <div className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Filters
        </h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="grid gap-1.5">
            <label className="text-sm font-medium" htmlFor="staff-report-start-date">
              Start Date
            </label>
            <Input
              id="staff-report-start-date"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <label className="text-sm font-medium" htmlFor="staff-report-end-date">
              End Date
            </label>
            <Input
              id="staff-report-end-date"
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <label className="text-sm font-medium" htmlFor="staff-report-designation">
              Category
            </label>
            <select
              id="staff-report-designation"
              value={designationFilter}
              onChange={(event) => {
                setDesignationFilter(event.target.value as DesignationFilter);
                setSelectedEmployeeId("");
              }}
              className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">All (Teachers &amp; Staff)</option>
              <option value="Teacher">Teachers Only</option>
              <option value="staff-only">Staff Only (Non-Teaching)</option>
            </select>
          </div>
          <div className="grid gap-1.5">
            <label className="text-sm font-medium" htmlFor="staff-report-employee">
              Employee
            </label>
            <select
              id="staff-report-employee"
              value={selectedEmployeeId}
              onChange={(event) => setSelectedEmployeeId(event.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">All Employees</option>
              {filteredEmployees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} {emp.designation ? `(${emp.designation})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <label className="text-sm font-medium" htmlFor="staff-report-search">
              Search
            </label>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="staff-report-search"
                className="pl-9"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Name or designation..."
              />
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            className="gap-2"
            onClick={() => void loadHistory()}
          >
            Apply Filters
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => void handleExport()}
          >
            <Download aria-hidden="true" className="size-4" />
            Export CSV
          </Button>
          {hasActiveFilters ? (
            <Button
              type="button"
              variant="ghost"
              className="gap-2 text-muted-foreground"
              onClick={() => {
                setDesignationFilter("");
                setSearchTerm("");
                setSelectedEmployeeId("");
              }}
            >
              <X aria-hidden="true" className="size-4" />
              Clear
            </Button>
          ) : null}
        </div>
      </div>

      {/* Summary statistics */}
      {!isHistoryLoading && filteredRecords.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <StatCard label="Employees" value={stats.uniqueCount} color="purple" />
          <StatCard label="Total Records" value={stats.total} color="slate" />
          <StatCard label="Present" value={stats.present} color="green" />
          <StatCard label="Absent" value={stats.absent} color="red" />
          <StatCard label="Excused" value={stats.excused} color="blue" />
          <StatCard label="Attendance Rate" value={`${stats.rate}%`} color="amber" />
        </div>
      ) : null}

      {hasError ? (
        <ApiError
          onRetry={() => void loadHistory()}
          isRetrying={isHistoryLoading}
        />
      ) : null}

      {/* Data table */}
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="min-w-[1050px] w-full text-left text-sm">
          <thead className="border-b bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Designation</th>
              <th className="px-4 py-3 font-medium">Department</th>
              <th className="px-4 py-3 font-medium">Check-in</th>
              <th className="px-4 py-3 font-medium">Check-out</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Working Hours</th>
              {canEditAttendance ? (
                <th className="px-4 py-3 font-medium">Actions</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {isHistoryLoading ? (
              <tr>
                <td className="px-4 py-6 text-muted-foreground" colSpan={canEditAttendance ? 9 : 8}>
                  Loading attendance history...
                </td>
              </tr>
            ) : null}

            {!isHistoryLoading && filteredRecords.length === 0 ? (
              <tr>
                <td className="px-4 py-10 text-center text-muted-foreground" colSpan={canEditAttendance ? 9 : 8}>
                  <p className="font-medium">
                    {hasActiveFilters
                      ? "No records match the current filters"
                      : "No staff attendance records found"}
                  </p>
                  <p className="mt-1 text-xs">
                    {hasActiveFilters
                      ? "Try adjusting the date range, category, or employee filter."
                      : "Records will appear once staff attendance sessions are completed."}
                  </p>
                </td>
              </tr>
            ) : null}

            {filteredRecords.map((record) => (
              <tr
                className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                key={`${record.employee_id}-${record.attendance_date}-${record.attendance_id ?? "absent"}`}
              >
                <td className="px-4 py-3 tabular-nums">
                  {record.attendance_date}
                </td>
                <td className="px-4 py-3 font-medium">{record.employee_name}</td>
                <td className="px-4 py-3">
                  <DesignationBadge designation={record.designation} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {record.department ?? "—"}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {formatTime(record.check_in)}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {formatTime(record.check_out)}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={record.status} />
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {record.working_hours}
                </td>
                {canEditAttendance ? (
                  <td className="px-4 py-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => handleEditRecord(record)}
                    >
                      <Pencil aria-hidden="true" className="size-4" />
                      Edit
                    </Button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit modal */}
      {editState ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="staff-edit-attendance-title"
        >
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-lg border bg-background p-5 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold" id="staff-edit-attendance-title">
                  Edit Attendance
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {editState.record.employee_name}
                  {editState.record.designation ? ` · ${editState.record.designation}` : ""}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Date: {editState.record.attendance_date}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close attendance editor"
                onClick={() => setEditState(null)}
              >
                <X aria-hidden="true" className="size-4" />
              </Button>
            </div>

            <div className="mt-5 grid gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium" htmlFor="staff-attendance-status">
                  Status
                </label>
                <select
                  id="staff-attendance-status"
                  value={editState.status}
                  onChange={(event) => {
                    const nextStatus = event.target.value as AttendanceEditableStatus;
                    setEditState({
                      ...editState,
                      status: nextStatus,
                      checkInTime:
                        nextStatus === "present"
                          ? editState.checkInTime || defaultCheckInTime()
                          : "",
                      checkOutTime:
                        nextStatus === "present" ? editState.checkOutTime : "",
                      error: "",
                    });
                  }}
                  className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="present">Present</option>
                  <option value="absent">Absent</option>
                  <option value="excused">Excused</option>
                </select>
              </div>

              {editState.status === "present" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium" htmlFor="staff-check-in-time">
                      Check-in
                    </label>
                    <Input
                      id="staff-check-in-time"
                      type="time"
                      value={editState.checkInTime}
                      onChange={(event) =>
                        setEditState({
                          ...editState,
                          checkInTime: event.target.value,
                          error: "",
                        })
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium" htmlFor="staff-check-out-time">
                      Check-out
                    </label>
                    <Input
                      id="staff-check-out-time"
                      type="time"
                      value={editState.checkOutTime}
                      onChange={(event) =>
                        setEditState({
                          ...editState,
                          checkOutTime: event.target.value,
                          error: "",
                        })
                      }
                    />
                  </div>
                </div>
              ) : null}

              {editState.error ? (
                <p
                  className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                >
                  {editState.error}
                </p>
              ) : null}
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditState(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={isSavingEdit}
                onClick={() => void handleSaveAttendanceEdit()}
              >
                {isSavingEdit ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
