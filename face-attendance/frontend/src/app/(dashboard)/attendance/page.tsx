"use client";

import { Download, Pencil, Power, PowerOff, RefreshCcw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError } from "@/components/api-error";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { getApiErrorMessage } from "@/lib/errors";
import { canManageAttendanceSessions } from "@/lib/permissions";
import {
  exportAttendanceHistory,
  getAttendanceClassSessionStatuses,
  getAttendanceHistory,
  getAttendanceToday,
  getStudents,
  startAttendanceSession,
  stopAttendanceSession,
  updateManualAttendance,
  type AttendanceClassSessionStatus,
  type AttendanceDashboardRecord,
  type Student,
} from "@/lib/api";

type AttendanceTab = "today" | "history";
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

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
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

function formatTime(value: string | null): string {
  return value ? timeFormatter.format(new Date(value)) : "—";
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

function AttendanceTable({
  records,
  isLoading,
  canEdit,
  onEdit,
}: Readonly<{
  records: AttendanceDashboardRecord[];
  isLoading: boolean;
  canEdit: boolean;
  onEdit: (record: AttendanceDashboardRecord) => void;
}>) {
  const columnCount = canEdit ? 7 : 6;

  return (
    <>
      <div className="grid gap-3 md:hidden">
        {isLoading ? (
          <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">
            Loading attendance...
          </div>
        ) : null}
        {!isLoading && records.length === 0 ? (
          <div className="rounded-lg border bg-card p-5 text-center">
            <p className="font-medium">No attendance records</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Records will appear here after a class session receives a scan or a
              staff member adds attendance.
            </p>
          </div>
        ) : null}
        {records.map((record) => (
          <article
            className="rounded-lg border bg-card p-4"
            key={`${record.student_id}-${record.attendance_date}-${record.attendance_id ?? "absent"}-mobile`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{record.student_name}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {record.grade}-{record.section}
                </p>
              </div>
              <StatusBadge status={record.status} />
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Check-in</dt>
                <dd className="mt-1 tabular-nums">{formatTime(record.check_in)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Check-out</dt>
                <dd className="mt-1 tabular-nums">{formatTime(record.check_out)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Hours</dt>
                <dd className="mt-1 tabular-nums">{record.working_hours}</dd>
              </div>
            </dl>
            {canEdit ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4 w-full gap-2"
                onClick={() => onEdit(record)}
              >
                <Pencil aria-hidden="true" className="size-4" />
                Edit attendance
              </Button>
            ) : null}
          </article>
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
      <table className="min-w-[860px] w-full text-left text-sm">
        <thead className="border-b bg-muted/50 text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Student Name</th>
            <th className="px-4 py-3 font-medium">Class</th>
            <th className="px-4 py-3 font-medium">Check-in</th>
            <th className="px-4 py-3 font-medium">Check-out</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Working Hours</th>
            {canEdit ? (
              <th className="px-4 py-3 font-medium">Actions</th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td className="px-4 py-6 text-muted-foreground" colSpan={columnCount}>
                Loading attendance...
              </td>
            </tr>
          ) : null}

          {!isLoading && records.length === 0 ? (
            <tr>
              <td className="px-4 py-6 text-muted-foreground" colSpan={columnCount}>
                No attendance records found.
              </td>
            </tr>
          ) : null}

          {records.map((record) => (
            <tr
              className="border-b last:border-0"
              key={`${record.student_id}-${record.attendance_date}-${record.attendance_id ?? "absent"}`}
            >
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
              {canEdit ? (
                <td className="px-4 py-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => onEdit(record)}
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
    </>
  );
}

export default function AttendancePage() {
  const { user } = useAuth();
  const canManageSessions = canManageAttendanceSessions(user);
  const canEditAttendance = canManageSessions;
  const [activeTab, setActiveTab] = useState<AttendanceTab>("today");
  const [todayRecords, setTodayRecords] = useState<AttendanceDashboardRecord[]>(
    [],
  );
  const [historyRecords, setHistoryRecords] = useState<
    AttendanceDashboardRecord[]
  >([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classSessionStatuses, setClassSessionStatuses] = useState<
    AttendanceClassSessionStatus[]
  >([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [startDate, setStartDate] = useState(daysAgoInputValue(7));
  const [endDate, setEndDate] = useState(todayInputValue());
  const [isTodayLoading, setIsTodayLoading] = useState(true);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [updatingClassId, setUpdatingClassId] = useState<number | null>(null);
  const [hasError, setHasError] = useState(false);
  const [sessionMessage, setSessionMessage] = useState("");
  const [sessionMessageIsError, setSessionMessageIsError] = useState(false);
  const [editState, setEditState] = useState<AttendanceEditState | null>(null);
  const [pendingStopClass, setPendingStopClass] =
    useState<AttendanceClassSessionStatus | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const loadToday = useCallback(async (): Promise<void> => {
    setIsTodayLoading(true);
    try {
      const records = await getAttendanceToday(
        selectedClassId ? Number.parseInt(selectedClassId, 10) : undefined,
      );
      setTodayRecords(records);
      setHasError(false);
    } catch {
      setHasError(true);
    } finally {
      setIsTodayLoading(false);
    }
  }, [selectedClassId]);

  const loadHistory = useCallback(async (): Promise<void> => {
    setIsHistoryLoading(true);
    try {
      const records = await getAttendanceHistory({
        startDate,
        endDate,
        studentId: selectedStudentId
          ? Number.parseInt(selectedStudentId, 10)
          : undefined,
        classId: selectedClassId
          ? Number.parseInt(selectedClassId, 10)
          : undefined,
      });
      setHistoryRecords(records);
      setHasError(false);
    } catch {
      setHasError(true);
    } finally {
      setIsHistoryLoading(false);
    }
  }, [endDate, selectedClassId, selectedStudentId, startDate]);

  const filteredStudents = useMemo(() => {
    if (!selectedClassId) {
      return students;
    }
    const classId = Number.parseInt(selectedClassId, 10);
    return students.filter((student) => student.class_id === classId);
  }, [selectedClassId, students]);

  const loadClassSessionStatuses = useCallback(async (): Promise<void> => {
    setIsSessionLoading(true);
    try {
      const statuses = await getAttendanceClassSessionStatuses();
      setClassSessionStatuses(statuses);
      setHasError(false);
    } catch {
      setHasError(true);
    } finally {
      setIsSessionLoading(false);
    }
  }, []);

  useEffect(() => {
    let isCancelled = false;

    void Promise.resolve().then(async () => {
      try {
        const [studentRecords, sessionStatuses] = await Promise.all([
          getStudents({ status: "active" }),
          getAttendanceClassSessionStatuses(),
        ]);
        if (!isCancelled) {
          setStudents(studentRecords);
          setClassSessionStatuses(sessionStatuses);
          setIsSessionLoading(false);
        }
      } catch {
        if (!isCancelled) {
          setHasError(true);
          setIsSessionLoading(false);
        }
      }
    });

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadToday);
  }, [loadToday]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadToday();
      void loadClassSessionStatuses();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [loadClassSessionStatuses, loadToday]);

  useEffect(() => {
    if (activeTab === "history") {
      void Promise.resolve().then(loadHistory);
    }
  }, [activeTab, loadHistory]);

  const summary = useMemo(
    () => ({
      present: todayRecords.filter((record) => record.status === "present").length,
      late: todayRecords.filter((record) => record.status === "late").length,
      absent: todayRecords.filter((record) => record.status === "absent").length,
    }),
    [todayRecords],
  );

  async function handleExport(): Promise<void> {
    try {
      const blob = await exportAttendanceHistory({
        startDate,
        endDate,
        studentId: selectedStudentId
          ? Number.parseInt(selectedStudentId, 10)
          : undefined,
        classId: selectedClassId
          ? Number.parseInt(selectedClassId, 10)
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

  function handleClassChange(value: string): void {
    setSelectedClassId(value);
    setSelectedStudentId("");
  }

  async function handleRefresh(): Promise<void> {
    await Promise.all([loadToday(), loadClassSessionStatuses()]);
  }

  async function handleStartSession(classId: number): Promise<void> {
    setUpdatingClassId(classId);
    setSessionMessage("");
    setSessionMessageIsError(false);
    try {
      await startAttendanceSession(classId);
      setSessionMessage("Attendance session started for this class.");
      await Promise.all([loadClassSessionStatuses(), loadToday()]);
    } catch (error) {
      setSessionMessageIsError(true);
      setSessionMessage(
        getApiErrorMessage(error, "Unable to start attendance for this class."),
      );
    } finally {
      setUpdatingClassId(null);
    }
  }

  async function handleStopSession(
    classStatus: AttendanceClassSessionStatus,
  ): Promise<void> {
    if (!classStatus.active_session) {
      setSessionMessageIsError(true);
      setSessionMessage("No active attendance session for this class.");
      return;
    }

    setUpdatingClassId(classStatus.class_id);
    setSessionMessage("");
    setSessionMessageIsError(false);
    try {
      await stopAttendanceSession(classStatus.active_session.id);
      setSessionMessage("Attendance session stopped for this class.");
      await Promise.all([loadClassSessionStatuses(), loadToday()]);
    } catch (error) {
      setSessionMessageIsError(true);
      setSessionMessage(
        getApiErrorMessage(error, "Unable to stop attendance for this class."),
      );
    } finally {
      setUpdatingClassId(null);
      setPendingStopClass(null);
    }
  }

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
      await Promise.all([
        loadToday(),
        activeTab === "history" ? loadHistory() : Promise.resolve(),
      ]);
    } catch (error) {
      setEditState({
        ...editState,
        error: getApiErrorMessage(error, "Unable to save attendance."),
      });
    } finally {
      setIsSavingEdit(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-balance sm:text-3xl">
            Attendance
          </h1>
          <p className="mt-2 text-muted-foreground text-pretty">
            Live attendance and historical records for this school.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-full gap-2 sm:w-auto"
          onClick={() => void handleRefresh()}
        >
          <RefreshCcw aria-hidden="true" className="size-4" />
          Refresh Today
        </Button>
      </div>

      <div className="grid grid-cols-2 rounded-lg border bg-card p-1 sm:flex sm:w-fit">
        <Button
          type="button"
          variant={activeTab === "today" ? "default" : "ghost"}
          onClick={() => setActiveTab("today")}
        >
          Today
        </Button>
        <Button
          type="button"
          variant={activeTab === "history" ? "default" : "ghost"}
          onClick={() => setActiveTab("history")}
        >
          History
        </Button>
      </div>

      <div className="space-y-4 rounded-lg border bg-card p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Class attendance sessions</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Turn attendance on only for classes currently taking attendance.
              Open sessions automatically expire at the end of the school day.
            </p>
          </div>
          {!canManageSessions ? (
            <p className="text-xs text-muted-foreground">
              Your role can view sessions but cannot change them.
            </p>
          ) : null}
        </div>

        {sessionMessage ? (
          <div
            className={cn(
              "rounded-md border px-3 py-2 text-sm",
              sessionMessageIsError
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-green-200 bg-green-50 text-green-700",
            )}
            role={sessionMessageIsError ? "alert" : "status"}
          >
            {sessionMessage}
          </div>
        ) : null}

        {isSessionLoading ? (
          <p className="text-sm text-muted-foreground">
            Loading class sessions...
          </p>
        ) : null}

        {!isSessionLoading && classSessionStatuses.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No classes found. Add a class and students before starting attendance.
          </p>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {classSessionStatuses.map((classStatus) => {
            const isActive = classStatus.active_session !== null;
            const isUpdating = updatingClassId === classStatus.class_id;

            return (
              <article
                className={cn(
                  "space-y-3 rounded-lg border p-4",
                  selectedClassId === String(classStatus.class_id) &&
                    "border-primary ring-1 ring-primary/20",
                )}
                key={classStatus.class_id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{classStatus.class_name}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {classStatus.student_count} active student
                      {classStatus.student_count === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                      isActive
                        ? "bg-green-100 text-green-700"
                        : "bg-slate-100 text-slate-600",
                    )}
                  >
                    {isActive ? "ON" : "OFF"}
                  </span>
                </div>

                <p className="min-h-10 text-sm text-muted-foreground">
                  {classStatus.active_session
                    ? `Started ${dateTimeFormatter.format(
                        new Date(classStatus.active_session.started_at),
                      )}`
                    : "Kiosk scans are blocked for this class."}
                </p>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      handleClassChange(String(classStatus.class_id))
                    }
                  >
                    View records
                  </Button>
                  <Button
                    type="button"
                    variant={isActive ? "outline" : "default"}
                    disabled={
                      !canManageSessions ||
                      isUpdating ||
                      classStatus.student_count === 0
                    }
                    className="gap-2"
                    onClick={() =>
                      isActive
                        ? setPendingStopClass(classStatus)
                        : void handleStartSession(classStatus.class_id)
                    }
                  >
                    {isActive ? (
                      <PowerOff aria-hidden="true" className="size-4" />
                    ) : (
                      <Power aria-hidden="true" className="size-4" />
                    )}
                    {isUpdating
                      ? isActive
                        ? "Stopping..."
                        : "Starting..."
                      : isActive
                        ? "Turn OFF"
                        : "Turn ON"}
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <div className="grid gap-2 rounded-lg border bg-card p-4 sm:max-w-sm">
        <label className="text-sm font-medium" htmlFor="class-filter">
          Records class filter
        </label>
        <select
          id="class-filter"
          value={selectedClassId}
          onChange={(event) => handleClassChange(event.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">All classes</option>
          {classSessionStatuses.map((classStatus) => (
            <option key={classStatus.class_id} value={classStatus.class_id}>
              {classStatus.class_name}
            </option>
          ))}
        </select>
      </div>

      {hasError ? (
        <ApiError
          onRetry={() =>
            void (activeTab === "today"
              ? handleRefresh()
              : Promise.all([loadHistory(), loadClassSessionStatuses()]))
          }
          isRetrying={
            isTodayLoading || isHistoryLoading || isSessionLoading
          }
        />
      ) : null}

      {activeTab === "today" ? (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border bg-card p-4">
              <p className="text-sm text-muted-foreground">Present</p>
              <p className="mt-2 text-2xl font-bold text-green-700">
                {summary.present}
              </p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <p className="text-sm text-muted-foreground">Late</p>
              <p className="mt-2 text-2xl font-bold text-yellow-700">
                {summary.late}
              </p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <p className="text-sm text-muted-foreground">Absent</p>
              <p className="mt-2 text-2xl font-bold text-red-700">
                {summary.absent}
              </p>
            </div>
          </div>
          <AttendanceTable
            records={todayRecords}
            isLoading={isTodayLoading}
            canEdit={canEditAttendance}
            onEdit={handleEditRecord}
          />
        </div>
      ) : (
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
                {filteredStudents.map((student) => (
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
                Export Excel
              </Button>
            </div>
          </div>
          <AttendanceTable
            records={historyRecords}
            isLoading={isHistoryLoading}
            canEdit={canEditAttendance}
            onEdit={handleEditRecord}
          />
        </div>
      )}

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
                  role="alert"
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

      <ConfirmDialog
        open={pendingStopClass !== null}
        title="Stop this attendance session?"
        description={
          pendingStopClass
            ? `New kiosk scans for ${pendingStopClass.class_name} will be blocked immediately. Attendance already recorded in this session will be preserved.`
            : "New kiosk scans will be blocked for this class."
        }
        confirmLabel="Stop session"
        busyLabel="Stopping..."
        destructive
        isConfirming={
          pendingStopClass !== null &&
          updatingClassId === pendingStopClass.class_id
        }
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setPendingStopClass(null);
          }
        }}
        onConfirm={() => {
          if (pendingStopClass) {
            void handleStopSession(pendingStopClass);
          }
        }}
      />
    </section>
  );
}
