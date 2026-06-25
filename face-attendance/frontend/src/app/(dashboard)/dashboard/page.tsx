"use client";

import { CalendarCheck, Clock3, UserRoundX, Users } from "lucide-react";
import { useEffect, useState } from "react";

import { ApiError } from "@/components/api-error";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getAttendance,
  getEmployees,
  type AttendanceRecord,
} from "@/lib/api";

function isToday(value: string): boolean {
  const date = new Date(value);
  const today = new Date();
  return (
    date.getUTCFullYear() === today.getUTCFullYear() &&
    date.getUTCMonth() === today.getUTCMonth() &&
    date.getUTCDate() === today.getUTCDate()
  );
}

export default function DashboardPage() {
  const [employeeCount, setEmployeeCount] = useState(0);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    void Promise.all([getEmployees(), getAttendance()])
      .then(([employees, records]) => {
        setEmployeeCount(employees.length);
        setAttendance(records.filter((record) => isToday(record.created_at)));
      })
      .catch(() => setHasError(true));
  }, []);

  const stats = [
    { title: "Total Employees", value: employeeCount, icon: Users },
    {
      title: "Present Today",
      value: attendance.filter((record) => record.status === "present").length,
      icon: CalendarCheck,
    },
    {
      title: "Absent Today",
      value: attendance.filter((record) => record.status === "absent").length,
      icon: UserRoundX,
    },
    {
      title: "Late Today",
      value: attendance.filter((record) => record.status === "late").length,
      icon: Clock3,
    },
  ] as const;

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-balance">Dashboard</h1>
        <p className="mt-2 text-muted-foreground text-pretty">
          Today&apos;s attendance overview.
        </p>
      </div>
      {hasError ? <ApiError /> : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
                <p className="text-3xl font-bold tabular-nums">{stat.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Authenticated company data
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
