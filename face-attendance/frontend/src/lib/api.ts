import axios, { type InternalAxiosRequestConfig } from "axios";

const LEGACY_AUTH_TOKEN_KEY = "face_attendance_token";
const LEGACY_AUTH_USER_KEY = "face_attendance_user";
const CSRF_COOKIE_NAME =
  process.env.NEXT_PUBLIC_CSRF_COOKIE_NAME ?? "face_attendance_csrf";

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  company_id: number;
  is_active?: boolean;
  last_login?: string | null;
  created_at?: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: "bearer";
  user: User;
}

export interface SignupInput {
  company_name: string;
  name: string;
  email: string;
  password: string;
}

export interface Employee {
  id: number;
  company_id: number;
  branch_id: number;
  name: string;
  email: string;
  phone: string | null;
  designation: string | null;
  department: string | null;
  headshot_url: string | null;
  status: string;
  expected_arrival_time: string | null;
  expected_departure_time: string | null;
  has_face_enrolled: boolean;
}

export interface Student {
  id: number;
  school_id: number;
  class_id: number;
  student_name: string;
  student_code: string | null;
  grade: string;
  section: string;
  parent_name: string | null;
  parent_phone: string | null;
  parent_phone_2: string | null;
  parent_email: string | null;
  profile_image: string | null;
  status: string;
  has_face_enrolled: boolean;
  created_at: string;
}

export interface StudentInput {
  student_name: string;
  student_code?: string | null;
  grade: string;
  section: string;
  parent_name?: string | null;
  parent_phone?: string | null;
  parent_phone_2?: string | null;
  parent_email?: string | null;
  profile_image?: string | null;
  class_id?: number;
}

export interface StudentUpdateInput {
  student_name?: string;
  student_code?: string | null;
  grade?: string;
  section?: string;
  parent_name?: string | null;
  parent_phone?: string | null;
  parent_phone_2?: string | null;
  parent_email?: string | null;
  profile_image?: string | null;
  class_id?: number;
  status?: string;
}

export interface StudentImportResponse {
  created: number;
  failed: number;
  errors: Array<{
    row: number;
    student_code: string | null;
    error: string;
  }>;
}

export interface EmployeeInput {
  name: string;
  email: string;
  phone: string | null;
  designation: string | null;
  department: string | null;
  headshot_url?: string | null;
  branch_id?: number;
  expected_arrival_time?: string | null;
  expected_departure_time?: string | null;
}

export interface EmployeeUpdateInput {
  name?: string;
  email?: string;
  phone?: string | null;
  designation?: string | null;
  department?: string | null;
  headshot_url?: string | null;
  branch_id?: number;
  status?: string;
  expected_arrival_time?: string | null;
  expected_departure_time?: string | null;
}

export interface AttendanceRecord {
  id: number;
  student_id: number;
  company_id: number;
  session_id: number | null;
  check_in: string;
  check_out: string | null;
  status: string;
  confidence_score: number | null;
  notification_sent: boolean;
  notification_status: string | null;
  created_at: string;
}

export interface AttendanceDashboardRecord {
  attendance_id: number | null;
  student_id: number | null;
  student_name: string | null;
  employee_id?: number | null;
  employee_name?: string | null;
  designation: string | null;
  grade: string | null;
  section: string | null;
  branch_id: number | null;
  class_id: number | null;
  check_in: string | null;
  check_out: string | null;
  status: string;
  confidence_score: number | null;
  notification_sent: boolean;
  notification_status: string | null;
  working_hours: string;
  attendance_date: string;
}

export interface AttendanceManualUpdateInput {
  attendance_id?: number | null;
  student_id?: number | null;
  employee_id?: number | null;
  attendance_date: string;
  status: "present" | "absent" | "excused";
  check_in_time?: string | null;
  check_out_time?: string | null;
}

export interface StaffAttendanceRecord {
  attendance_id: number | null;
  employee_id: number;
  employee_name: string;
  designation: string | null;
  department: string | null;
  check_in: string | null;
  check_out: string | null;
  status: string;
  confidence_score: number | null;
  notification_sent: boolean;
  notification_status: string | null;
  working_hours: string;
  attendance_date: string;
}

export interface KioskAttendanceStudent {
  id: number;
  name: string;
  grade: string | null;
  section: string | null;
  designation?: string | null;
}

