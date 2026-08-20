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
  exportAttendanceHistory,
  getAttendanceHistory,
  getStudents,
  updateManualAttendance,
  type AttendanceDashboardRecord,
  type Student,
} from "@/lib/api";

type AttendanceEditableStatus = "present" | "absent" | "excused";

interface AttendanceEditState {
  record: AttendanceDashboardRecord;
  status: AttendanceEditableStatus;
  checkInTime: string;
  checkOutTime: string;
  error: string;
}

const grades = Array.from({ length: 12 }, (_, index) => `Class ${index + 1}`);
const sections = ["A", "B", "C", "D"];

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  timeStyle: "short",
});

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoInputValue(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
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
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold capitalize tracking-wide",
        status === "present"
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/10"
          : status === "late"
            ? "bg-yellow-50 text-yellow-700 ring-1 ring-yellow-600/10"
            : status === "absent"
              ? "bg-red-50 text-red-700 ring-1 ring-red-600/10"
              : status === "excused"
                ? "bg-blue-50 text-blue-700 ring-1 ring-blue-600/10"
                : "bg-slate-50 text-slate-500 ring-1 ring-slate-500/10",
      )}
    >
      <span className={cn(
        "size-1.5 rounded-full",
        status === "present" ? "bg-emerald-500"
          : status === "late" ? "bg-yellow-500"
          : status === "absent" ? "bg-red-500"
          : status === "excused" ? "bg-blue-500"
          : "bg-slate-400",
      )} />
      {status}
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
  color: "green" | "red" | "blue" | "amber" | "slate";
}>) {
  const colorMap = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    red: "border-red-200 bg-red-50 text-red-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
  };
  return (
    <div
      className={cn(
        "card-hover rounded-xl border p-4 text-center shadow-sm",
        colorMap[color],
      )}
    >
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-wider opacity-80">
        {label}
      </p>
    </div>
  );
}

