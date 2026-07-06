"use client";

import {
  Edit,
  FileUp,
  MessageSquareText,
  Search,
  ShieldCheck,
  ShieldX,
  Trash2,
  UserPlus,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";

import { ApiError } from "@/components/api-error";
import { AddStudentModal } from "@/components/students/AddStudentModal";
import { StudentAvatar } from "@/components/students/StudentAvatar";
import { StudentFaceEnrollModal } from "@/components/students/StudentFaceEnrollModal";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  deleteStudent,
  getStudentWhatsappLogs,
  getStudents,
  importStudentsCsv,
  type Student,
  type WhatsappLog,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const grades = Array.from({ length: 12 }, (_, index) => `Class ${index + 1}`);
const sections = ["A", "B", "C", "D"];

function maskPhone(phone: string): string {
  if (phone.length < 7) {
    return phone;
  }
  return `${phone.slice(0, 3)}***${phone.slice(-4)}`;
}

function FaceBadge({ hasFaceEnrolled }: Readonly<{ hasFaceEnrolled: boolean }>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium",
        hasFaceEnrolled
          ? "bg-blue-50 text-blue-700"
          : "bg-amber-50 text-amber-700",
      )}
    >
      {hasFaceEnrolled ? (
        <ShieldCheck aria-hidden="true" className="size-3" />
      ) : (
        <ShieldX aria-hidden="true" className="size-3" />
      )}
      {hasFaceEnrolled ? "Enrolled ✓" : "Not Enrolled ✕"}
    </span>
  );
}