export interface KioskAttendanceResult {
  matched: boolean;
  message: string;
  student: KioskAttendanceStudent | null;
  employee?: KioskAttendanceStudent | null;
  action:
    | "check_in"
    | "check_out"
    | "already_done"
    | "too_soon"
    | "session_closed"
    | null;
  time: string | null;
  confidence_score: number | null;
  notification_status: string | null;
}

export interface AttendanceSession {
  id: number;
  company_id: number;
  branch_id: number;
  class_id: number;
  branch_name: string | null;
  class_name: string | null;
  status: "active" | "stopped" | string;
  session_type: "check_in" | "check_out" | string;
  started_by_id: number;
  stopped_by_id: number | null;
  started_at: string;
  stopped_at: string | null;
  created_at: string;
}

export interface AttendanceSessionStatus {
  branch_id: number;
  class_id: number;
  active_session: AttendanceSession | null;
  active_check_in_session: AttendanceSession | null;
  active_check_out_session: AttendanceSession | null;
}

export interface AttendanceClassSessionStatus {
  class_id: number;
  class_name: string;
  student_count: number;
  active_session: AttendanceSession | null;
}

export interface NotificationLog {
  id: number;
  company_id: number;
  recipient_email: string | null;
  recipient_fcm_token: string | null;
  notification_type: string;
  event_type: string;
  status: string;
  message_content: string;
  error_message: string | null;
  created_at: string;
}

export interface PortalUser {
  id: number;
  name: string;
  email: string;
  role: string;
  company_id: number;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: string;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  role?: string;
  password?: string;
}

export interface Company {
  id: number;
  name: string;
  package: string;
  employee_limit: number;
  status: string;
  created_at: string;
}

export interface CompanyApiKeyResponse {
  company_id: number;
  api_key: string;
}

export interface CompanyKioskInfoResponse {
  company_id: number;
  name: string;
  school_logo: string | null;
  student_count: number;
  attendance_active: boolean;
  session_expires_at: string | null;
}

export interface SchoolClass {
  id: number;
  name: string;
  location: string | null;
}

export interface SchoolSettings {
  company_id: number;
  school_phone: string | null;
  school_contact: string | null;
  school_logo: string | null;
  hr_email: string | null;
  attendance_start_time: string;
  check_in_end_time: string | null;
  check_out_end_time: string | null;
  late_grace_minutes: number;
  default_session_duration_minutes: number;
}

export interface UpdateSchoolSettingsInput {
  school_phone?: string | null;
  school_contact?: string | null;
  school_logo?: string | null;
  hr_email?: string | null;
  attendance_start_time?: string;
  check_in_end_time?: string | null;
  check_out_end_time?: string | null;
  late_grace_minutes?: number;
  default_session_duration_minutes?: number;
}

const API_PAGE_SIZE = 100;
const FACE_REQUEST_TIMEOUT_MS = 125_000;
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api/backend";

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

const publicApi = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

function readCookie(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const prefix = `${encodeURIComponent(name)}=`;
  const cookie = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}

function attachCsrfToken(
  config: InternalAxiosRequestConfig,
): InternalAxiosRequestConfig {
  const method = config.method?.toUpperCase() ?? "GET";
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrfToken = readCookie(CSRF_COOKIE_NAME);
    if (csrfToken) {
      config.headers.set("X-CSRF-Token", csrfToken);
    }
  }
  return config;
}

api.interceptors.request.use(attachCsrfToken);
publicApi.interceptors.request.use(attachCsrfToken);

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 401 &&
      typeof window !== "undefined"
    ) {
      window.localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
      window.localStorage.removeItem(LEGACY_AUTH_USER_KEY);
      const pathname = window.location.pathname;
      const isExempt =
        pathname.startsWith("/admin") ||
        ["/login", "/signup", "/privacy", "/terms", "/data-deletion", "/kiosk"].some(
          (p) => pathname === p || pathname.startsWith(`${p}/`),
        );
      if (!isExempt) {
        window.location.assign("/login");
      }
    }
    return Promise.reject(error);
  },
);

export async function loginRequest(
  organizationName: string,
  email: string,
  password: string,
): Promise<LoginResponse> {
  const response = await api.post<LoginResponse>("/auth/login", {
    organization_name: organizationName,
    email,
    password,
  });
  return response.data;
}

export async function signupRequest(
  input: SignupInput,
): Promise<LoginResponse> {
  const response = await api.post<LoginResponse>("/auth/signup", input);
  return response.data;
}

export async function getCurrentUser(): Promise<User> {
  const response = await api.get<User>("/auth/me");
  return response.data;
}

export async function logoutRequest(): Promise<void> {
  await api.post("/auth/logout");
}

