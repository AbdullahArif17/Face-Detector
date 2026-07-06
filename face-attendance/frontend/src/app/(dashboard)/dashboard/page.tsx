"use client";

import { ShieldCheck, ShieldX, UserCheck, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ApiError } from "@/components/api-error";
import { StudentAvatar } from "@/components/students/StudentAvatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getStudents, type Student } from "@/lib/api";

export default function DashboardPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    void getStudents({ status: "active" })
      .then((records) => {
        setStudents(records);
        setHasError(false);
      })
      .catch(() => setHasError(true))
      .finally(() => setIsLoading(false));
  }, []);

  const stats = useMemo(
    () =>
      [
        {
          title: "Total Students",
          value: students.length,
          icon: Users,
        },
        {
          title: "Enrolled",
          value: students.filter((student) => student.has_face_enrolled).length,
          icon: ShieldCheck,
        },
        {
          title: "Not Enrolled",
          value: students.filter((student) => !student.has_face_enrolled).length,
          icon: ShieldX,
        },
        {
          title: "Active",
          value: students.filter((student) => student.status === "active").length,
          icon: UserCheck,
        },
      ] as const,
    [students],
  );
  const visibleStudents = students.slice(0, 12);

  return (
    <section className="space-y-6">
      <div>
          <h1 className="text-2xl font-bold text-balance sm:text-3xl">
            Dashboard
          </h1>
        <p className="mt-2 text-muted-foreground text-pretty">
          Student enrollment overview for your school.
        </p>
      </div>

      {hasError ? <ApiError /> : null}

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
                  Live student data
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

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
