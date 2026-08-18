"use client";

import {
  Clock3,
  MessageCircle,
  ShieldCheck,
  UserCheck,
  Users,
  UserX,
  TrendingUp,
  Activity,
  ScanFace
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
  launchAttendanceKiosk,
  updateSchoolSettings,
  type AttendanceDashboardRecord,
  type SchoolSettings,
  type Student,
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
  const [todayRecords, setTodayRecords] = useState<AttendanceDashboardRecord[]>(
    [],
  );
  const [schoolSettings, setSchoolSettings] = useState<SchoolSettings | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [schoolPhoneInput, setSchoolPhoneInput] = useState("");
  const [schoolContactInput, setSchoolContactInput] = useState("");
  const [checkInEndInput, setCheckInEndInput] = useState("");
  const [checkOutEndInput, setCheckOutEndInput] = useState("");
  const [isSavingSchoolPhone, setIsSavingSchoolPhone] = useState(false);
  const [schoolPhoneError, setSchoolPhoneError] = useState<string | null>(
    null,
  );
  const [launchingSession, setLaunchingSession] = useState<
    "check_in" | "check_out" | null
  >(null);
  const [launchMessage, setLaunchMessage] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const hasAdminAccess = canManageKiosk(user);

  const loadDashboard = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      const settingsRequest =
        user && hasAdminAccess
          ? getSchoolSettings(user.company_id).catch(() => null)
          : Promise.resolve(null);
      const [studentRecords, attendanceRecords, settingsResponse] =
        await Promise.all([
          getStudents({ status: "active" }),
          getAttendanceToday(),
          settingsRequest,
        ]);

      setStudents(studentRecords);
      setTodayRecords(attendanceRecords);
      setSchoolSettings(settingsResponse);
      setSchoolPhoneInput(settingsResponse?.school_phone ?? "");
      setSchoolContactInput(settingsResponse?.school_contact ?? "");
      setCheckInEndInput(settingsResponse?.check_in_end_time ?? "");
      setCheckOutEndInput(settingsResponse?.check_out_end_time ?? "");
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

  const stats = useMemo(
    () =>
      [
        {
          title: "Total Enrolled",
          value: students.length,
          icon: Users,
          color: "text-blue-500",
          bgColor: "bg-blue-500/10",
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
    [attendanceSummary, students],
  );

  const visibleStudents = students.slice(0, 12);
  const enrolledCount = students.filter((student) => student.has_face_enrolled).length;
  const enrollmentPercentage = students.length
    ? Math.round((enrolledCount / students.length) * 100)
    : 0;

  const classSummaries = useMemo(() => {
    const summaries = new Map<
      number,
      { label: string; present: number; absent: number; late: number }
    >();
    for (const record of todayRecords) {
      const current = summaries.get(record.class_id) ?? {
        label: `${record.grade}-${record.section}`,
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

  const whatsappStatusText = schoolSettings
    ? schoolSettings.whatsapp_token_configured
      ? schoolSettings.whatsapp_chatbot_ready
        ? "Active (Alerts & Chatbot)"
        : "Alerts Only"
      : "Not configured"
    : "Unknown";
  const isWhatsappActive = schoolSettings?.whatsapp_token_configured;

  async function handleSaveSchoolPhone(): Promise<void> {
    if (!user) return;
    setSchoolPhoneError(null);
    const phoneTrimmed = schoolPhoneInput.trim();
    const contactTrimmed = schoolContactInput.trim();
    
    if (phoneTrimmed && !isValidSchoolPhone(phoneTrimmed)) {
      setSchoolPhoneError(
        "Invalid admin phone format. Must be 923001234567 or 03001234567.",
      );
      return;
    }
    if (contactTrimmed && !isValidSchoolPhone(contactTrimmed)) {
      setSchoolPhoneError(
        "Invalid contact phone format. Must be 923001234567 or 03001234567.",
      );
      return;
    }

    setIsSavingSchoolPhone(true);
    try {
      await updateSchoolSettings(user.company_id, {
        school_phone: phoneTrimmed || null,
        school_contact: contactTrimmed || null,
        check_in_end_time: checkInEndInput || null,
        check_out_end_time: checkOutEndInput || null,
      });
      setSchoolPhoneInput(phoneTrimmed);
      setSchoolContactInput(contactTrimmed);
    } catch (error) {
      setSchoolPhoneError(
        getApiErrorMessage(error, "Failed to save the settings."),
      );
    } finally {
      setIsSavingSchoolPhone(false);
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
                variant="outline"
                disabled={launchingSession !== null}
                onClick={() => void handleLaunchKiosk("check_out")}
                className="shadow-sm"
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
                </>
              )}
            </CardContent>
          </Card>

          <Card className="card-hover">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="size-5 text-[#25D366]" />
                  WhatsApp Integration
                </CardTitle>
                <CardDescription className="mt-1">
                  Messaging and notification settings.
                </CardDescription>
              </div>
              <div className={`flex size-2 rounded-full ${isWhatsappActive ? 'bg-emerald-500 pulse-ring' : 'bg-muted-foreground'}`} />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="skeleton h-10 w-full" />
              ) : (
                <div className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium ${isWhatsappActive ? 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/20' : 'bg-muted text-muted-foreground'}`}>
                  {isWhatsappActive ? <ShieldCheck className="size-3.5" /> : null}
                  {whatsappStatusText}
                </div>
              )}
              
              <div className="mt-6 space-y-4">
                <div className="border-t pt-4">
                  <p className="text-sm font-medium mb-1 text-foreground">Test Messages</p>
                  <p className="text-xs text-muted-foreground">
                    Admin test messages use school credentials first, then default backend credentials.
                  </p>
                </div>

                {hasAdminAccess ? (
                  <form
                    className="grid gap-4 rounded-lg border bg-muted/10 p-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleSaveSchoolPhone();
                    }}
                  >
                    <div className="space-y-1.5">
                      <Label htmlFor="school-phone" className="text-xs font-semibold text-foreground">
                        Admin Dispatch Number
                      </Label>
                      <p className="text-[11px] text-muted-foreground leading-tight">
                        Internal routing number for staff alerts.
                      </p>
                      <Input
                        id="school-phone"
                        value={schoolPhoneInput}
                        disabled={isSavingSchoolPhone}
                        placeholder="923001234567"
                        className="h-9 text-sm"
                        onChange={(event) => {
                          setSchoolPhoneInput(event.target.value);
                          setSchoolPhoneError(null);
                        }}
                      />
                    </div>

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
                        disabled={isSavingSchoolPhone}
                        placeholder="Optional"
                        className="h-9 text-sm"
                        onChange={(event) => {
                          setSchoolContactInput(event.target.value);
                          setSchoolPhoneError(null);
                        }}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="check-in-end" className="text-xs font-semibold text-foreground">
                        Check-in Session End Time
                      </Label>
                      <p className="text-[11px] text-muted-foreground leading-tight">
                        Kiosk auto-closes the check-in session at this local time. Leave blank to keep it open.
                      </p>
                      <Input
                        id="check-in-end"
                        type="time"
                        value={checkInEndInput}
                        disabled={isSavingSchoolPhone}
                        className="h-9 text-sm"
                        onChange={(event) => {
                          setCheckInEndInput(event.target.value);
                          setSchoolPhoneError(null);
                        }}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="check-out-end" className="text-xs font-semibold text-foreground">
                        Check-out Session End Time
                      </Label>
                      <p className="text-[11px] text-muted-foreground leading-tight">
                        Kiosk auto-closes the check-out session at this local time. Leave blank to keep it open.
                      </p>
                      <Input
                        id="check-out-end"
                        type="time"
                        value={checkOutEndInput}
                        disabled={isSavingSchoolPhone}
                        className="h-9 text-sm"
                        onChange={(event) => {
                          setCheckOutEndInput(event.target.value);
                          setSchoolPhoneError(null);
                        }}
                      />
                    </div>

                    {schoolPhoneError ? (
                      <p className="text-xs font-medium text-destructive bg-destructive/10 p-2 rounded">{schoolPhoneError}</p>
                    ) : null}

                    <Button
                      type="submit"
                      size="sm"
                      disabled={isSavingSchoolPhone}
                      className="w-full mt-1 bg-foreground text-background hover:bg-foreground/90"
                    >
                      {isSavingSchoolPhone ? "Saving settings..." : "Save Settings"}
                    </Button>
                  </form>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
