import axios from "axios";

export const AUTH_TOKEN_KEY = "face_attendance_token";
export const AUTH_USER_KEY = "face_attendance_user";

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  company_id: number;
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
  has_face_enrolled: boolean;
}

export interface EmployeeInput {
  name: string;
  email: string;
  phone: string | null;
  designation: string | null;
  department: string | null;
  headshot_url?: string | null;
  branch_id?: number;
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
}

export interface AttendanceRecord {
  id: number;
  employee_id: number;
  company_id: number;
  check_in: string;
  check_out: string | null;
  status: string;
  confidence_score: number | null;
  created_at: string;
}

const API_PAGE_SIZE = 100;

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = window.localStorage.getItem(AUTH_TOKEN_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 401 &&
      typeof window !== "undefined"
    ) {
      window.localStorage.removeItem(AUTH_TOKEN_KEY);
      window.localStorage.removeItem(AUTH_USER_KEY);
      if (window.location.pathname !== "/login") {
        window.location.assign("/login");
      }
    }
    return Promise.reject(error);
  },
);

export async function loginRequest(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const response = await api.post<LoginResponse>("/auth/login", {
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

interface PageOptions {
  page?: number;
  perPage?: number;
}

export async function getEmployees(
  options: PageOptions = {},
): Promise<Employee[]> {
  const response = await api.get<Employee[]>("/employees", {
    params: {
      page: options.page ?? 1,
      per_page: options.perPage ?? API_PAGE_SIZE,
    },
  });
  return response.data;
}

export async function getAllEmployees(): Promise<Employee[]> {
  const employees: Employee[] = [];
  let page = 1;

  while (true) {
    const records = await getEmployees({ page, perPage: API_PAGE_SIZE });
    employees.push(...records);

    if (records.length < API_PAGE_SIZE) {
      return employees;
    }

    page += 1;
  }
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
  employee_id: number;
  message: string;
}

export async function enrollEmployeeFace(
  employeeId: number,
  image: string,
): Promise<FaceEnrollResponse> {
  const response = await api.post<FaceEnrollResponse>(
    `/face/enroll/${employeeId}`,
    { image },
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

export default api;