interface PageOptions {
  page?: number;
  perPage?: number;
  designation?: string;
}

export async function getEmployees(
  options: PageOptions = {},
): Promise<Employee[]> {
  const response = await api.get<Employee[]>("/employees", {
    params: {
      page: options.page ?? 1,
      per_page: options.perPage ?? API_PAGE_SIZE,
      designation: options.designation || undefined,
    },
  });
  return response.data;
}

export async function getAllEmployees(
  options: PageOptions = {},
): Promise<Employee[]> {
  const employees: Employee[] = [];
  let page = 1;

  while (true) {
    const records = await getEmployees({ ...options, page, perPage: API_PAGE_SIZE });
    employees.push(...records);

    if (records.length < API_PAGE_SIZE) {
      return employees;
    }

    page += 1;
  }
}

export async function getStudents(options: {
  grade?: string;
  section?: string;
  status?: string;
} = {}): Promise<Student[]> {
  const students: Student[] = [];
  let page = 1;

  while (true) {
    const response = await api.get<Student[]>("/students", {
      params: {
        grade: options.grade || undefined,
        section: options.section || undefined,
        status: options.status || undefined,
        page,
        per_page: API_PAGE_SIZE,
      },
    });
    students.push(...response.data);
    if (response.data.length < API_PAGE_SIZE) {
      return students;
    }
    page += 1;
  }
}

export async function createStudent(input: StudentInput): Promise<Student> {
  const response = await api.post<Student>("/students", input);
  return response.data;
}

export async function updateStudent(
  studentId: number,
  input: StudentUpdateInput,
): Promise<Student> {
  const response = await api.put<Student>(`/students/${studentId}`, input);
  return response.data;
}

export async function deleteStudent(studentId: number): Promise<void> {
  await api.delete(`/students/${studentId}`);
}



export async function importStudentsCsv(file: File): Promise<StudentImportResponse> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await api.post<StudentImportResponse>(
    "/students/import",
    formData,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return response.data;
}

export async function createEmployee(input: EmployeeInput): Promise<Employee> {
  const response = await api.post<Employee>("/employees", input);
  return response.data;
}

export async function updateEmployee(
  employeeId: number,
  input: EmployeeUpdateInput,
): Promise<Employee> {
  const response = await api.put<Employee>(`/employees/${employeeId}`, input);
  return response.data;
}

export async function deleteEmployee(employeeId: number): Promise<void> {
  await api.delete(`/employees/${employeeId}`);
}

export interface FaceEnrollResponse {
  success: boolean;
  student_id: number | null;
  employee_id?: number | null;
  message: string;
  profile_image: string | null;
}

export interface StudentFaceEnrollOptions {
  updateProfileImage?: boolean;
}

export async function enrollEmployeeFace(
  employeeId: number,
  image: string,
): Promise<FaceEnrollResponse> {
  const response = await api.post<FaceEnrollResponse>(
    `/face/employee-enroll/${employeeId}`,
    { images: [image] },
    { timeout: FACE_REQUEST_TIMEOUT_MS },
  );
  return response.data;
}

export async function enrollStudentFace(
  studentId: number,
  imageOrImages: string | string[],
  options: StudentFaceEnrollOptions = {},
): Promise<FaceEnrollResponse> {
  const images = Array.isArray(imageOrImages) ? imageOrImages : [imageOrImages];
  const response = await api.post<FaceEnrollResponse>(
    `/face/enroll/${studentId}`,
    {
      images,
      update_profile_image: options.updateProfileImage ?? false,
    },
    { timeout: FACE_REQUEST_TIMEOUT_MS },
  );
  return response.data;
}

export async function getAttendance(
  options: PageOptions = {},
): Promise<AttendanceRecord[]> {
  const response = await api.get<AttendanceRecord[]>("/attendance", {
    params: {
      page: options.page ?? 1,
      per_page: options.perPage ?? API_PAGE_SIZE,
    },
  });
  return response.data;
}

export async function getAllAttendance(): Promise<AttendanceRecord[]> {
  const attendance: AttendanceRecord[] = [];
  let page = 1;

  while (true) {
    const records = await getAttendance({ page, perPage: API_PAGE_SIZE });
    attendance.push(...records);

    if (records.length < API_PAGE_SIZE) {
      return attendance;
    }

    page += 1;
  }
}

export async function getAttendanceToday(
  classId?: number,
): Promise<AttendanceDashboardRecord[]> {
  const response = await api.get<AttendanceDashboardRecord[]>("/attendance/today", {
    params: classId ? { class_id: classId } : undefined,
  });
  return response.data;
}

