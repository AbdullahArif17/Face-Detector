"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Copy,
  Edit2,
  GraduationCap,
  Key,
  Mail,
  Phone,
  Power,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  UserCog,
  Users,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getPlatformOrganizationDetail,
  type PlatformOrgDetail,
  updateOrganizationInfo,
  updateOrganizationStatus,
} from "@/lib/admin-api";

export default function AdminOrgDetailPage() {
  const params = useParams();
  const orgId = Number(params.id);

  const [org, setOrg] = useState<PlatformOrgDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active tab
  const [activeTab, setActiveTab] = useState<
    "students" | "staff" | "users" | "classes" | "config"
  >("students");

  // Search within tabs
  const [studentSearch, setStudentSearch] = useState("");
  const [staffSearch, setStaffSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");

  // Status toggle confirmation modal
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);

  // Edit org modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPackage, setEditPackage] = useState("");
  const [editLimit, setEditLimit] = useState(50);
  const [editLoading, setEditLoading] = useState(false);

  // Key copy state
  const [copiedKey, setCopiedKey] = useState(false);

  const loadOrg = useCallback(
    async (isRefresh = false) => {
      if (isNaN(orgId)) return;
      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError(null);
        const data = await getPlatformOrganizationDetail(orgId);
        setOrg(data);
        setEditName(data.name);
        setEditPackage(data.package);
        setEditLimit(data.employee_limit);
      } catch (err: unknown) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load organization details",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [orgId],
  );

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) {
        void loadOrg();
      }
    });
    return () => {
      active = false;
    };
  }, [loadOrg]);

  async function handleToggleStatus() {
    if (!org) return;
    const newStatus = org.status === "active" ? "suspended" : "active";
    try {
      setStatusLoading(true);
      await updateOrganizationStatus(org.id, newStatus);
      setOrg({ ...org, status: newStatus });
      setShowStatusModal(false);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to toggle status");
    } finally {
      setStatusLoading(false);
    }
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!org) return;
    try {
      setEditLoading(true);
      await updateOrganizationInfo(org.id, {
        name: editName.trim(),
        package: editPackage.trim(),
        employee_limit: Number(editLimit),
      });
      setOrg({
        ...org,
        name: editName.trim(),
        package: editPackage.trim(),
        employee_limit: Number(editLimit),
      });
      setShowEditModal(false);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to update details");
    } finally {
      setEditLoading(false);
    }
  }

  const filteredStudents = useMemo(() => {
    if (!org) return [];
    const q = studentSearch.trim().toLowerCase();
    if (!q) return org.students;
    return org.students.filter(
      (s) =>
        s.student_name.toLowerCase().includes(q) ||
        (s.student_code && s.student_code.toLowerCase().includes(q)) ||
        (s.parent_name && s.parent_name.toLowerCase().includes(q)) ||
        (s.parent_phone && s.parent_phone.includes(q)) ||
        s.grade.toLowerCase().includes(q) ||
        s.section.toLowerCase().includes(q),
    );
  }, [org, studentSearch]);

  const filteredStaff = useMemo(() => {
    if (!org) return [];
    const q = staffSearch.trim().toLowerCase();
    if (!q) return org.employees;
    return org.employees.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        (e.designation && e.designation.toLowerCase().includes(q)) ||
        (e.department && e.department.toLowerCase().includes(q)) ||
        (e.phone && e.phone.includes(q)),
    );
  }, [org, staffSearch]);

  const filteredUsers = useMemo(() => {
    if (!org) return [];
    const q = userSearch.trim().toLowerCase();
    if (!q) return org.users;
    return org.users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q),
    );
  }, [org, userSearch]);

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center text-slate-400">
        <RefreshCw className="size-6 animate-spin text-violet-400 mr-2" />
        Loading organization details...
      </div>
    );
  }

  if (error || !org) {
    return (
      <div className="space-y-4">
        <Link
          href="/admin/organizations"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200"
        >
          <ArrowLeft className="size-4" />
          Back to Organizations
        </Link>
        <div className="rounded-xl border border-rose-800 bg-rose-950/50 p-4 text-rose-200">
          {error ?? "Organization not found"}
        </div>
      </div>
    );
  }

  const isActive = org.status === "active";
  const enrolledStudents = org.students.filter((s) => s.has_face_enrolled).length;
  const enrolledStaff = org.employees.filter((e) => e.has_face_enrolled).length;

  return (
    <div className="space-y-8">
      {/* Breadcrumb & Navigation */}
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Link
          href="/admin/organizations"
          className="hover:text-slate-200 transition-colors flex items-center gap-1"
        >
          <ArrowLeft className="size-3.5" />
          Organizations
        </Link>
        <span>/</span>
        <span className="text-slate-200 font-medium">{org.name}</span>
      </div>

      {/* Main Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl backdrop-blur">
        <div className="flex items-start gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-violet-600/15 border border-violet-500/30 text-violet-400 font-bold text-xl shadow-inner">
            <Building2 className="size-7" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-white tracking-tight">
                {org.name}
              </h1>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-semibold border ${
                  isActive
                    ? "bg-emerald-950/80 border-emerald-700 text-emerald-300"
                    : "bg-rose-950/80 border-rose-700 text-rose-300"
                }`}
              >
                <span
                  className={`size-1.5 rounded-full ${
                    isActive ? "bg-emerald-400 animate-pulse" : "bg-rose-400"
                  }`}
                />
                {org.status.toUpperCase()}
              </span>
              <span className="rounded-md bg-slate-800 px-2 py-0.5 text-xs font-semibold uppercase text-slate-300">
                {org.package}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-400">
              <span>Org ID: #{org.id}</span>
              {org.school_phone && (
                <span className="flex items-center gap-1">
                  <Phone className="size-3" />
                  {org.school_phone}
                </span>
              )}
              {org.hr_email && (
                <span className="flex items-center gap-1">
                  <Mail className="size-3" />
                  {org.hr_email}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="size-3" />
                Created {new Date(org.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadOrg(true)}
            disabled={refreshing}
            className="border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => setShowEditModal(true)}
            className="border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white gap-1.5"
          >
            <Edit2 className="size-3.5" />
            Edit Org
          </Button>

          <Button
            type="button"
            onClick={() => setShowStatusModal(true)}
            className={`gap-1.5 font-semibold text-white shadow-md ${
              isActive
                ? "bg-rose-600 hover:bg-rose-500 shadow-rose-600/20"
                : "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20"
            }`}
          >
            <Power className="size-4" />
            {isActive ? "Disable Organization" : "Enable Organization"}
          </Button>
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Students Enrolled</span>
            <GraduationCap className="size-4 text-blue-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white">
            {org.stats.students_count}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {enrolledStudents} with biometric face
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Staff & Teachers</span>
            <Users className="size-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white">
            {org.stats.employees_count}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {enrolledStaff} with biometric face
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Portal Users</span>
            <UserCog className="size-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white">
            {org.stats.users_count}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Limit: {org.employee_limit} accounts
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Today&apos;s Scans</span>
            <Clock className="size-4 text-violet-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white">
            {org.stats.today_attendance_records}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {org.stats.total_attendance_records} all-time marks
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Classes / Branches</span>
            <Building2 className="size-4 text-indigo-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white">
            {org.stats.classes_count}
          </div>
          <div className="mt-1 text-xs text-slate-400">Configured classes</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl overflow-hidden backdrop-blur">
        <div className="flex border-b border-slate-800 bg-slate-950/60 px-4 pt-2 overflow-x-auto">
          {[
            { id: "students", label: `Students (${org.students.length})`, icon: GraduationCap },
            { id: "staff", label: `Staff & Teachers (${org.employees.length})`, icon: Users },
            { id: "users", label: `Portal Users (${org.users.length})`, icon: UserCog },
            { id: "classes", label: `Classes (${org.classes.length})`, icon: Building2 },
            { id: "config", label: "Settings & API Key", icon: Key },
          ].map((tab) => {
            const Icon = tab.icon;
            const isTabActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold whitespace-nowrap transition-colors ${
                  isTabActive
                    ? "border-violet-500 text-violet-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <Icon className="size-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {/* TAB 1: STUDENTS */}
          {activeTab === "students" && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                  <Input
                    placeholder="Search students by name, code, parent..."
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    className="pl-9 border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500"
                  />
                </div>
                <div className="text-xs text-slate-400">
                  Showing {filteredStudents.length} of {org.students.length} students
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-800 text-xs uppercase text-slate-400 bg-slate-950/60">
                    <tr>
                      <th className="px-4 py-3">ID</th>
                      <th className="px-4 py-3">Student</th>
                      <th className="px-4 py-3">Roll/Code</th>
                      <th className="px-4 py-3">Grade & Section</th>
                      <th className="px-4 py-3">Class</th>
                      <th className="px-4 py-3">Parent Contact</th>
                      <th className="px-4 py-3">Face Biometric</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredStudents.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                          No students found.
                        </td>
                      </tr>
                    ) : (
                      filteredStudents.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-800/40">
                          <td className="px-4 py-3 font-mono text-xs text-slate-500">
                            #{s.id}
                          </td>
                          <td className="px-4 py-3 font-medium text-white">
                            {s.student_name}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-400">
                            {s.student_code || "—"}
                          </td>
                          <td className="px-4 py-3 text-slate-300">
                            {s.grade} - {s.section}
                          </td>
                          <td className="px-4 py-3 text-slate-400">
                            {s.class_name || `Class #${s.class_id}`}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-400">
                            <div>{s.parent_name || "—"}</div>
                            {s.parent_phone && (
                              <div className="text-slate-500">{s.parent_phone}</div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {s.has_face_enrolled ? (
                              <span className="inline-flex items-center gap-1 rounded bg-emerald-950/70 border border-emerald-800 px-2 py-0.5 text-xs font-medium text-emerald-300">
                                <UserCheck className="size-3" />
                                Enrolled
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded bg-amber-950/70 border border-amber-800 px-2 py-0.5 text-xs font-medium text-amber-300">
                                <AlertTriangle className="size-3" />
                                Missing Face
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded px-2 py-0.5 text-xs font-semibold ${
                                s.status === "active"
                                  ? "bg-slate-800 text-slate-200"
                                  : "bg-rose-950/60 text-rose-300"
                              }`}
                            >
                              {s.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: STAFF & TEACHERS */}
          {activeTab === "staff" && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                  <Input
                    placeholder="Search staff by name, email, designation..."
                    value={staffSearch}
                    onChange={(e) => setStaffSearch(e.target.value)}
                    className="pl-9 border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500"
                  />
                </div>
                <div className="text-xs text-slate-400">
                  Showing {filteredStaff.length} of {org.employees.length} staff
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-800 text-xs uppercase text-slate-400 bg-slate-950/60">
                    <tr>
                      <th className="px-4 py-3">ID</th>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Designation / Dept</th>
                      <th className="px-4 py-3">Contact</th>
                      <th className="px-4 py-3">Expected Shift</th>
                      <th className="px-4 py-3">Face Biometric</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredStaff.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                          No staff or teachers enrolled yet.
                        </td>
                      </tr>
                    ) : (
                      filteredStaff.map((e) => (
                        <tr key={e.id} className="hover:bg-slate-800/40">
                          <td className="px-4 py-3 font-mono text-xs text-slate-500">
                            #{e.id}
                          </td>
                          <td className="px-4 py-3 font-medium text-white">
                            {e.name}
                          </td>
                          <td className="px-4 py-3 text-slate-300">
                            <div>{e.designation || "Staff"}</div>
                            {e.department && (
                              <div className="text-xs text-slate-500">{e.department}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-400">
                            <div>{e.email}</div>
                            {e.phone && <div className="text-slate-500">{e.phone}</div>}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-400">
                            {e.expected_arrival_time ? (
                              <span>
                                {e.expected_arrival_time} - {e.expected_departure_time || "—"}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {e.has_face_enrolled ? (
                              <span className="inline-flex items-center gap-1 rounded bg-emerald-950/70 border border-emerald-800 px-2 py-0.5 text-xs font-medium text-emerald-300">
                                <UserCheck className="size-3" />
                                Enrolled
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded bg-amber-950/70 border border-amber-800 px-2 py-0.5 text-xs font-medium text-amber-300">
                                <AlertTriangle className="size-3" />
                                Missing Face
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded px-2 py-0.5 text-xs font-semibold ${
                                e.status === "active"
                                  ? "bg-slate-800 text-slate-200"
                                  : "bg-rose-950/60 text-rose-300"
                              }`}
                            >
                              {e.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: PORTAL USERS */}
          {activeTab === "users" && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                  <Input
                    placeholder="Search users by name, email..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="pl-9 border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500"
                  />
                </div>
                <div className="text-xs text-slate-400">
                  {org.users.length} registered portal user(s)
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-800 text-xs uppercase text-slate-400 bg-slate-950/60">
                    <tr>
                      <th className="px-4 py-3">ID</th>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Email Address</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Account Active</th>
                      <th className="px-4 py-3">Last Login</th>
                      <th className="px-4 py-3">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                          No portal users found.
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((u) => (
                        <tr key={u.id} className="hover:bg-slate-800/40">
                          <td className="px-4 py-3 font-mono text-xs text-slate-500">
                            #{u.id}
                          </td>
                          <td className="px-4 py-3 font-medium text-white">
                            {u.name}
                          </td>
                          <td className="px-4 py-3 text-slate-300 font-mono text-xs">
                            {u.email}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1 rounded bg-violet-950/60 border border-violet-800 px-2 py-0.5 text-xs font-semibold text-violet-300 uppercase">
                              <ShieldCheck className="size-3" />
                              {u.role}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {u.is_active ? (
                              <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-medium">
                                <CheckCircle2 className="size-3.5" />
                                Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-rose-400 font-medium">
                                <XCircle className="size-3.5" />
                                Deactivated
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-400">
                            {u.last_login
                              ? new Date(u.last_login).toLocaleString()
                              : "Never"}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {new Date(u.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: CLASSES */}
          {activeTab === "classes" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-800 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-800 text-xs uppercase text-slate-400 bg-slate-950/60">
                    <tr>
                      <th className="px-4 py-3">Class ID</th>
                      <th className="px-4 py-3">Class Name</th>
                      <th className="px-4 py-3">Location / Room</th>
                      <th className="px-4 py-3">Created Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {org.classes.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                          No classes configured for this school.
                        </td>
                      </tr>
                    ) : (
                      org.classes.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-800/40">
                          <td className="px-4 py-3 font-mono text-xs text-slate-500">
                            #{c.id}
                          </td>
                          <td className="px-4 py-3 font-medium text-white">
                            {c.name}
                          </td>
                          <td className="px-4 py-3 text-slate-400">
                            {c.location || "Main Campus"}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {new Date(c.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: CONFIG & SETTINGS */}
          {activeTab === "config" && (
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-5 space-y-4">
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <Key className="size-4 text-violet-400" />
                  Kiosk API Credential
                </h3>
                <p className="text-xs text-slate-400">
                  This bearer API key authenticates the physical attendance kiosk camera for this school.
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={org.api_key}
                    type="password"
                    className="font-mono text-xs border-slate-800 bg-slate-900 text-slate-300"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      void navigator.clipboard.writeText(org.api_key);
                      setCopiedKey(true);
                      setTimeout(() => setCopiedKey(false), 2000);
                    }}
                    className="border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 gap-1 text-xs"
                  >
                    <Copy className="size-3.5" />
                    {copiedKey ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-5 space-y-3">
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <Clock className="size-4 text-violet-400" />
                  Schedule & Timing Rules
                </h3>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-800/80">
                    <span className="text-slate-400">Attendance Start Time</span>
                    <span className="text-slate-200 font-medium">
                      {org.attendance_start_time || "09:00"}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/80">
                    <span className="text-slate-400">Check-in Auto-End Time</span>
                    <span className="text-slate-200 font-medium">
                      {org.check_in_end_time || "None (manual)"}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/80">
                    <span className="text-slate-400">Check-out Auto-End Time</span>
                    <span className="text-slate-200 font-medium">
                      {org.check_out_end_time || "None (manual)"}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Account Employee Limit</span>
                    <span className="text-slate-200 font-medium">
                      {org.employee_limit} portal accounts
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal: Enable/Disable */}
      {showStatusModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div
                className={`flex size-11 items-center justify-center rounded-xl border ${
                  isActive
                    ? "border-rose-800/80 bg-rose-950/50 text-rose-400"
                    : "border-emerald-800/80 bg-emerald-950/50 text-emerald-400"
                }`}
              >
                {isActive ? (
                  <AlertTriangle className="size-6" />
                ) : (
                  <CheckCircle2 className="size-6" />
                )}
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  {isActive ? `Disable "${org.name}"?` : `Enable "${org.name}"?`}
                </h3>
                <p className="text-xs text-slate-400">ID #{org.id}</p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300">
              {isActive ? (
                <>
                  <p className="font-semibold text-rose-300 mb-1">
                    Disabling this organization will:
                  </p>
                  <ul className="list-disc pl-4 space-y-1 text-slate-400">
                    <li>Immediately reject login attempts from all {org.users.length} portal users.</li>
                    <li>Block kiosk attendance scanning with API key.</li>
                    <li>Preserve all historical attendance records, student photos, and embeddings.</li>
                  </ul>
                </>
              ) : (
                <p className="text-slate-300">
                  Re-enabling will immediately restore portal access for users and enable attendance kiosk scans.
                </p>
              )}
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowStatusModal(false)}
                disabled={statusLoading}
                className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void handleToggleStatus()}
                disabled={statusLoading}
                className={
                  isActive
                    ? "bg-rose-600 text-white hover:bg-rose-500 font-semibold"
                    : "bg-emerald-600 text-white hover:bg-emerald-500 font-semibold"
                }
              >
                {statusLoading
                  ? "Updating..."
                  : isActive
                  ? "Yes, Disable Organization"
                  : "Yes, Re-Enable Organization"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Organization Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-1">
              Edit Organization
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Update name, subscription tier package, and account limits.
            </p>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Organization Name <span className="text-violet-400">*</span>
                </label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  className="border-slate-700 bg-slate-950 text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Subscription Package <span className="text-violet-400">*</span>
                </label>
                <select
                  value={editPackage}
                  onChange={(e) => setEditPackage(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                >
                  <option value="starter">Starter</option>
                  <option value="standard">Standard</option>
                  <option value="premium">Premium</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Portal User Limit <span className="text-violet-400">*</span>
                </label>
                <Input
                  type="number"
                  min={1}
                  max={500}
                  value={editLimit}
                  onChange={(e) => setEditLimit(Number(e.target.value))}
                  required
                  className="border-slate-700 bg-slate-950 text-slate-100"
                />
              </div>

              <div className="mt-6 flex items-center justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowEditModal(false)}
                  disabled={editLoading}
                  className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={editLoading}
                  className="bg-violet-600 text-white hover:bg-violet-500 font-semibold"
                >
                  {editLoading ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
