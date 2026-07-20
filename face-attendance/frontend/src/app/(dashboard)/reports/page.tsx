"use client";

import { Download, Pencil, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

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
        "inline-flex rounded-full px-2 py-1 text-xs font-medium capitalize",
        status === "present"
          ? "bg-green-50 text-green-700"
          : status === "late"
            ? "bg-yellow-50 text-yellow-700"
            : status === "absent"
              ? "bg-red-50 text-red-700"
              : "bg-slate-100 text-slate-600",
      )}
    >
      {status}
    </span>
  );
}

export default function ReportsPage() {
  const { user } = useAuth();
  const canEditAttendance = canManageAttendanceSessions(user);

  const [historyRecords, setHistoryRecords] = useState<AttendanceDashboardRecord[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
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
      link.download = "attendance-export.csv";
      link.click();
      window.URL.revokeObjectURL(url);
    } catch {
      setHasError(true);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-balance sm:text-3xl">Reports</h1>
          <p className="mt-2 text-muted-foreground text-pretty">
            Generate and export attendance reports.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="start-date">
              Start date
            </label>
            <Input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="end-date">
              End date
            </label>
            <Input
              id="end-date"
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="student-filter">
              Student
            </label>
            <select
              id="student-filter"
              value={selectedStudentId}
              onChange={(event) => setSelectedStudentId(event.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">All students</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.student_name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row md:items-end">
            <Button
              type="button"
              className="flex-1"
              onClick={() => void loadHistory()}
            >
              Apply
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex-1 gap-2"
              onClick={() => void handleExport()}
            >
              <Download aria-hidden="true" className="size-4" />
              Export
            </Button>
          </div>
        </div>
        
        {hasError ? (
          <ApiError
            onRetry={() => void loadHistory()}
            isRetrying={isHistoryLoading}
          />
        ) : null}

        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="min-w-[860px] w-full text-left text-sm">
            <thead className="border-b bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Student Name</th>
                <th className="px-4 py-3 font-medium">Class</th>
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
                  <td className="px-4 py-6 text-muted-foreground" colSpan={canEditAttendance ? 8 : 7}>
                    Loading history...
                  </td>
                </tr>
              ) : null}

              {!isHistoryLoading && historyRecords.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-muted-foreground" colSpan={canEditAttendance ? 8 : 7}>
                    No records found for this period.
                  </td>
                </tr>
              ) : null}

              {historyRecords.map((record) => (
                <tr
                  className="border-b last:border-0"
                  key={`${record.student_id}-${record.attendance_date}-${record.attendance_id ?? "absent"}`}
                >
                  <td className="px-4 py-3 tabular-nums">
                    {record.attendance_date}
                  </td>
                  <td className="px-4 py-3 font-medium">{record.student_name}</td>
                  <td className="px-4 py-3">
                    {record.grade}-{record.section}
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
      </div>

      {editState ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-attendance-title"
        >
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-lg border bg-background p-5 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold" id="edit-attendance-title">
                  Edit attendance
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
                onClick={() => setEditState(null)}
              >
                <X aria-hidden="true" className="size-4" />
              </Button>
            </div>

            <div className="mt-5 grid gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium" htmlFor="attendance-status">
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
                    <label className="text-sm font-medium" htmlFor="check-in-time">
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
                    <label className="text-sm font-medium" htmlFor="check-out-time">
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
                {isSavingEdit ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
