const backendUrl =
  process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000";

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

export class BackendUnavailableError extends Error {
  constructor() {
    super("The backend API is unavailable.");
    this.name = "BackendUnavailableError";
  }
}

async function getJson<T>(path: string): Promise<T> {
  try {
    const response = await fetch(`${backendUrl}${path}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new BackendUnavailableError();
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof BackendUnavailableError) {
      throw error;
    }
    throw new BackendUnavailableError();
  }
}

export function getEmployees(): Promise<Employee[]> {
  return getJson<Employee[]>("/employees");
}

export function getAttendance(): Promise<AttendanceRecord[]> {
  return getJson<AttendanceRecord[]>("/attendance");
}