function LogsModal({
  student,
  logs,
  open,
  onOpenChange,
}: Readonly<{
  student: Student | null;
  logs: WhatsappLog[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>WhatsApp logs</DialogTitle>
          <DialogDescription>
            {student
              ? `Messages sent for ${student.student_name}.`
              : "Student WhatsApp message history."}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60dvh] overflow-y-auto rounded-lg border">
          <table className="min-w-[720px] w-full text-left text-sm">
            <thead className="border-b bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Message</th>
                <th className="px-4 py-3 font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-muted-foreground" colSpan={5}>
                    No WhatsApp messages found for this student.
                  </td>
                </tr>
              ) : null}
              {logs.map((log) => (
                <tr key={log.id} className="border-b last:border-0">
                  <td className="px-4 py-3 tabular-nums">
                    {maskPhone(log.parent_phone)}
                  </td>
                  <td className="px-4 py-3">{log.message_type}</td>
                  <td className="px-4 py-3">{log.status}</td>
                  <td className="max-w-xs truncate px-4 py-3">
                    {log.message_body}
                  </td>
                  <td className="px-4 py-3">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function StudentsPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [enrollingStudent, setEnrollingStudent] = useState<Student | null>(null);
  const [logsStudent, setLogsStudent] = useState<Student | null>(null);
  const [logs, setLogs] = useState<WhatsappLog[]>([]);

  const loadStudents = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      const records = await getStudents({
        grade: gradeFilter,
        section: sectionFilter,
        status: "active",
      });
      setStudents(records);
      setHasError(false);
    } catch {
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, [gradeFilter, sectionFilter]);

  useEffect(() => {
    void Promise.resolve().then(loadStudents);
  }, [loadStudents]);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }
    const timeout = window.setTimeout(() => setToastMessage(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  const visibleStudents = students.filter((student) => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return (
      normalizedSearch.length === 0 ||
      student.student_name.toLowerCase().includes(normalizedSearch) ||
      student.student_code.toLowerCase().includes(normalizedSearch)
    );
  });

  function handleSavedStudent(student: Student, mode: "created" | "updated"): void {
    setStudents((currentStudents) => {
      const exists = currentStudents.some((record) => record.id === student.id);
      if (!exists) {
        return [...currentStudents, student].sort((a, b) =>
          a.student_name.localeCompare(b.student_name),
        );
      }
      return currentStudents.map((record) =>
        record.id === student.id ? student : record,
      );
    });
    setEditingStudent(null);
    setToastMessage(mode === "created" ? "Student added" : "Student updated");
  }

  async function handleDeleteStudent(student: Student): Promise<void> {
    try {
      await deleteStudent(student.id);
      setStudents((currentStudents) =>
        currentStudents.filter((record) => record.id !== student.id),
      );
      setToastMessage("Student removed");
    } catch {
      setHasError(true);
    }
  }

  async function handleImportCsv(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    try {
      const result = await importStudentsCsv(file);
      setToastMessage(`Imported ${result.created} students, ${result.failed} failed`);
      await loadStudents();
    } catch {
      setHasError(true);
    }
  }

  async function handleViewLogs(student: Student): Promise<void> {
    setLogsStudent(student);
    try {
      setLogs(await getStudentWhatsappLogs(student.id));
      setHasError(false);
    } catch {
      setHasError(true);
      setLogs([]);
    }
  }

  function handleFaceEnrolled(studentId: number, profileImage: string): void {
    setStudents((currentStudents) =>
      currentStudents.map((student) =>
        student.id === studentId
          ? { ...student, has_face_enrolled: true, profile_image: profileImage }
          : student,
      ),
    );
    setToastMessage("Face enrolled successfully");
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-balance sm:text-3xl">
            Students
          </h1>
          <p className="mt-2 text-muted-foreground text-pretty">
            Manage student records, parent WhatsApp contacts, and face enrollment.
          </p>
        </div>
        <div className="grid gap-2 sm:flex">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => void handleImportCsv(event)}
          />
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2 sm:w-auto"
            onClick={() => fileInputRef.current?.click()}
          >
            <FileUp aria-hidden="true" className="size-4" />
            Import CSV
          </Button>
          <Button
            type="button"
            className="w-full gap-2 sm:w-auto"
            onClick={() => {
              setEditingStudent(null);
              setIsAddModalOpen(true);
            }}
          >
            <UserPlus aria-hidden="true" className="size-4" />
            Add Student
          </Button>
        </div>
      </div>

      <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Search
            aria-hidden="true"
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Search students by name or roll number"
            className="pl-9"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search by name or roll number"
          />
        </div>
        <select
          aria-label="Filter by grade"
          value={gradeFilter}
          onChange={(event) => setGradeFilter(event.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">All Grades</option>
          {grades.map((grade) => (
            <option key={grade} value={grade}>
              {grade}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by section"
          value={sectionFilter}
          onChange={(event) => setSectionFilter(event.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">All Sections</option>
          {sections.map((section) => (
            <option key={section} value={section}>
              Section {section}
            </option>
          ))}
        </select>
      </div>

      {toastMessage ? (
        <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-medium text-green-700">
          {toastMessage}
        </p>
      ) : null}

      {hasError ? <ApiError /> : null}

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="min-w-[1050px] w-full text-left text-sm">
          <thead className="border-b bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Photo</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Roll No</th>
              <th className="px-4 py-3 font-medium">Grade & Section</th>
              <th className="px-4 py-3 font-medium">Parent Name</th>
              <th className="px-4 py-3 font-medium">Parent Phone</th>
              <th className="px-4 py-3 font-medium">Face</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td className="px-4 py-6 text-muted-foreground" colSpan={8}>
                  Loading students...
                </td>
              </tr>
            ) : null}
            {!isLoading && visibleStudents.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-muted-foreground" colSpan={8}>
                  No students found.
                </td>
              </tr>
            ) : null}
            {visibleStudents.map((student) => (
              <tr className="border-b last:border-0" key={student.id}>
                <td className="px-4 py-3">
                  <StudentAvatar student={student} />
                </td>
                <td className="px-4 py-3 font-medium">{student.student_name}</td>
                <td className="px-4 py-3">{student.student_code}</td>
                <td className="px-4 py-3">
                  {student.grade}-{student.section}
                </td>
                <td className="px-4 py-3">{student.parent_name}</td>
                <td className="px-4 py-3 tabular-nums">
                  {maskPhone(student.parent_phone)}
                </td>
                <td className="px-4 py-3">
                  <FaceBadge hasFaceEnrolled={student.has_face_enrolled} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      onClick={() => setEditingStudent(student)}
                    >
                      <Edit aria-hidden="true" className="size-3" />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setEnrollingStudent(student)}
                    >
                      {student.has_face_enrolled ? "Update Face" : "Enroll Face"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      onClick={() => void handleViewLogs(student)}
                    >
                      <MessageSquareText aria-hidden="true" className="size-3" />
                      View Logs
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="gap-1 text-red-600 hover:text-red-700"
                      onClick={() => void handleDeleteStudent(student)}
                    >
                      <Trash2 aria-hidden="true" className="size-3" />
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isAddModalOpen || editingStudent !== null ? (
        <AddStudentModal
          key={editingStudent?.id ?? "new-student"}
          open
          student={editingStudent}
          onOpenChange={(open) => {
            setIsAddModalOpen(open);
            if (!open) {
              setEditingStudent(null);
            }
          }}
          onSaved={handleSavedStudent}
        />
      ) : null}

      {enrollingStudent ? (
        <StudentFaceEnrollModal
          open
          student={enrollingStudent}
          onOpenChange={(open) => {
            if (!open) {
              setEnrollingStudent(null);
            }
          }}
          onEnrolled={handleFaceEnrolled}
        />
      ) : null}

      <LogsModal
        student={logsStudent}
        logs={logs}
        open={logsStudent !== null}
        onOpenChange={(open) => {
          if (!open) {
            setLogsStudent(null);
            setLogs([]);
          }
        }}
      />
    </section>
  );
}
