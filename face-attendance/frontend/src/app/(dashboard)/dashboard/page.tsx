"use client";

import {
  Clock3,
  MessageCircle,
  ShieldCheck,
  UserCheck,
  Users,
  UserX,
  Activity,
  ScanFace,
  Download
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError } from "@/components/api-error";
import { StudentAvatar } from "@/components/students/StudentAvatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import {
  getAttendanceToday,
  getSchoolSettings,
  getStudents,
  getAllEmployees,
  launchAttendanceKiosk,
  updateSchoolSettings,
  type AttendanceDashboardRecord,
  type SchoolSettings,
  type Student,
  type Employee,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/errors";
import { canManageKiosk } from "@/lib/permissions";


function isValidSchoolPhone(phone: string): boolean {
  const normalized = phone.trim().replace(/[\s\-()+]/g, "");
  return /^92\d{10}$/.test(normalized) || /^03\d{9}$/.test(normalized);
}

function getKioskBaseUrl(): string {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_KIOSK_BASE_URL?.trim();
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/$/, "");
  }
  if (typeof window === "undefined") {
    return "";
  }
  return window.location.origin;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [todayRecords, setTodayRecords] = useState<AttendanceDashboardRecord[]>(
    [],
  );
  const [schoolSettings, setSchoolSettings] = useState<SchoolSettings | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [schoolContactInput, setSchoolContactInput] = useState("");
  const [hrEmailInput, setHrEmailInput] = useState("");
  const [defaultSessionDurationInput, setDefaultSessionDurationInput] = useState("");
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(
    null,
  );
  const [launchingSession, setLaunchingSession] = useState<
    "check_in" | "check_out" | null
  >(null);
  const [launchMessage, setLaunchMessage] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);

  // APK Download state
  const apkDownloadUrl = "/app-release-unsigned.apk";
  const apkVersion = "v1.0.5";
  const apkSize = 10350596; // 10.3MB
  const isLoadingApk = false;
  const apkError = null;

  const hasAdminAccess = canManageKiosk(user);

  const loadDashboard = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      const settingsRequest =
        user && hasAdminAccess
          ? getSchoolSettings(user.company_id).catch(() => null)
          : Promise.resolve(null);
      const [studentRecords, employeeRecords, attendanceRecords, settingsResponse] =
        await Promise.all([
          getStudents({ status: "active" }),
          getAllEmployees(),
          getAttendanceToday(),
          settingsRequest,
        ]);

      setStudents(studentRecords);
      setEmployees(employeeRecords);
      setTodayRecords(attendanceRecords);
      setSchoolSettings(settingsResponse);
      setSchoolContactInput(settingsResponse?.school_contact ?? "");
      setHrEmailInput(settingsResponse?.hr_email ?? "");
      setDefaultSessionDurationInput(settingsResponse?.default_session_duration_minutes?.toString() ?? "60");
      setHasError(false);
    } catch {
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, [hasAdminAccess, user]);

  useEffect(() => {
    void Promise.resolve().then(loadDashboard);
  }, [loadDashboard]);



  const attendanceSummary = useMemo(
    () => ({
      present: todayRecords.filter((record) => record.status !== "absent").length,
      absent: todayRecords.filter((record) => record.status === "absent").length,
      late: todayRecords.filter((record) => record.status === "late").length,
    }),
    [todayRecords],
  );

  // Teacher/Staff stats
  const teachers = useMemo(
    () =>
      employees.filter((e) =>
        e.designation?.toLowerCase().includes("teacher"),
      ),
    [employees],
  );
  const staff = useMemo(
    () =>
      employees.filter(
        (e) => !e.designation?.toLowerCase().includes("teacher"),
      ),
    [employees],
  );

  const stats = useMemo(
    () =>
      [
        {
          title: "Total Students",
          value: students.length,
          icon: Users,
          color: "text-blue-500",
          bgColor: "bg-blue-500/10",
        },
        {
          title: "Teachers",
          value: teachers.length,
          icon: UserCheck,
          color: "text-indigo-500",
          bgColor: "bg-indigo-500/10",
        },
        {
          title: "Staff",
          value: staff.length,
          icon: ShieldCheck,
          color: "text-violet-500",
          bgColor: "bg-violet-500/10",
        },
        {
          title: "Present Today",
          value: attendanceSummary.present,
          icon: UserCheck,
          color: "text-emerald-500",
          bgColor: "bg-emerald-500/10",
        },
        {
          title: "Absent Today",
          value: attendanceSummary.absent,
          icon: UserX,
          color: "text-rose-500",
          bgColor: "bg-rose-500/10",
        },
        {
          title: "Late Arrivals",
          value: attendanceSummary.late,
          icon: Clock3,
          color: "text-amber-500",
          bgColor: "bg-amber-500/10",
        },
      ] as const,
    [attendanceSummary, students, teachers, staff],
  );

  const visibleStudents = students.slice(0, 12);
  const enrolledCount = students.filter((student) => student.has_face_enrolled).length;
  const enrollmentPercentage = students.length
    ? Math.round((enrolledCount / students.length) * 100)
    : 0;

  const teachersEnrolled = teachers.filter((t) => t.has_face_enrolled).length;
  const staffEnrolled = staff.filter((s) => s.has_face_enrolled).length;

  const classSummaries = useMemo(() => {
    const summaries = new Map<
      number,
      { label: string; present: number; absent: number; late: number }
    >();
    for (const record of todayRecords) {
      if (record.class_id == null) continue;
      const current = summaries.get(record.class_id) ?? {
        label: `${record.grade ?? ""}-${record.section ?? ""}`,
        present: 0,
        absent: 0,
        late: 0,
      };
      if (record.status === "absent") {
        current.absent += 1;
      } else {
        current.present += 1;
        if (record.status === "late") {
          current.late += 1;
        }
      }
      summaries.set(record.class_id, current);
    }
    return [...summaries.entries()].sort((first, second) =>
      first[1].label.localeCompare(second[1].label),
    );
  }, [todayRecords]);



  async function handleSaveSettings(): Promise<void> {
    if (!user) return;
    setSettingsError(null);
    const contactTrimmed = schoolContactInput.trim();
    
    if (contactTrimmed && !isValidSchoolPhone(contactTrimmed)) {
      setSettingsError(
        "Invalid contact phone format. Must be 923001234567 or 03001234567.",
      );
      return;
    }

    setIsSavingSettings(true);
    try {
      await updateSchoolSettings(user.company_id, {
        school_contact: contactTrimmed || null,
        hr_email: hrEmailInput.trim() || null,
        default_session_duration_minutes: defaultSessionDurationInput ? parseInt(defaultSessionDurationInput, 10) : 60,
      });
      setSchoolContactInput(contactTrimmed);
      setHrEmailInput(hrEmailInput.trim());
      setDefaultSessionDurationInput(defaultSessionDurationInput);
    } catch (error) {
      setSettingsError(
        getApiErrorMessage(error, "Failed to save the settings."),
      );
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function handleLaunchKiosk(
    sessionType: "check_in" | "check_out",
  ): Promise<void> {
    if (!user) {
      return;
    }
    setLaunchingSession(sessionType);
    setLaunchError(null);
    setLaunchMessage(null);
    try {
      const { api_key } = await launchAttendanceKiosk(sessionType);
      const baseUrl = getKioskBaseUrl();
      const kioskUrl = `${baseUrl}/kiosk?key=${encodeURIComponent(
        api_key,
      )}&action=${sessionType}`;
      window.open(kioskUrl, "_blank", "noopener,noreferrer");
      setLaunchMessage(
        sessionType === "check_in"
          ? "Check-in session started and the kiosk opened in a new tab."
          : "Check-out session started and the kiosk opened in a new tab.",
      );
    } catch (error) {
      setLaunchError(getApiErrorMessage(error, "Could not launch the kiosk."));
    } finally {
      setLaunchingSession(null);
    }
  }

  if (hasError) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <ApiError onRetry={() => void loadDashboard()} isRetrying={isLoading} />
      </div>
    );
  }

  return (
    <section className="mx-auto max-w-7xl animate-fade-in space-y-8">
      {/* Header Section */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Dashboard
          </h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            Welcome back, <span className="font-medium text-foreground">{user?.name}</span>. Here is your overview for today.
          </p>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 md:mt-0">
          <Button asChild variant="outline" className="shadow-sm">
            <Link href="/reports">View Reports</Link>
          </Button>
          {hasAdminAccess ? (
            <>
              <Button
                type="button"
                disabled={launchingSession !== null}
                onClick={() => void handleLaunchKiosk("check_in")}
                className="shadow-sm bg-primary text-primary-foreground"
              >
                {launchingSession === "check_in" ? "Launching..." : "Launch Check-in Kiosk"}
              </Button>
              <Button
                type="button"
                disabled={launchingSession !== null}
                onClick={() => void handleLaunchKiosk("check_out")}
                className="shadow-sm bg-primary text-primary-foreground"
              >
                {launchingSession === "check_out"
                  ? "Launching..."
                  : "Launch Check-out Kiosk"}
              </Button>
            </>
          ) : (
            <Button asChild className="shadow-sm bg-primary text-primary-foreground">
              <Link href="/attendance">Open Attendance</Link>
            </Button>
          )}
        </div>
      </div>

      {launchMessage ? (
        <p
          className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-700"
          role="status"
        >
          {launchMessage}
        </p>
      ) : null}
      {launchError ? (
        <p
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
          role="alert"
        >
          {launchError}
        </p>
      ) : null}

      {/* Stats Grid */}
      <div className="grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ title, value, icon: Icon, color, bgColor }) => (
          <Card key={title} className="card-hover stat-stripe border-none shadow-md overflow-hidden bg-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
              <div className={`rounded-lg p-2 ${bgColor}`}>
                <Icon aria-hidden="true" className={`size-5 ${color}`} />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-8 w-20 skeleton mt-1" />
              ) : (
                <div className="text-3xl font-bold animate-count-up">{value}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        {/* Main Content Area */}
        <div className="space-y-6">
          <Card className="card-hover overflow-hidden">
            <CardHeader className="border-b bg-muted/20 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="size-5 text-primary" />
                    Class Attendance Today
                  </CardTitle>
                  <CardDescription className="mt-1.5">
                    Real-time overview of student presence across all active classes.
                  </CardDescription>
                </div>
                <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                  <Link href="/attendance">Manage sessions</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-6">
                  <div className="skeleton h-32 w-full" />
                </div>
              ) : classSummaries.length ? (
                <div className="grid divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                  {classSummaries.map(([classId, summary]) => (
                    <div key={classId} className="p-6 transition-colors hover:bg-muted/10">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-lg">{summary.label}</p>
                        <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10 dark:bg-blue-500/10 dark:text-blue-400 dark:ring-blue-500/20">
                          {summary.present + summary.absent} total
                        </span>
                      </div>
                      <div className="mt-4 flex gap-4 text-sm font-medium">
                        <div className="flex flex-col">
                          <span className="text-muted-foreground text-xs uppercase tracking-wider">Present</span>
                          <span className="text-emerald-600 text-lg">{summary.present}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-muted-foreground text-xs uppercase tracking-wider">Absent</span>
                          <span className="text-rose-600 text-lg">{summary.absent}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-muted-foreground text-xs uppercase tracking-wider">Late</span>
                          <span className="text-amber-600 text-lg">{summary.late}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-12 text-center">
                  <div className="rounded-full bg-muted p-3">
                    <Users className="size-6 text-muted-foreground" />
                  </div>
                  <p className="mt-4 text-sm font-medium text-foreground">No active classes</p>
                  <p className="text-sm text-muted-foreground">Class data will appear here once students check in.</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="card-hover">
            <CardHeader>
              <CardTitle>Recent Students</CardTitle>
              <CardDescription>
                Recently enrolled or active student profiles.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="skeleton h-16 w-full rounded-lg" />
                  ))}
                </div>
              ) : visibleStudents.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {visibleStudents.map((student) => (
                    <div
                      key={student.id}
                      className="group flex items-center gap-3 rounded-lg border bg-card p-3 transition-all hover:border-primary/30 hover:shadow-sm"
                    >
                      <StudentAvatar student={student} className="size-12 ring-2 ring-transparent transition-all group-hover:ring-primary/20" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium transition-colors group-hover:text-primary">
                          {student.student_name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {student.grade}-{student.section}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No students found in the system.</p>
              )}
            </CardContent>
            {visibleStudents.length > 0 && (
              <CardFooter className="justify-center border-t pt-4">
                <Button variant="link" asChild className="text-sm">
                  <Link href="/students">View all students</Link>
                </Button>
              </CardFooter>
            )}
          </Card>
        </div>

        {/* Sidebar / Configuration Area */}
        <div className="space-y-6">
          <Card className="card-hover border-primary/20 bg-gradient-to-b from-primary/5 to-transparent relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <ShieldCheck className="size-24" />
            </div>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ScanFace className="size-5 text-primary" />
                AI Enrollment Status
              </CardTitle>
              <CardDescription>
                System readiness for automated facial recognition.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  <div className="skeleton h-4 w-3/4" />
                  <div className="skeleton h-2 w-full rounded-full" />
                </div>
              ) : (
                <>
                  <div className="flex items-end justify-between mb-2">
                    <p className="text-2xl font-bold text-foreground">
                      {enrollmentPercentage}%
                    </p>
                    <p className="text-sm text-muted-foreground mb-1">
                      {enrolledCount} of {students.length} students
                    </p>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-muted/60 ring-1 ring-inset ring-muted">
                    <div
                      className="h-full rounded-full bg-gradient-brand transition-all duration-1000 ease-out relative"
                      style={{ width: `${enrollmentPercentage}%` }}
                    >
                      <div className="absolute inset-0 bg-white/20 w-full animate-[shimmer_2s_infinite]" />
                    </div>
                  </div>
                  <p className="mt-4 text-xs text-muted-foreground">
                    Students must be enrolled to use kiosk mode. Go to the Students page to enroll missing profiles.
                  </p>
                  <div className="mt-6 grid gap-4 sm:grid-cols-3">
                    <div className="rounded-lg border bg-muted/10 p-3">
                      <p className="text-xs text-muted-foreground">Teachers</p>
                      <p className="text-lg font-bold text-indigo-600">
                        {teachersEnrolled} / {teachers.length}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-muted/10 p-3">
                      <p className="text-xs text-muted-foreground">Staff</p>
                      <p className="text-lg font-bold text-violet-600">
                        {staffEnrolled} / {staff.length}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-muted/10 p-3">
                      <p className="text-xs text-muted-foreground">Total Employees</p>
                      <p className="text-lg font-bold text-foreground">
                        {teachersEnrolled + staffEnrolled} / {employees.length}
                      </p>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="card-hover">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="size-5 text-indigo-500" />
                  Notifications
                </CardTitle>
                <CardDescription className="mt-1">
                  Messaging and notification settings.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">

                {hasAdminAccess ? (
                  <form
                    className="grid gap-4 rounded-lg border bg-muted/10 p-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleSaveSettings();
                    }}
                  >
                    <div className="space-y-1.5">
                      <Label htmlFor="school-contact" className="text-xs font-semibold text-foreground">
                        Public School Contact
                      </Label>
                      <p className="text-[11px] text-muted-foreground leading-tight">
                        Display number shown in parent messages.
                      </p>
                      <Input
                        id="school-contact"
                        value={schoolContactInput}
                        disabled={isSavingSettings}
                        placeholder="Optional"
                        className="h-9 text-sm"
                        onChange={(event) => {
                          setSchoolContactInput(event.target.value);
                          setSettingsError(null);
                        }}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="hr-email" className="text-xs font-semibold text-foreground">
                        HR Admin Email
                      </Label>
                      <p className="text-[11px] text-muted-foreground leading-tight">
                        Email address for staff and teacher alerts.
                      </p>
                      <Input
                        id="hr-email"
                        type="email"
                        value={hrEmailInput}
                        disabled={isSavingSettings}
                        placeholder="Optional"
                        className="h-9 text-sm"
                        onChange={(event) => {
                          setHrEmailInput(event.target.value);
                          setSettingsError(null);
                        }}
                      />
                    </div>

                    {settingsError ? (
                      <p className="text-xs font-medium text-destructive bg-destructive/10 p-2 rounded">{settingsError}</p>
                    ) : null}

                    <div className="space-y-1.5">
                      <Label htmlFor="session-duration" className="text-xs font-semibold text-foreground">
                        Default Session Duration (Minutes)
                      </Label>
                      <p className="text-[11px] text-muted-foreground leading-tight">
                        How long an attendance session should run by default before expiring.
                      </p>
                      <Input
                        id="session-duration"
                        type="number"
                        min="1"
                        value={defaultSessionDurationInput}
                        disabled={isSavingSettings}
                        placeholder="60"
                        className="h-9 text-sm"
                        onChange={(event) => {
                          setDefaultSessionDurationInput(event.target.value);
                          setSettingsError(null);
                        }}
                      />
                    </div>

                    <div className="flex justify-end">
                      <Button
                        type="submit"
                        size="sm"
                        disabled={isSavingSettings}
                        className="h-8"
                      >
                        {isSavingSettings ? "Saving settings..." : "Save Settings"}
                      </Button>
                    </div></form>
                ) : null}
              </div>
            </CardContent>
          </Card>


        </div>
      </div>
    </section>
  );
}
