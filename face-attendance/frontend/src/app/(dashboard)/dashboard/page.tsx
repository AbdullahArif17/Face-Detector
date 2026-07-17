"use client";

import { Clock3, MessageCircle, ShieldCheck, UserCheck, Users, UserX } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError } from "@/components/api-error";
import { StudentAvatar } from "@/components/students/StudentAvatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";
import {
  getAttendanceToday,
  getSchoolSettings,
  getStudents,
  type AttendanceDashboardRecord,
  type SchoolSettings,
  type Student,
} from "@/lib/api";
import { canManageKiosk } from "@/lib/permissions";

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
          title: "Total Students",
          value: students.length,
          icon: Users,
        },
        {
          title: "Present Today",
          value: attendanceSummary.present,
          icon: UserCheck,
        },
        {
          title: "Absent Today",
          value: attendanceSummary.absent,
          icon: UserX,
        },
        {
          title: "Late Today",
          value: attendanceSummary.late,
          icon: Clock3,
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
        ? "Alerts and parent chatbot ready"
        : "Alerts ready; chatbot security incomplete"
      : "Not configured"
    : hasAdminAccess
      ? "Checking configuration..."
      : "Admin-only configuration";

  return (
    <section className="space-y-6">
      <div>
          <h1 className="text-2xl font-bold text-balance sm:text-3xl">
            Dashboard
          </h1>
        <p className="mt-2 text-muted-foreground text-pretty">
          Today&apos;s attendance, enrollment, and WhatsApp readiness for your school.
        </p>
      </div>

      {hasError ? (
        <ApiError
          onRetry={() => void loadDashboard()}
          isRetrying={isLoading}
        />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:gap-4 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <Icon
                  aria-hidden="true"
                  className="size-4 text-muted-foreground"
                />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold tabular-nums">
                  {isLoading ? "—" : stat.value}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Live school data
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Face Enrollment</CardTitle>
            <ShieldCheck aria-hidden="true" className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              {isLoading ? "—" : `${enrolledCount}/${students.length}`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {enrollmentPercentage}% of active students can use face attendance
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-blue-600 transition-[width]"
                style={{ width: `${enrollmentPercentage}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">WhatsApp</CardTitle>
            <MessageCircle aria-hidden="true" className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-base font-semibold">{whatsappStatusText}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Admin test messages use school credentials first, then default backend credentials.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Class attendance today</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Class-wise attendance uses each student&apos;s assigned grade and section.
            </p>
          </div>
          <Link
            href="/attendance"
            className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            Manage sessions
          </Link>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading classes...</p>
          ) : classSummaries.length ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {classSummaries.map(([classId, summary]) => (
                <div key={classId} className="rounded-lg border p-4">
                  <p className="font-semibold">{summary.label}</p>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <span className="text-green-700">{summary.present} present</span>
                    <span className="text-red-700">{summary.absent} absent</span>
                    <span className="text-amber-700">{summary.late} late</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No active classes found.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Student photos</CardTitle>
          <p className="text-sm text-muted-foreground">
            Recent student profiles from your school.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading student photos...</p>
          ) : visibleStudents.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visibleStudents.map((student) => (
                <div
                  key={student.id}
                  className="flex items-center gap-3 rounded-lg border bg-background p-3"
                >
                  <StudentAvatar student={student} className="size-12" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
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
            <p className="text-sm text-muted-foreground">No students found.</p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
