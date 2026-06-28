"use client";

import { ShieldCheck, ShieldX, UserCheck, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ApiError } from "@/components/api-error";
import { EmployeeAvatar } from "@/components/employees/EmployeeAvatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAllEmployees, type Employee } from "@/lib/api";

export default function DashboardPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    void getAllEmployees()
      .then((records) => {
        setEmployees(records);
        setHasError(false);
      })
      .catch(() => setHasError(true))
      .finally(() => setIsLoading(false));
  }, []);

  const stats = useMemo(
    () =>
      [
        {
          title: "Total Employees",
          value: employees.length,
          icon: Users,
        },
        {
          title: "Enrolled",
          value: employees.filter((employee) => employee.has_face_enrolled).length,
          icon: ShieldCheck,
        },
        {
          title: "Not Enrolled",
          value: employees.filter((employee) => !employee.has_face_enrolled).length,
          icon: ShieldX,
        },
        {
          title: "Active",
          value: employees.filter((employee) => employee.status === "active").length,
          icon: UserCheck,
        },
      ] as const,
    [employees],
  );
  const visibleEmployees = employees.slice(0, 12);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-balance">Dashboard</h1>
        <p className="mt-2 text-muted-foreground text-pretty">
          Employee enrollment overview for your organization.
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
                <p className="text-3xl font-bold tabular-nums">
                  {isLoading ? "—" : stat.value}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Live employee data
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Employee headshots</CardTitle>
          <p className="text-sm text-muted-foreground">
            Recent employee profiles from your organization.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading headshots...</p>
          ) : visibleEmployees.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visibleEmployees.map((employee) => (
                <div
                  key={employee.id}
                  className="flex items-center gap-3 rounded-lg border bg-background p-3"
                >
                  <EmployeeAvatar employee={employee} className="size-12" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{employee.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {employee.designation ?? employee.department ?? "Employee"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No employees found.</p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
