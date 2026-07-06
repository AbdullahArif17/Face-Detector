"use client";

import { Download, RefreshCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError } from "@/components/api-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  exportAttendanceHistory,
  getActiveAttendanceSession,
  getAttendanceHistory,
  getAttendanceToday,
  getStudents,
  startAttendanceSession,
  stopAttendanceSession,
  type AttendanceSession,
  type AttendanceDashboardRecord,
  type Student,
} from "@/lib/api";

type AttendanceTab = "today" | "history";

interface ClassOption {
  branchId: number;
  label: string;
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
}: Readonly<{
  records: AttendanceDashboardRecord[];
  isLoading: boolean;
}>) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="min-w-[760px] w-full text-left text-sm">
        <thead className="border-b bg-muted/50 text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Student Name</th>
            <th className="px-4 py-3 font-medium">Class</th>
            <th className="px-4 py-3 font-medium">Check-in</th>
            <th className="px-4 py-3 font-medium">Check-out</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Working Hours</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td className="px-4 py-6 text-muted-foreground" colSpan={6}>
                Loading attendance...
              </td>
            </tr>
          ) : null}

          {!isLoading && records.length === 0 ? (
            <tr>
              <td className="px-4 py-6 text-muted-foreground" colSpan={6}>
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AttendancePage() {
  const [activeTab, setActiveTab] = useState<AttendanceTab>("today");
  const [todayRecords, setTodayRecords] = useState<AttendanceDashboardRecord[]>(
    [],
  );
  const [historyRecords, setHistoryRecords] = useState<
    AttendanceDashboardRecord[]
  >([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [activeSession, setActiveSession] = useState<AttendanceSession | null>(
    null,
  );
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [startDate, setStartDate] = useState(daysAgoInputValue(7));
  const [endDate, setEndDate] = useState(todayInputValue());
  const [isTodayLoading, setIsTodayLoading] = useState(true);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isSessionLoading, setIsSessionLoading] = useState(false);
  const [isSessionUpdating, setIsSessionUpdating] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [sessionMessage, setSessionMessage] = useState("");

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
        branchId: selectedClassId
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

  const classOptions = useMemo<ClassOption[]>(() => {
    const classesById = new Map<number, ClassOption>();
    for (const student of students) {
      if (!classesById.has(student.class_id)) {
        classesById.set(student.class_id, {
          branchId: student.class_id,
          label: `${student.grade}-${student.section}`,
        });
      }
    }
    return [...classesById.values()].sort((first, second) =>
      first.label.localeCompare(second.label),
    );
  }, [students]);

  const filteredStudents = useMemo(() => {
    if (!selectedClassId) {
      return students;
    }
    const classId = Number.parseInt(selectedClassId, 10);
    return students.filter((student) => student.class_id === classId);
  }, [selectedClassId, students]);

  const loadSessionStatus = useCallback(async (): Promise<void> => {
    setSessionMessage("");
    if (!selectedClassId) {
      setActiveSession(null);
      return;
    }

    setIsSessionLoading(true);
    try {
      const sessionStatus = await getActiveAttendanceSession(
        Number.parseInt(selectedClassId, 10),
      );
      setActiveSession(sessionStatus.active_session);
      setHasError(false);
    } catch {
      setHasError(true);
    } finally {
      setIsSessionLoading(false);
    }
  }, [selectedClassId]);

  useEffect(() => {
    let isCancelled = false;

    void Promise.resolve().then(async () => {
      try {
        const [, studentRecords] = await Promise.all([
          loadToday(),
          getStudents({ status: "active" }),
        ]);
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
  }, [loadToday]);

  useEffect(() => {
    void Promise.resolve().then(loadSessionStatus);
  }, [loadSessionStatus]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadToday();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [loadToday]);

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

  async function handleStartSession(): Promise<void> {
    if (!selectedClassId) {
      setSessionMessage("Select a class before starting attendance.");
      return;
    }

    setIsSessionUpdating(true);
    setSessionMessage("");
    try {
      const session = await startAttendanceSession(
        Number.parseInt(selectedClassId, 10),
      );
      setActiveSession(session);
      setSessionMessage("Attendance session started for this class.");
      await loadToday();
    } catch {
      setHasError(true);
      setSessionMessage("Unable to start attendance for this class.");
    } finally {
      setIsSessionUpdating(false);
    }
  }

  async function handleStopSession(): Promise<void> {
    if (!activeSession) {
      setSessionMessage("No active attendance session for this class.");
      return;
    }

    setIsSessionUpdating(true);
    setSessionMessage("");
    try {
      await stopAttendanceSession(activeSession.id);
      setActiveSession(null);
      setSessionMessage("Attendance session stopped for this class.");
      await loadToday();
    } catch {
      setHasError(true);
      setSessionMessage("Unable to stop attendance for this class.");
    } finally {
      setIsSessionUpdating(false);
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
          onClick={() => void loadToday()}
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

      <div className="grid gap-4 rounded-lg border bg-card p-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="grid gap-3 md:grid-cols-[minmax(220px,320px)_1fr] md:items-end">
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="class-filter">
              Class
            </label>
            <select
              id="class-filter"
              value={selectedClassId}
              onChange={(event) => handleClassChange(event.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Select class</option>
              {classOptions.map((classOption) => (
                <option key={classOption.branchId} value={classOption.branchId}>
                  {classOption.label}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <p className="font-medium">
              {isSessionLoading
                ? "Checking attendance session..."
                : activeSession
                  ? "Attendance is active for this class"
                  : "Attendance is stopped for this class"}
            </p>
            <p className="mt-1 text-muted-foreground">
              {activeSession
                ? `Started ${dateTimeFormatter.format(new Date(activeSession.started_at))}`
                : "Start a session before students can mark attendance from the kiosk."}
            </p>
            {sessionMessage ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {sessionMessage}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            disabled={
              !selectedClassId ||
              isSessionLoading ||
              isSessionUpdating ||
              activeSession !== null
            }
            onClick={() => void handleStartSession()}
          >
            {isSessionUpdating && activeSession === null
              ? "Starting..."
              : "Start Attendance"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={
              !selectedClassId ||
              isSessionLoading ||
              isSessionUpdating ||
              activeSession === null
            }
            onClick={() => void handleStopSession()}
          >
            {isSessionUpdating && activeSession !== null
              ? "Stopping..."
              : "Stop Attendance"}
          </Button>
        </div>
      </div>

      {hasError ? <ApiError /> : null}

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
          <AttendanceTable records={todayRecords} isLoading={isTodayLoading} />
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
          />
        </div>
      )}
    </section>
  );
}
