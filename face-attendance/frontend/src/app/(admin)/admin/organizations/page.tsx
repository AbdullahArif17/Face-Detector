"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Power,
  RefreshCw,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getPlatformOrganizations,
  type PlatformOrgListItem,
  updateOrganizationStatus,
} from "@/lib/admin-api";

export default function AdminOrganizationsPage() {
  const [orgs, setOrgs] = useState<PlatformOrgListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended">("all");

  // Confirmation modal state
  const [targetOrg, setTargetOrg] = useState<PlatformOrgListItem | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const loadOrgs = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const data = await getPlatformOrganizations();
      setOrgs(data);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to load organizations",
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
        void loadOrgs();
      }
    });
    return () => {
      active = false;
    };
  }, [loadOrgs]);

  const filteredOrgs = useMemo(() => {
    return orgs.filter((org) => {
      const matchesStatus =
        statusFilter === "all" || org.status === statusFilter;
      const query = search.trim().toLowerCase();
      const matchesSearch =
        !query ||
        org.name.toLowerCase().includes(query) ||
        org.id.toString() === query ||
        (org.school_phone && org.school_phone.toLowerCase().includes(query)) ||
        (org.hr_email && org.hr_email.toLowerCase().includes(query));

      return matchesStatus && matchesSearch;
    });
  }, [orgs, statusFilter, search]);

  async function handleToggleStatus() {
    if (!targetOrg) return;
    const newStatus = targetOrg.status === "active" ? "suspended" : "active";

    try {
      setActionLoading(true);
      await updateOrganizationStatus(targetOrg.id, newStatus);
      // Update local state
      setOrgs((prev) =>
        prev.map((o) =>
          o.id === targetOrg.id ? { ...o, status: newStatus } : o,
        ),
      );
      setTargetOrg(null);
    } catch (err: unknown) {
      alert(
        err instanceof Error
          ? err.message
          : "Failed to update organization status",
      );
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="size-6 text-violet-400" />
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Organizations
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Monitor, manage, and toggle access for all tenant organizations.
          </p>
        </div>

        <Button
          onClick={() => void loadOrgs(true)}
          disabled={refreshing || loading}
          variant="outline"
          className="border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white gap-2"
        >
          <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-800/60 bg-rose-950/50 p-4 text-sm text-rose-200">
          {error}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-800 bg-slate-900/50 p-4 shadow-md backdrop-blur">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <Input
            placeholder="Search by name, ID, phone, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500"
          />
        </div>

        <div className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 p-1">
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === "all"
                ? "bg-violet-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            All ({orgs.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("active")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === "active"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Active ({orgs.filter((o) => o.status === "active").length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("suspended")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === "suspended"
                ? "bg-rose-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Suspended ({orgs.filter((o) => o.status === "suspended").length})
          </button>
        </div>
      </div>

      {/* Organizations Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-800 text-xs uppercase text-slate-400 bg-slate-950/70">
              <tr>
                <th className="px-4 py-3 font-semibold">ID</th>
                <th className="px-4 py-3 font-semibold">Organization</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Package</th>
                <th className="px-4 py-3 font-semibold text-right">Students</th>
                <th className="px-4 py-3 font-semibold text-right">Staff</th>
                <th className="px-4 py-3 font-semibold text-right">Users</th>
                <th className="px-4 py-3 font-semibold text-right">Classes</th>
                <th className="px-4 py-3 font-semibold text-right">Today Scans</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-slate-500">
                    Loading organizations...
                  </td>
                </tr>
              ) : filteredOrgs.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-slate-500">
                    No organizations match your filter.
                  </td>
                </tr>
              ) : (
                filteredOrgs.map((org) => {
                  const isActive = org.status === "active";
                  return (
                    <tr
                      key={org.id}
                      className="hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-4 py-3.5 font-mono text-xs text-slate-500">
                        #{org.id}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-white">{org.name}</div>
                        <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                          {org.school_phone && <span>{org.school_phone}</span>}
                          {org.school_phone && org.hr_email && <span>•</span>}
                          {org.hr_email && <span>{org.hr_email}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                            isActive
                              ? "bg-emerald-950/70 border-emerald-800 text-emerald-300"
                              : "bg-rose-950/70 border-rose-800 text-rose-300"
                          }`}
                        >
                          <span
                            className={`size-1.5 rounded-full ${
                              isActive ? "bg-emerald-400 animate-pulse" : "bg-rose-400"
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
                      <td className="px-4 py-3.5 text-right font-medium text-slate-300">
                        {org.classes_count}
                      </td>
                      <td className="px-4 py-3.5 text-right font-semibold text-violet-400">
                        {org.today_attendance_count}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* Toggle status button */}
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setTargetOrg(org)}
                            className={`h-8 px-2.5 text-xs font-medium border gap-1.5 transition-colors ${
                              isActive
                                ? "border-rose-900/60 bg-rose-950/30 text-rose-300 hover:bg-rose-950/80 hover:text-rose-200 hover:border-rose-700"
                                : "border-emerald-900/60 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-950/80 hover:text-emerald-200 hover:border-emerald-700"
                            }`}
                            title={isActive ? "Disable organization" : "Enable organization"}
                          >
                            <Power className="size-3.5" />
                            {isActive ? "Disable" : "Enable"}
                          </Button>

                          <Link
                            href={`/admin/organizations/${org.id}`}
                            className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-3 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white transition-colors"
                          >
                            Details
                            <ArrowRight className="size-3" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Modal */}
      {targetOrg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div
                className={`flex size-11 items-center justify-center rounded-xl border ${
                  targetOrg.status === "active"
                    ? "border-rose-800/80 bg-rose-950/50 text-rose-400"
                    : "border-emerald-800/80 bg-emerald-950/50 text-emerald-400"
                }`}
              >
                {targetOrg.status === "active" ? (
                  <AlertTriangle className="size-6" />
                ) : (
                  <CheckCircle2 className="size-6" />
                )}
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  {targetOrg.status === "active"
                    ? `Disable "${targetOrg.name}"?`
                    : `Enable "${targetOrg.name}"?`}
                </h3>
                <p className="text-xs text-slate-400">Org ID #{targetOrg.id}</p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300">
              {targetOrg.status === "active" ? (
                <>
                  <p className="font-semibold text-rose-300 mb-1">
                    What happens when disabled:
                  </p>
                  <ul className="list-disc pl-4 space-y-1 text-slate-400">
                    <li>All users from this organization will be immediately blocked from logging in.</li>
                    <li>Active kiosk attendance scanning sessions will be halted.</li>
                    <li>No data will be deleted. You can re-enable this organization anytime.</li>
                  </ul>
                </>
              ) : (
                <>
                  <p className="font-semibold text-emerald-300 mb-1">
                    Re-enabling access:
                  </p>
                  <p className="text-slate-400">
                    This organization&apos;s users and kiosk scans will be immediately restored and allowed to access the service.
                  </p>
                </>
              )}
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setTargetOrg(null)}
                disabled={actionLoading}
                className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void handleToggleStatus()}
                disabled={actionLoading}
                className={
                  targetOrg.status === "active"
                    ? "bg-rose-600 text-white hover:bg-rose-500 font-semibold"
                    : "bg-emerald-600 text-white hover:bg-emerald-500 font-semibold"
                }
              >
                {actionLoading
                  ? "Updating..."
                  : targetOrg.status === "active"
                  ? "Yes, Disable Organization"
                  : "Yes, Re-Enable Organization"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
