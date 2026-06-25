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
  status: string;
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

export async function getEmployees(): Promise<Employee[]> {
  const response = await api.get<Employee[]>("/employees");
  return response.data;
}

export async function getAttendance(): Promise<AttendanceRecord[]> {
  const response = await api.get<AttendanceRecord[]>("/attendance");
  return response.data;
}

export default api;