export async function getAttendanceSessions(options: {
  classId?: number;
  branchId?: number;
  status?: string;
  page?: number;
  perPage?: number;
} = {}): Promise<AttendanceSession[]> {
  const classId = options.classId ?? options.branchId;
  const response = await api.get<AttendanceSession[]>("/attendance/sessions", {
    params: {
      class_id: classId || undefined,
      status: options.status || undefined,
      page: options.page ?? 1,
      per_page: options.perPage ?? API_PAGE_SIZE,
    },
  });
  return response.data;
}

export async function getActiveAttendanceSession(): Promise<AttendanceSessionStatus> {
  const response = await api.get<AttendanceSessionStatus>(
    "/attendance/sessions/active",
  );
  return response.data;
}

export async function getAttendanceClassSessionStatuses(): Promise<
  AttendanceClassSessionStatus[]
> {
  const response = await api.get<AttendanceClassSessionStatus[]>(
    "/attendance/sessions/classes",
  );
  return response.data;
}

export async function startAttendanceSession(
  sessionType: "check_in" | "check_out" = "check_in",
  sessionEndTimeLocal?: string | null,
): Promise<AttendanceSession> {
  const response = await api.post<AttendanceSession>(
    "/attendance/sessions/start",
    { session_type: sessionType, session_end_time_local: sessionEndTimeLocal ?? null },
  );
  return response.data;
}

export interface AttendanceSessionLaunchResponse {
  session: AttendanceSession;
  api_key: string;
}

export async function launchAttendanceKiosk(
  sessionType: "check_in" | "check_out",
): Promise<AttendanceSessionLaunchResponse> {
  const response = await api.post<AttendanceSessionLaunchResponse>(
    "/attendance/sessions/launch",
    { session_type: sessionType },
  );
  return response.data;
}

export async function stopAttendanceSession(
  sessionId: number,
): Promise<AttendanceSession> {
  const response = await api.post<AttendanceSession>(
    `/attendance/sessions/${sessionId}/stop`,
  );
  return response.data;
}

interface AttendanceHistoryOptions {
  startDate?: string;
  endDate?: string;
  studentId?: number;
  employeeId?: number;
  classId?: number;
  branchId?: number;
  page?: number;
  perPage?: number;
}

export async function getAttendanceHistory(
  options: AttendanceHistoryOptions = {},
): Promise<AttendanceDashboardRecord[]> {
  const classId = options.classId ?? options.branchId;
  const response = await api.get<AttendanceDashboardRecord[]>(
    "/attendance/history",
    {
      params: {
        start_date: options.startDate || undefined,
        end_date: options.endDate || undefined,
        student_id: options.studentId || undefined,
        employee_id: options.employeeId || undefined,
        class_id: classId || undefined,
        page: options.page ?? 1,
        per_page: options.perPage ?? API_PAGE_SIZE,
      },
    },
  );
  return response.data;
}

export async function updateManualAttendance(
  input: AttendanceManualUpdateInput,
): Promise<AttendanceDashboardRecord> {
  const response = await api.put<AttendanceDashboardRecord>(
    "/attendance/manual",
    input,
  );
  return response.data;
}

export async function exportAttendanceHistory(
  options: AttendanceHistoryOptions = {},
): Promise<Blob> {
  const classId = options.classId ?? options.branchId;
  const response = await api.get<Blob>("/attendance/export", {
    params: {
      start_date: options.startDate || undefined,
      end_date: options.endDate || undefined,
      student_id: options.studentId || undefined,
      employee_id: options.employeeId || undefined,
      class_id: classId || undefined,
    },
    responseType: "blob",
  });
  return response.data;
}

export async function getStaffAttendanceToday(): Promise<
  StaffAttendanceRecord[]
> {
  const response = await api.get<StaffAttendanceRecord[]>(
    "/attendance/today",
  );
  return response.data;
}

export async function getStaffAttendanceHistory(options: {
  startDate?: string;
  endDate?: string;
  employeeId?: number;
  status?: string;
  page?: number;
  perPage?: number;
} = {}): Promise<StaffAttendanceRecord[]> {
  const response = await api.get<StaffAttendanceRecord[]>(
    "/attendance/history",
    {
      params: {
        start_date: options.startDate || undefined,
        end_date: options.endDate || undefined,
        employee_id: options.employeeId || undefined,
        status: options.status || undefined,
        page: options.page ?? 1,
        per_page: options.perPage ?? API_PAGE_SIZE,
      },
    },
  );
  return response.data;
}

