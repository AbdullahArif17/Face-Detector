"use client";

import { Download, Pencil, Power, PowerOff, RefreshCcw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError } from "@/components/api-error";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { KioskSettings } from "@/components/kiosk-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { getApiErrorMessage } from "@/lib/errors";
import { canManageAttendanceSessions } from "@/lib/permissions";
import {
  exportStaffAttendanceHistory,
  getAllEmployees,
  getActiveAttendanceSession,
  getStaffAttendanceHistory,
  getStaffAttendanceToday,
  startAttendanceSession,
  stopAttendanceSession,
  updateStaffManualAttendance,
  type AttendanceSession,
  type AttendanceSessionStatus,
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

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  timeStyle: "short",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

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
          : status === "absent"
            ? "bg-red-50 text-red-700"
            : status === "excused"
              ? "bg-slate-100 text-slate-600"
              : "bg-yellow-50 text-yellow-700",
      )}
    >
      {status}
    </span>
  );
}

function StaffTable({
  records,
  isLoading,
  canEdit,
  onEdit,
}: Readonly<{
  records: StaffAttendanceRecord[];
  isLoading: boolean;
  canEdit: boolean;
  onEdit: (record: StaffAttendanceRecord) => void;
}>) {
  const columnCount = canEdit ? 6 : 5;

  return (
    <>
      <div className="grid gap-3 md:hidden">
        {isLoading ? (
          <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">
            Loading staff attendance...
          </div>
        ) : null}
        {!isLoading && records.length === 0 ? (
          <div className="rounded-lg border bg-card p-5 text-center">
            <p className="font-medium">No staff attendance records</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Records will appear here after a staff member scans at the kiosk
              or a team member adds attendance manually.
            </p>
          </div>
        ) : null}
        {records.map((record) => (
          <article
            className="rounded-lg border bg-card p-4"
            key={`${record.employee_id}-${record.attendance_date}-${record.attendance_id ?? "absent"}-mobile`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{record.employee_name}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {record.designation ?? "Staff"}
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
        <table className="min-w-[820px] w-full text-left text-sm">
          <thead className="border-b bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Employee</th>
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
                  Loading staff attendance...
                </td>
              </tr>
            ) : null}

            {!isLoading && records.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-muted-foreground" colSpan={columnCount}>
                  No staff attendance records found.
                </td>
              </tr>
            ) : null}

            {records.map((record) => (
              <tr
                className="border-b last:border-0"
                key={`${record.employee_id}-${record.attendance_date}-${record.attendance_id ?? "absent"}`}
              >
                <td className="px-4 py-3 font-medium">
                  <p>{record.employee_name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {record.designation ?? "Staff"}
                    {record.department ? ` · ${record.department}` : ""}
                  </p>
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

export default function StaffAttendancePage() {
  const { user } = useAuth();
  const canManageSessions = canManageAttendanceSessions(user);
  const canEditAttendance = canManageSessions;

  const [todayRecords, setTodayRecords] = useState<StaffAttendanceRecord[]>([]);
  const [globalSession, setGlobalSession] = useState<AttendanceSessionStatus | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const [isTodayLoading, setIsTodayLoading] = useState(true);
  const [isSessionLoading, setIsSessionLoading] = useState(true);

  const [isUpdatingSession, setIsUpdatingSession] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [sessionMessage, setSessionMessage] = useState("");
  const [sessionMessageIsError, setSessionMessageIsError] = useState(false);

  const [editState, setEditState] = useState<StaffEditState | null>(null);
  const [pendingStopSession, setPendingStopSession] = useState<AttendanceSession | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [historyStartDate, setHistoryStartDate] = useState("");
  const [historyEndDate, setHistoryEndDate] = useState("");
  const [historyEmployeeId, setHistoryEmployeeId] = useState("");
  const [historyStatus, setHistoryStatus] = useState("");
  const [historyRecords, setHistoryRecords] = useState<StaffAttendanceRecord[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyMessage, setHistoryMessage] = useState("");

  const loadToday = useCallback(async (): Promise<void> => {
    setIsTodayLoading(true);
    try {
      const records = await getStaffAttendanceToday();
      setTodayRecords(records);
      setHasError(false);
    } catch {
      setHasError(true);
    } finally {
      setIsTodayLoading(false);
    }
  }, []);

  const loadGlobalSession = useCallback(async (): Promise<void> => {
    setIsSessionLoading(true);
    try {
      const status = await getActiveAttendanceSession();
      setGlobalSession(status);
      setHasError(false);
    } catch {
      setHasError(true);
    } finally {
      setIsSessionLoading(false);
    }
  }, []);

  useEffect(() => {
    void getAllEmployees().then((records) => setEmployees(records)).catch(() => {});
  }, []);

  useEffect(() => {
    void Promise.resolve().then(async () => {
      await Promise.all([loadToday(), loadGlobalSession()]);
    });
  }, [loadToday, loadGlobalSession]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadToday();
      void loadGlobalSession();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [loadGlobalSession, loadToday]);

  const summary = useMemo(
    () => ({
      present: todayRecords.filter((record) => record.status === "present").length,
      absent: todayRecords.filter((record) => record.status === "absent").length,
      excused: todayRecords.filter((record) => record.status === "excused").length,
    }),
    [todayRecords],
  );

  async function handleRefresh(): Promise<void> {
    await Promise.all([loadToday(), loadGlobalSession()]);
  }

  async function handleStartSession(sessionType: "check_in" | "check_out"): Promise<void> {
    setIsUpdatingSession(true);
    setSessionMessage("");
    setSessionMessageIsError(false);
    try {
      await startAttendanceSession(sessionType);
      setSessionMessage(`Global ${sessionType.replace("_", "-")} session started.`);
      await Promise.all([loadGlobalSession(), loadToday()]);
    } catch (error) {
      setSessionMessageIsError(true);
      setSessionMessage(
        getApiErrorMessage(error, `Unable to start ${sessionType.replace("_", "-")} session.`),
      );
    } finally {
      setIsUpdatingSession(false);
    }
  }

  async function handleStopSession(): Promise<void> {
    if (!pendingStopSession) {
      return;
    }

    setIsUpdatingSession(true);
    setSessionMessage("");
    setSessionMessageIsError(false);
    try {
      await stopAttendanceSession(pendingStopSession.id);
      setSessionMessage("Attendance session stopped.");
      await Promise.all([loadGlobalSession(), loadToday()]);
    } catch (error) {
      setSessionMessageIsError(true);
      setSessionMessage(
        getApiErrorMessage(error, "Unable to stop attendance session."),
      );
    } finally {
      setIsUpdatingSession(false);
      setPendingStopSession(null);
    }
  }

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
      await updateStaffManualAttendance({
        attendance_id: editState.record.attendance_id,
        employee_id: editState.record.employee_id,
        attendance_date: editState.record.attendance_date,
        status: editState.status,
        check_in_time: editState.status === "present" ? editState.checkInTime : null,
        check_out_time:
          editState.status === "present" && editState.checkOutTime
            ? editState.checkOutTime
            : null,
      });
      setEditState(null);
      await loadToday();
    } catch (error) {
      setEditState({
        ...editState,
        error: getApiErrorMessage(error, "Unable to save attendance."),
      });
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function handleLoadHistory(): Promise<void> {
    setIsHistoryLoading(true);
    setHistoryMessage("");
    try {
      const records = await getStaffAttendanceHistory({
        startDate: historyStartDate || undefined,
        endDate: historyEndDate || undefined,
        employeeId: historyEmployeeId
          ? Number.parseInt(historyEmployeeId, 10)
          : undefined,
        status: historyStatus || undefined,
        perPage: 100,
      });
      setHistoryRecords(records);
      setHasError(false);
    } catch (error) {
      setHistoryMessage(getApiErrorMessage(error, "Unable to load history."));
    } finally {
      setIsHistoryLoading(false);
    }
  }

  async function handleExportHistory(): Promise<void> {
    setHistoryMessage("");
    try {
      const blob = await exportStaffAttendanceHistory({
        startDate: historyStartDate || undefined,
        endDate: historyEndDate || undefined,
        employeeId: historyEmployeeId
          ? Number.parseInt(historyEmployeeId, 10)
          : undefined,
        status: historyStatus || undefined,
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "staff-attendance.csv";
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setHistoryMessage(getApiErrorMessage(error, "Unable to export history."));
    }
  }

  const isCheckInActive = Boolean(globalSession?.active_check_in_session);
  const isCheckOutActive = Boolean(globalSession?.active_check_out_session);

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-balance sm:text-3xl">
            Staff Attendance
          </h1>
          <p className="mt-2 text-muted-foreground text-pretty">
            Live attendance for teachers and staff, with manual corrections and
            CSV export.
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

      <KioskSettings />

      <div className="space-y-4 rounded-lg border bg-card p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Global attendance session</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The same session used for students: kiosk scans mark both
              students and staff. Open sessions automatically expire at the end
              of the school day.
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
            Loading session status...
          </p>
        ) : null}

        {!isSessionLoading && globalSession && (
          <div className="grid gap-4 md:grid-cols-2 lg:max-w-3xl">
            <article
              className={cn(
                "space-y-3 rounded-lg border p-4",
                isCheckInActive && "border-primary ring-1 ring-primary/20",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">Check-in Session</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Students and staff arriving at school
                  </p>
                </div>
                <span
                  className={cn(
                    "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                    isCheckInActive
                      ? "bg-green-100 text-green-700"
                      : "bg-slate-100 text-slate-600",
                  )}
                >
                  {isCheckInActive ? "ON" : "OFF"}
                </span>
              </div>

              <p className="min-h-10 text-sm text-muted-foreground">
                {isCheckInActive && globalSession.active_check_in_session
                  ? `Started ${dateTimeFormatter.format(
                      new Date(globalSession.active_check_in_session.started_at),
                    )}`
                  : "Kiosk check-in scans are currently blocked."}
              </p>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={isCheckInActive ? "outline" : "default"}
                  disabled={!canManageSessions || isUpdatingSession}
                  className="w-full gap-2"
                  onClick={() =>
                    isCheckInActive
                      ? setPendingStopSession(globalSession.active_check_in_session)
                      : void handleStartSession("check_in")
                  }
                >
                  {isCheckInActive ? (
                    <PowerOff aria-hidden="true" className="size-4" />
                  ) : (
                    <Power aria-hidden="true" className="size-4" />
                  )}
                  {isUpdatingSession
                    ? isCheckInActive
                      ? "Stopping..."
                      : "Starting..."
                    : isCheckInActive
                      ? "Turn OFF"
                      : "Turn ON"}
                </Button>
              </div>
            </article>

            <article
              className={cn(
                "space-y-3 rounded-lg border p-4",
                isCheckOutActive && "border-primary ring-1 ring-primary/20",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">Check-out Session</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Students and staff leaving school
                  </p>
                </div>
                <span
                  className={cn(
                    "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                    isCheckOutActive
                      ? "bg-green-100 text-green-700"
                      : "bg-slate-100 text-slate-600",
                  )}
                >
                  {isCheckOutActive ? "ON" : "OFF"}
                </span>
              </div>

              <p className="min-h-10 text-sm text-muted-foreground">
                {isCheckOutActive && globalSession.active_check_out_session
                  ? `Started ${dateTimeFormatter.format(
                      new Date(globalSession.active_check_out_session.started_at),
                    )}`
                  : "Kiosk check-out scans are currently blocked."}
              </p>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={isCheckOutActive ? "outline" : "default"}
                  disabled={!canManageSessions || isUpdatingSession}
                  className="w-full gap-2"
                  onClick={() =>
                    isCheckOutActive
                      ? setPendingStopSession(globalSession.active_check_out_session)
                      : void handleStartSession("check_out")
                  }
                >
                  {isCheckOutActive ? (
                    <PowerOff aria-hidden="true" className="size-4" />
                  ) : (
                    <Power aria-hidden="true" className="size-4" />
                  )}
                  {isUpdatingSession
                    ? isCheckOutActive
                      ? "Stopping..."
                      : "Starting..."
                    : isCheckOutActive
                      ? "Turn OFF"
                      : "Turn ON"}
                </Button>
              </div>
            </article>
          </div>
        )}
      </div>

      {hasError ? (
        <ApiError
          onRetry={() => void handleRefresh()}
          isRetrying={isTodayLoading || isSessionLoading}
        />
      ) : null}

      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">Present</p>
            <p className="mt-2 text-2xl font-bold text-green-700">
              {summary.present}
            </p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">Absent</p>
            <p className="mt-2 text-2xl font-bold text-red-700">
              {summary.absent}
            </p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">Excused</p>
            <p className="mt-2 text-2xl font-bold text-slate-700">
              {summary.excused}
            </p>
          </div>
        </div>
        <StaffTable
          records={todayRecords}
          isLoading={isTodayLoading}
          canEdit={canEditAttendance}
          onEdit={handleEditRecord}
        />
      </div>

      <div className="space-y-4 rounded-lg border bg-card p-4">
        <div>
          <h2 className="text-lg font-semibold">Attendance history</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Filter past staff attendance and download it as a CSV spreadsheet.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="staff-history-start">
              From date
            </label>
            <Input
              id="staff-history-start"
              type="date"
              value={historyStartDate}
              onChange={(event) => setHistoryStartDate(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="staff-history-end">
              To date
            </label>
            <Input
              id="staff-history-end"
              type="date"
              value={historyEndDate}
              onChange={(event) => setHistoryEndDate(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="staff-history-employee">
              Employee
            </label>
            <select
              id="staff-history-employee"
              value={historyEmployeeId}
              onChange={(event) => setHistoryEmployeeId(event.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">All employees</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                  {employee.designation ? ` · ${employee.designation}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="staff-history-status">
              Status
            </label>
            <select
              id="staff-history-status"
              value={historyStatus}
              onChange={(event) => setHistoryStatus(event.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">All statuses</option>
              <option value="present">Present</option>
              <option value="absent">Absent</option>
              <option value="excused">Excused</option>
            </select>
          </div>
        </div>
        {historyMessage ? (
          <p
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            role="alert"
          >
            {historyMessage}
          </p>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            disabled={isHistoryLoading}
            onClick={() => void handleLoadHistory()}
          >
            <RefreshCcw aria-hidden="true" className="size-4" />
            {isHistoryLoading ? "Loading..." : "Load history"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => void handleExportHistory()}
          >
            <Download aria-hidden="true" className="size-4" />
            Export CSV
          </Button>
        </div>
        {historyRecords.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border">
            <table className="min-w-[800px] w-full text-left text-sm">
              <thead className="border-b bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Employee</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Check-in</th>
                  <th className="px-4 py-3 font-medium">Check-out</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Hours</th>
                </tr>
              </thead>
              <tbody>
                {historyRecords.map((record) => (
                  <tr className="border-b last:border-0" key={`${record.attendance_id ?? record.employee_id}-${record.attendance_date}`}>
                    <td className="px-4 py-3 font-medium">
                      <p>{record.employee_name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {record.designation ?? "Staff"}
                      </p>
                    </td>
                    <td className="px-4 py-3">{record.attendance_date}</td>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {editState ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-staff-attendance-title"
        >
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-lg border bg-background p-5 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold" id="edit-staff-attendance-title">
                  Edit attendance
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {editState.record.employee_name} ·{" "}
                  {editState.record.designation ?? "Staff"}
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
                {isSavingEdit ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingStopSession)}
        title="Stop attendance session?"
        description={
          pendingStopSession
            ? `Are you sure you want to stop the ${pendingStopSession.session_type.replace("_", "-")} session? Kiosk scans for this session will be blocked.`
            : ""
        }
        confirmLabel="Stop session"
        busyLabel="Stopping..."
        destructive
        isConfirming={isUpdatingSession}
        onOpenChange={(open) => !open && setPendingStopSession(null)}
        onConfirm={() => {
          if (pendingStopSession) {
            void handleStopSession();
          }
        }}
      />
    </section>
  );
}