export default function StudentReportsPage() {
  const { user } = useAuth();
  const canEditAttendance = canManageAttendanceSessions(user);

  const [historyRecords, setHistoryRecords] = useState<AttendanceDashboardRecord[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState(daysAgoInputValue(7));
  const [endDate, setEndDate] = useState(todayInputValue());
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  const [editState, setEditState] = useState<AttendanceEditState | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const loadHistory = useCallback(async (): Promise<void> => {
    setIsHistoryLoading(true);
    try {
      const records = await getAttendanceHistory({
        startDate,
        endDate,
        studentId: selectedStudentId
          ? Number.parseInt(selectedStudentId, 10)
          : undefined,
      });
      setHistoryRecords(records);
      setHasError(false);
    } catch {
      setHasError(true);
    } finally {
      setIsHistoryLoading(false);
    }
  }, [endDate, selectedStudentId, startDate]);

  useEffect(() => {
    let isCancelled = false;

    void Promise.resolve().then(async () => {
      try {
        const studentRecords = await getStudents({ status: "active" });
        if (!isCancelled) {
          setStudents(studentRecords);
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

  // Filter records by grade, section, and search term
  const filteredRecords = useMemo(() => {
    return historyRecords.filter((record) => {
      if (gradeFilter && record.grade !== gradeFilter) {
        return false;
      }
      if (sectionFilter && record.section !== sectionFilter) {
        return false;
      }
      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase();
        const nameMatch = record.student_name.toLowerCase().includes(term);
        return nameMatch;
      }
      return true;
    });
  }, [historyRecords, gradeFilter, sectionFilter, searchTerm]);

  // Summary statistics
  const stats = useMemo(() => {
    const total = filteredRecords.length;
    const present = filteredRecords.filter(
      (r) => r.status === "present" || r.status === "late",
    ).length;
    const absent = filteredRecords.filter((r) => r.status === "absent").length;
    const excused = filteredRecords.filter((r) => r.status === "excused").length;
    const rate = total > 0 ? ((present / total) * 100).toFixed(1) : "0.0";
    return { total, present, absent, excused, rate };
  }, [filteredRecords]);

  // Unique students for the dropdown filtered by grade/section
  const filteredStudents = useMemo(() => {
    return students.filter((student) => {
      if (gradeFilter && student.grade !== gradeFilter) {
        return false;
      }
      if (sectionFilter && student.section !== sectionFilter) {
        return false;
      }
      return true;
    });
  }, [students, gradeFilter, sectionFilter]);

  function handleEditRecord(record: AttendanceDashboardRecord): void {
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
      await updateManualAttendance({
        attendance_id: editState.record.attendance_id,
        student_id: editState.record.student_id,
        attendance_date: editState.record.attendance_date,
        status: editState.status,
        check_in_time: editState.status === "present" ? editState.checkInTime : null,
        check_out_time:
          editState.status === "present" && editState.checkOutTime
            ? editState.checkOutTime
            : null,
      });
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
      const blob = await exportAttendanceHistory({
        startDate,
        endDate,
        studentId: selectedStudentId
          ? Number.parseInt(selectedStudentId, 10)
          : undefined,
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `student-attendance-${startDate}-to-${endDate}.csv`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch {
      setHasError(true);
    }
  }

  const hasActiveFilters = Boolean(gradeFilter || sectionFilter || searchTerm.trim());

  return (
    <section className="animate-page-enter space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            <span className="text-gradient">Student Reports</span>
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground text-pretty">
            View, filter, and export student attendance history by date range, class, or individual student.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-4 rounded-xl border bg-card p-5 shadow-card">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Filters
        </h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="grid gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="report-start-date">
              Start Date
            </label>
            <Input
              id="report-start-date"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="report-end-date">
              End Date
            </label>
            <Input
              id="report-end-date"
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="report-grade-filter">
              Class / Grade
            </label>
            <select
              id="report-grade-filter"
              value={gradeFilter}
              onChange={(event) => {
                setGradeFilter(event.target.value);
                setSelectedStudentId("");
              }}
              className="h-10 rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">All Classes</option>
              {grades.map((grade) => (
                <option key={grade} value={grade}>
                  {grade}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="report-section-filter">
              Section
            </label>
            <select
              id="report-section-filter"
              value={sectionFilter}
              onChange={(event) => {
                setSectionFilter(event.target.value);
                setSelectedStudentId("");
              }}
              className="h-10 rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">All Sections</option>
              {sections.map((section) => (
                <option key={section} value={section}>
                  Section {section}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="report-student-filter">
              Student
            </label>
            <select
              id="report-student-filter"
              value={selectedStudentId}
              onChange={(event) => setSelectedStudentId(event.target.value)}
              className="h-10 rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">All Students</option>
              {filteredStudents.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.student_name} ({student.grade}-{student.section})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Search and action buttons */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label="Search by student name"
              className="pl-9"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by student name..."
            />
          </div>
          <Button
            type="button"
            className="gap-2 shadow-sm"
            onClick={() => void loadHistory()}
          >
            Apply Filters
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-2 shadow-sm"
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
                setGradeFilter("");
                setSectionFilter("");
                setSearchTerm("");
                setSelectedStudentId("");
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
      <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
        <table className="min-w-[960px] w-full text-left text-sm">
          <thead className="border-b bg-muted/30">
            <tr>
              <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Date</th>
              <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Student Name</th>
              <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Class</th>
              <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Check-in</th>
              <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Check-out</th>
              <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
              <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Working Hours</th>
              {canEditAttendance ? (
                <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isHistoryLoading ? (
              Array.from({ length: 5 }).map((_, index) => (
                <tr key={`skeleton-${index}`}>
                  {Array.from({ length: canEditAttendance ? 8 : 7 }).map((_, colIndex) => (
                    <td key={colIndex} className="px-4 py-4">
                      <div className="skeleton h-4 w-20 rounded" />
                    </td>
                  ))}
                </tr>
              ))
            ) : null}

            {!isHistoryLoading && filteredRecords.length === 0 ? (
              <tr>
                <td className="px-4 py-10 text-center text-muted-foreground" colSpan={canEditAttendance ? 8 : 7}>
                  <p className="font-medium">
                    {hasActiveFilters
                      ? "No records match the current filters"
                      : "No attendance records found"}
                  </p>
                  <p className="mt-1 text-xs">
                    {hasActiveFilters
                      ? "Try adjusting the date range, class, or student filter."
                      : "Records will appear once attendance sessions are completed."}
                  </p>
                </td>
              </tr>
            ) : null}

            {filteredRecords.map((record) => (
              <tr
                className="transition-colors hover:bg-muted/30"
                key={`${record.student_id}-${record.attendance_date}-${record.attendance_id ?? "absent"}`}
              >
                <td className="px-4 py-3.5 tabular-nums">
                  {record.attendance_date}
                </td>
                <td className="px-4 py-3.5 font-medium">{record.student_name}</td>
                <td className="px-4 py-3.5">
                  {record.grade}-{record.section}
                </td>
                <td className="px-4 py-3.5 tabular-nums text-muted-foreground">
                  {formatTime(record.check_in)}
                </td>
                <td className="px-4 py-3.5 tabular-nums text-muted-foreground">
                  {formatTime(record.check_out)}
                </td>
                <td className="px-4 py-3.5">
                  <StatusBadge status={record.status} />
                </td>
                <td className="px-4 py-3.5 tabular-nums text-muted-foreground">
                  {record.working_hours}
                </td>
                {canEditAttendance ? (
                  <td className="px-4 py-3.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2 shadow-sm"
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
          aria-labelledby="edit-attendance-title"
        >
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-xl border bg-background p-5 shadow-lg animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold" id="edit-attendance-title">
                  Edit Attendance
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {editState.record.student_name} · {editState.record.grade}-
                  {editState.record.section}
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
                className="rounded-full hover:bg-muted"
                onClick={() => setEditState(null)}
              >
                <X aria-hidden="true" className="size-4" />
              </Button>
            </div>

            <div className="mt-5 grid gap-4">
              <div className="grid gap-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="attendance-status">
                  Status
                </label>
                <select
                  id="attendance-status"
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
                  className="h-10 rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="present">Present</option>
                  <option value="absent">Absent</option>
                  <option value="excused">Excused</option>
                </select>
              </div>

              {editState.status === "present" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="check-in-time">
                      Check-in
                    </label>
                    <Input
                      id="check-in-time"
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
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="check-out-time">
                      Check-out
                    </label>
                    <Input
                      id="check-out-time"
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
                  className="animate-fade-in rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 shadow-sm"
                >
                  {editState.error}
                </p>
              ) : null}
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="shadow-sm"
                onClick={() => setEditState(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="shadow-md"
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