export async function exportStaffAttendanceHistory(options: {
  startDate?: string;
  endDate?: string;
  employeeId?: number;
  status?: string;
} = {}): Promise<Blob> {
  const response = await api.get<Blob>("/attendance/export", {
    params: {
      start_date: options.startDate || undefined,
      end_date: options.endDate || undefined,
      employee_id: options.employeeId || undefined,
      status: options.status || undefined,
    },
    responseType: "blob",
  });
  return response.data;
}

export async function updateStaffManualAttendance(
  input: AttendanceManualUpdateInput,
): Promise<StaffAttendanceRecord> {
  const response = await api.put<StaffAttendanceRecord>(
    "/attendance/manual",
    input,
  );
  return response.data;
}

export async function autoMarkAttendance(
  apiKey: string,
  image: string,
  actionType: "check_in" | "check_out" = "check_in",
): Promise<KioskAttendanceResult> {
  const response = await publicApi.post<KioskAttendanceResult>(
    "/attendance/auto-mark",
    { image, action_type: actionType },
    {
      headers: { "X-API-Key": apiKey },
      timeout: FACE_REQUEST_TIMEOUT_MS,
    },
  );
  return response.data;
}

export async function getKioskCompanyInfo(
  apiKey: string,
): Promise<CompanyKioskInfoResponse> {
  const response = await publicApi.get<CompanyKioskInfoResponse>(
    "/companies/kiosk-info",
    {
      headers: { "X-API-Key": apiKey },
    },
  );
  return response.data;
}

export async function getUsers(): Promise<PortalUser[]> {
  const response = await api.get<PortalUser[]>("/users");
  return response.data;
}

export async function createUser(input: CreateUserInput): Promise<PortalUser> {
  const response = await api.post<PortalUser>("/users", input);
  return response.data;
}

export async function updateUser(
  userId: number,
  input: UpdateUserInput,
): Promise<PortalUser> {
  const response = await api.put<PortalUser>(`/users/${userId}`, input);
  return response.data;
}

export async function deactivateUser(userId: number): Promise<void> {
  await api.delete(`/users/${userId}`);
}

export async function permanentlyDeleteUser(userId: number): Promise<void> {
  await api.delete(`/users/${userId}/permanent`);
}

export async function activateUser(userId: number): Promise<PortalUser> {
  const response = await api.post<PortalUser>(`/users/${userId}/activate`);
  return response.data;
}

export async function getCompanies(): Promise<Company[]> {
  const response = await api.get<Company[]>("/companies");
  return response.data;
}

export async function getCompanyApiKey(
  companyId: number,
): Promise<CompanyApiKeyResponse> {
  const response = await api.get<CompanyApiKeyResponse>(
    `/companies/${companyId}/api-key`,
  );
  return response.data;
}

export async function getSchoolClasses(
  companyId: number,
): Promise<SchoolClass[]> {
  const response = await api.get<SchoolClass[]>(
    `/companies/${companyId}/classes`,
  );
  return response.data;
}

export async function regenerateCompanyApiKey(
  companyId: number,
): Promise<CompanyApiKeyResponse> {
  const response = await api.post<CompanyApiKeyResponse>(
    `/companies/${companyId}/regenerate-key`,
  );
  return response.data;
}

export async function getSchoolSettings(
  companyId: number,
): Promise<SchoolSettings> {
  const response = await api.get<SchoolSettings>(`/companies/${companyId}/settings`);
  return response.data;
}

export async function updateSchoolSettings(
  companyId: number,
  input: UpdateSchoolSettingsInput,
): Promise<SchoolSettings> {
  const response = await api.put<SchoolSettings>(
    `/companies/${companyId}/settings`,
    input,
  );
  return response.data;
}

export async function getNotificationLogs(options: {
  limit?: number;
  offset?: number;
} = {}): Promise<NotificationLog[]> {
  const response = await api.get<NotificationLog[]>("/notifications/logs", {
    params: {
      limit: options.limit ?? 50,
      offset: options.offset ?? 0,
    },
  });
  return response.data;
}

export async function registerDeviceToken(fcmToken: string, deviceName?: string): Promise<void> {
  await api.post("/notifications/device-tokens", {
    fcm_token: fcmToken,
    device_name: deviceName ?? "Web Browser",
  });
}

export async function removeDeviceToken(fcmToken: string): Promise<void> {
  await api.delete(`/notifications/device-tokens/${fcmToken}`);
}

export default api;
