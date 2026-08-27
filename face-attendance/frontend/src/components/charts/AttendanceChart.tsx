"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { type AttendanceDashboardRecord } from "@/lib/api";

interface AttendanceChartProps {
  records: {
    attendance_date: string;
    status: string;
  }[];
}

export function AttendanceChart({ records }: Readonly<AttendanceChartProps>) {
  const data = useMemo(() => {
    // Group records by date
    const grouped = records.reduce((acc, record) => {
      const date = record.attendance_date;
      if (!acc[date]) {
        acc[date] = { date, present: 0, absent: 0, excused: 0, late: 0, total: 0 };
      }
      acc[date].total += 1;
      if (record.status === "present") acc[date].present += 1;
      else if (record.status === "late") acc[date].late += 1;
      else if (record.status === "absent") acc[date].absent += 1;
      else if (record.status === "excused") acc[date].excused += 1;
      return acc;
    }, {} as Record<string, { date: string; present: number; absent: number; excused: number; late: number; total: number }>);

    // Convert to sorted array
    return Object.values(grouped).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }, [records]);

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed bg-muted/20 text-muted-foreground">
        No attendance data to display chart
      </div>
    );
  }

  return (
    <div className="h-72 w-full rounded-xl border bg-card p-4 shadow-card">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Attendance Trends
      </h3>
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 5, right: 0, left: -20, bottom: 0 }}
          >
            <defs>
              <linearGradient id="colorPresent" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorAbsent" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: "#6b7280" }}
              dy={10}
              tickFormatter={(val) => {
                const date = new Date(val);
                return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
              }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: "#6b7280" }}
            />
            <Tooltip
              contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)" }}
              labelFormatter={(val) => new Date(String(val)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            />
            <Area
              type="monotone"
              dataKey="present"
              name="Present"
              stroke="#10b981"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorPresent)"
              stackId="1"
            />
            <Area
              type="monotone"
              dataKey="late"
              name="Late"
              stroke="#eab308"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorPresent)"
              stackId="1"
            />
            <Area
              type="monotone"
              dataKey="absent"
              name="Absent"
              stroke="#ef4444"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorAbsent)"
              stackId="2"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
