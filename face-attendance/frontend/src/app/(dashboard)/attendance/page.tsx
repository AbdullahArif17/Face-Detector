"use client";

import { useEffect, useMemo, useState } from "react";

import { ApiError } from "@/components/api-error";
import {
  getAllAttendance,
  getAllEmployees,
  type AttendanceRecord,
  type Employee,
} from "@/lib/api";

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default function AttendancePage() {
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    void Promise.all([getAllAttendance(), getAllEmployees()])
      .then(([records, employeeRecords]) => {
        setAttendance(records);
        setEmployees(employeeRecords);
      })
      .catch(() => setHasError(true));
  }, []);

  const employeeNames = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee.name])),
    [employees],
  );

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-balance">Attendance</h1>
        <p className="mt-2 text-muted-foreground text-pretty">
          {attendance.length} attendance records.
        </p>
      </div>
      {hasError ? <ApiError /> : null}
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Employee</th>
              <th className="px-4 py-3 font-medium">Check in</th>
              <th className="px-4 py-3 font-medium">Check out</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {attendance.map((record) => (
              <tr className="border-b last:border-0" key={record.id}>
                <td className="px-4 py-3 font-medium">
                  {employeeNames.get(record.employee_id) ??
                    `Employee #${record.employee_id}`}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {record.status === "absent"
                    ? "—"
                    : dateTimeFormatter.format(new Date(record.check_in))}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {record.check_out
                    ? dateTimeFormatter.format(new Date(record.check_out))
                    : "—"}
                </td>
                <td className="px-4 py-3 capitalize">{record.status}</td>
                <td className="px-4 py-3 tabular-nums">
                  {record.confidence_score === null
                    ? "—"
                    : `${Math.round(record.confidence_score * 100)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
