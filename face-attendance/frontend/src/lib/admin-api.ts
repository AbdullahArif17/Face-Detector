import axios from "axios";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api/backend";

export const adminApi = axios.create({
  baseURL: `${API_BASE_URL}/platform-admin`,
  timeout: 20_000,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

export interface PlatformStats {
  total_organizations: number;
  active_organizations: number;
  suspended_organizations: number;
  total_users: number;
  total_students: number;
  total_employees: number;
  total_attendance_records: number;
  today_attendance_records: number;
  active_sessions_count: number;
}

export interface PlatformOrgListItem {
  id: number;
  name: string;
  package: string;
  employee_limit: number;
  status: "active" | "suspended" | string;
  school_phone: string | null;
  school_contact: string | null;
  hr_email: string | null;
  created_at: string;
  updated_at: string;
  users_count: number;
  students_count: number;
  employees_count: number;
  classes_count: number;
  today_attendance_count: number;
}

export interface PlatformUserItem {
  id: number;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
}

export interface PlatformStudentItem {
  id: number;
  student_name: string;
  student_code: string | null;
  grade: string;
  section: string;
  class_id: number;
  class_name: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  parent_email: string | null;
  status: string;
  has_face_enrolled: boolean;
  created_at: string;
}

export interface PlatformEmployeeItem {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  designation: string | null;
  department: string | null;
  branch_id: number;
  branch_name: string | null;
  status: string;
  expected_arrival_time: string | null;
  expected_departure_time: string | null;
  has_face_enrolled: boolean;
  created_at: string;
}

export interface PlatformClassItem {
  id: number;
  name: string;
  location: string | null;
  created_at: string;
}

export interface PlatformOrgStats {
  users_count: number;
  students_count: number;
  employees_count: number;
  classes_count: number;
  total_attendance_records: number;
  today_attendance_records: number;
}

export interface PlatformOrgDetail {
  id: number;
  name: string;
  package: string;
  employee_limit: number;
  status: "active" | "suspended" | string;
  school_phone: string | null;
  school_contact: string | null;
  school_logo: string | null;
  hr_email: string | null;
  attendance_start_time: string;
  check_in_end_time: string | null;
  check_out_end_time: string | null;
  api_key: string;
  created_at: string;
  updated_at: string;
  stats: PlatformOrgStats;
  users: PlatformUserItem[];
  students: PlatformStudentItem[];
  employees: PlatformEmployeeItem[];
  classes: PlatformClassItem[];
}

export async function loginPlatformAdmin(key: string): Promise<{ status: string; token?: string }> {
  const response = await adminApi.post<{ status: string; token: string }>("/login", { key });
  return response.data;
}

export async function logoutPlatformAdmin(): Promise<void> {
  await adminApi.post("/logout");
}

export async function checkPlatformAdminAuth(): Promise<boolean> {
  try {
    const response = await adminApi.get<{ authenticated: boolean }>("/me");
    return Boolean(response.data?.authenticated);
  } catch {
    return false;
  }
}

export async function getPlatformStats(): Promise<PlatformStats> {
  const response = await adminApi.get<PlatformStats>("/stats");
  return response.data;
}

export async function getPlatformOrganizations(): Promise<PlatformOrgListItem[]> {
  const response = await adminApi.get<PlatformOrgListItem[]>("/organizations");
  return response.data;
}

export async function getPlatformOrganizationDetail(id: number): Promise<PlatformOrgDetail> {
  const response = await adminApi.get<PlatformOrgDetail>(`/organizations/${id}`);
  return response.data;
}

export async function updateOrganizationStatus(
  id: number,
  status: "active" | "suspended",
): Promise<{ status: string; organization_status: string }> {
  const response = await adminApi.patch<{ status: string; organization_status: string }>(
    `/organizations/${id}/status`,
    { status },
  );
  return response.data;
}

export async function updateOrganizationInfo(
  id: number,
  data: { name?: string; package?: string; employee_limit?: number },
): Promise<{ status: string }> {
  const response = await adminApi.patch<{ status: string }>(`/organizations/${id}`, data);
  return response.data;
}
