"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  GraduationCap,
  RefreshCw,
  TrendingUp,
  UserCog,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  getPlatformOrganizations,
  getPlatformStats,
  type PlatformOrgListItem,
  type PlatformStats,
} from "@/lib/admin-api";

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [orgs, setOrgs] = useState<PlatformOrgListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      const [statsData, orgsData] = await Promise.all([
        getPlatformStats(),
        getPlatformOrganizations(),
      ]);
      setStats(statsData);
      setOrgs(orgsData);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to load platform stats",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) {
        void loadData();
      }
    });
    return () => {
      active = false;
    };
  }, [loadData]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Platform Control Center
            </h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950/60 border border-emerald-800 px-2 py-0.5 text-xs font-semibold text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Real-time cross-organization metrics, usage volume, and system health.
          </p>
        </div>

        <Button
          onClick={() => void loadData(true)}
          disabled={refreshing || loading}
          variant="outline"
          className="border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white gap-2"
        >
          <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh Metrics
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-800/60 bg-rose-950/50 p-4 text-sm text-rose-200">
          {error}
        </div>
      )}

      {/* Primary Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {/* Organizations Card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg backdrop-blur relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Organizations
            </span>
            <div className="flex size-9 items-center justify-center rounded-xl bg-violet-600/10 text-violet-400 border border-violet-500/20">
              <Building2 className="size-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-bold text-white">
              {loading ? "..." : (stats?.total_organizations ?? 0)}
            </div>
            <div className="mt-2 flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1 text-emerald-400 font-medium">
                <CheckCircle2 className="size-3.5" />
                {stats?.active_organizations ?? 0} active
              </span>
              {(stats?.suspended_organizations ?? 0) > 0 && (
                <span className="flex items-center gap-1 text-rose-400 font-medium">
                  <AlertTriangle className="size-3.5" />
                  {stats?.suspended_organizations ?? 0} suspended
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Total Students Card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg backdrop-blur relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Total Students
            </span>
            <div className="flex size-9 items-center justify-center rounded-xl bg-blue-600/10 text-blue-400 border border-blue-500/20">
              <GraduationCap className="size-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-bold text-white">
              {loading ? "..." : (stats?.total_students ?? 0)}
            </div>
            <div className="mt-2 text-xs text-slate-400">
              Registered across all schools
            </div>
          </div>
        </div>

        {/* Staff & Teachers Card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg backdrop-blur relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Staff & Teachers
            </span>
            <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-600/10 text-emerald-400 border border-emerald-500/20">
              <Users className="size-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-bold text-white">
              {loading ? "..." : (stats?.total_employees ?? 0)}
            </div>
            <div className="mt-2 text-xs text-slate-400">
              Employees & teachers tracked
            </div>
          </div>
        </div>

        {/* Portal Users Card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg backdrop-blur relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Portal Accounts
            </span>
            <div className="flex size-9 items-center justify-center rounded-xl bg-amber-600/10 text-amber-400 border border-amber-500/20">
              <UserCog className="size-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-bold text-white">
              {loading ? "..." : (stats?.total_users ?? 0)}
            </div>
            <div className="mt-2 text-xs text-slate-400">
              School admins, HR, managers
            </div>
          </div>
        </div>

        {/* Today's Scans */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg backdrop-blur relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Today&apos;s Scans
            </span>
            <div className="flex size-9 items-center justify-center rounded-xl bg-purple-600/10 text-purple-400 border border-purple-500/20">
              <TrendingUp className="size-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-bold text-white">
              {loading ? "..." : (stats?.today_attendance_records ?? 0)}
            </div>
            <div className="mt-2 text-xs text-slate-400">
              Biometric check-in/out today
            </div>
          </div>
        </div>

        {/* Total Attendance Records */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg backdrop-blur relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              All-Time Marks
            </span>
            <div className="flex size-9 items-center justify-center rounded-xl bg-indigo-600/10 text-indigo-400 border border-indigo-500/20">
              <Activity className="size-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-bold text-white">
              {loading ? "..." : (stats?.total_attendance_records ?? 0)}
            </div>
            <div className="mt-2 text-xs text-slate-400">
              Total historical attendance rows
            </div>
          </div>
        </div>

        {/* Active Kiosk Sessions */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg backdrop-blur relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Active Sessions
            </span>
            <div className="flex size-9 items-center justify-center rounded-xl bg-rose-600/10 text-rose-400 border border-rose-500/20">
              <Clock className="size-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-bold text-white">
              {loading ? "..." : (stats?.active_sessions_count ?? 0)}
            </div>
            <div className="mt-2 text-xs text-slate-400">
              Kiosks actively scanning right now
            </div>
          </div>
        </div>
      </div>

      {/* Recent Organizations Section */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 shadow-xl backdrop-blur">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Organizations Overview
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Latest organizations using the service
            </p>
          </div>
          <Link
            href="/admin/organizations"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-400 hover:text-violet-300 transition-colors"
          >
            Manage All Organizations
            <ArrowRight className="size-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-800 text-xs uppercase text-slate-400 bg-slate-950/40">
              <tr>
                <th className="px-4 py-3 font-semibold">ID</th>
                <th className="px-4 py-3 font-semibold">Organization</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Package</th>
                <th className="px-4 py-3 font-semibold text-right">Students</th>
                <th className="px-4 py-3 font-semibold text-right">Staff</th>
                <th className="px-4 py-3 font-semibold text-right">Users</th>
                <th className="px-4 py-3 font-semibold text-right">Today Scans</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                    Loading organizations...
                  </td>
                </tr>
              ) : orgs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                    No organizations found.
                  </td>
                </tr>
              ) : (
                orgs.slice(0, 6).map((org) => (
                  <tr
                    key={org.id}
                    className="hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="px-4 py-3.5 font-mono text-xs text-slate-500">
                      #{org.id}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-medium text-white">{org.name}</div>
                      {org.hr_email && (
                        <div className="text-xs text-slate-500">{org.hr_email}</div>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border ${
                          org.status === "active"
                            ? "bg-emerald-950/60 border-emerald-800 text-emerald-300"
                            : "bg-rose-950/60 border-rose-800 text-rose-300"
                        }`}
                      >
                        <span
                          className={`size-1.5 rounded-full ${
                            org.status === "active" ? "bg-emerald-400" : "bg-rose-400"
                          }`}
                        />
                        {org.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-300 uppercase">
                        {org.package}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right font-medium text-slate-300">
                      {org.students_count}
                    </td>
                    <td className="px-4 py-3.5 text-right font-medium text-slate-300">
                      {org.employees_count}
                    </td>
                    <td className="px-4 py-3.5 text-right font-medium text-slate-300">
                      {org.users_count}
                    </td>
                    <td className="px-4 py-3.5 text-right font-semibold text-violet-400">
                      {org.today_attendance_count}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <Link
                        href={`/admin/organizations/${org.id}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white transition-colors"
                      >
                        Details
                        <ArrowRight className="size-3" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
