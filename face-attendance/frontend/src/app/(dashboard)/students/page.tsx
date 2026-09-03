"use client";

import {
  Edit,
  FileUp,
  Search,
  ShieldCheck,
  ShieldX,
  Trash2,
  UserPlus,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";

import { ApiError } from "@/components/api-error";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { AddStudentModal } from "@/components/students/AddStudentModal";
import { StudentAvatar } from "@/components/students/StudentAvatar";
import { StudentFaceEnrollModal } from "@/components/students/StudentFaceEnrollModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  deleteStudent,
  getStudents,
  importStudentsCsv,
  type Student,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/errors";
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
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide",
        hasFaceEnrolled
          ? "bg-blue-50 text-blue-700 ring-1 ring-blue-600/10"
          : "bg-amber-50 text-amber-700 ring-1 ring-amber-600/10",
      )}
    >
      {hasFaceEnrolled ? (
        <ShieldCheck aria-hidden="true" className="size-3.5" />
      ) : (
        <ShieldX aria-hidden="true" className="size-3.5" />
      )}
      {hasFaceEnrolled ? "Enrolled" : "Not Enrolled"}
    </span>
  );
}



function StudentActions({
  student,
  isDeactivating,
  className,
  onEdit,
  onEnroll,
  onRemove,
}: Readonly<{
  student: Student;
  isDeactivating: boolean;
  className?: string;
  onEdit: () => void;
  onEnroll: () => void;
  onRemove: () => void;
}>) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="gap-1"
        disabled={isDeactivating}
        onClick={onEdit}
      >
        <Edit aria-hidden="true" className="size-3" />
        Edit
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={isDeactivating}
        onClick={onEnroll}
      >
        {student.has_face_enrolled ? "Update Face" : "Enroll Face"}
      </Button>

      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="gap-1 text-red-600 hover:text-red-700"
        disabled={isDeactivating}
        onClick={onRemove}
      >
        <Trash2 aria-hidden="true" className="size-3" />
        {isDeactivating ? "Deactivating..." : "Deactivate"}
      </Button>
    </div>
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
  const [actionError, setActionError] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [enrollingStudent, setEnrollingStudent] = useState<Student | null>(null);
  const [pendingRemoveStudent, setPendingRemoveStudent] =
    useState<Student | null>(null);
  const [removingStudentId, setRemovingStudentId] = useState<
    number | null
  >(null);

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
      (student.student_code && student.student_code.toLowerCase().includes(normalizedSearch))
    );
  });
  const hasActiveFilters = Boolean(
    searchTerm.trim() || gradeFilter || sectionFilter,
  );

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
    setActionError(null);
    setToastMessage(mode === "created" ? "Student added" : "Student updated");
  }

  async function handleRemoveStudent(): Promise<void> {
    const student = pendingRemoveStudent;
    if (!student || removingStudentId !== null) {
      return;
    }

    setRemovingStudentId(student.id);
    setActionError(null);
    try {
      await deleteStudent(student.id);
      setStudents((currentStudents) =>
        currentStudents.filter((record) => record.id !== student.id),
      );
      setToastMessage("Student permanently removed.");
      setPendingRemoveStudent(null);
    } catch (deleteError) {
      setActionError(
        getApiErrorMessage(deleteError, "Unable to remove this student."),
      );
    } finally {
      setRemovingStudentId(null);
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



  function handleFaceEnrolled(
    studentId: number,
    profileImage: string | null,
  ): void {
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
    <section className="animate-page-enter space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            <span className="text-gradient">Students</span>
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground text-pretty">
            Manage student records, parent contacts, and face enrollment.
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
            className="w-full gap-2 shadow-sm sm:w-auto"
            onClick={() => fileInputRef.current?.click()}
          >
            <FileUp aria-hidden="true" className="size-4" />
            Import CSV
          </Button>
          <Button
            type="button"
            className="w-full gap-2 shadow-md sm:w-auto"
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

      <div className="grid gap-3 rounded-xl border bg-card p-4 shadow-card md:grid-cols-[1fr_auto_auto]">
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
          className="h-10 rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
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
          className="h-10 rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
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
        <p
          className="animate-fade-in rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-700 shadow-sm"
          role="status"
          aria-live="polite"
        >
          ✓ {toastMessage}
        </p>
      ) : null}

      {hasError ? (
        <ApiError
          onRetry={() => void loadStudents()}
          isRetrying={isLoading}
        />
      ) : null}

      {actionError ? (
        <p
          className="animate-fade-in rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700 shadow-sm"
          role="alert"
        >
          {actionError}
        </p>
      ) : null}

      <div className="grid gap-3 md:hidden">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, index) => (
            <div key={`skeleton-mobile-${index}`} className="rounded-xl border bg-card p-4 shadow-card">
              <div className="flex items-center gap-3">
                <div className="skeleton size-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-32 rounded" />
                  <div className="skeleton h-3 w-24 rounded" />
                </div>
              </div>
            </div>
          ))
        ) : null}
        {!isLoading && visibleStudents.length === 0 ? (
          <div className="rounded-xl border bg-card p-8 text-center shadow-card">
            <p className="font-medium">
              {hasActiveFilters ? "No matching students" : "No students yet"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {hasActiveFilters
                ? "Try a different name, class, or section."
                : "Add the first student to begin attendance setup."}
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-4"
              onClick={() => {
                if (hasActiveFilters) {
                  setSearchTerm("");
                  setGradeFilter("");
                  setSectionFilter("");
                } else {
                  setIsAddModalOpen(true);
                }
              }}
            >
              {hasActiveFilters ? "Clear filters" : "Add Student"}
            </Button>
          </div>
        ) : null}
        {visibleStudents.map((student) => (
          <article className="card-hover rounded-xl border bg-card p-4 shadow-card" key={student.id}>
            <div className="flex items-start gap-3">
              <StudentAvatar student={student} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{student.student_name}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {student.student_code} · {student.grade}-{student.section}
                </p>
              </div>
              <FaceBadge hasFaceEnrolled={student.has_face_enrolled} />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Parent</dt>
                <dd className="mt-0.5 truncate font-medium">
                  {student.parent_name || <span className="text-muted-foreground font-normal italic">Not provided</span>}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Contact</dt>
                <dd className="mt-0.5 tabular-nums">
                  {student.parent_phone ? maskPhone(student.parent_phone) : <span className="text-muted-foreground font-normal italic">Not provided</span>}
                </dd>
              </div>
            </dl>
            <StudentActions
              student={student}
              className="mt-4 grid grid-cols-2"
              isDeactivating={removingStudentId === student.id}
              onEdit={() => setEditingStudent(student)}
              onEnroll={() => setEnrollingStudent(student)}
              onRemove={() => {
                setActionError(null);
                setPendingRemoveStudent(student);
              }}
            />
          </article>
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border bg-card shadow-card md:block">
        <table className="min-w-[1050px] w-full text-left text-sm">
          <thead className="border-b bg-muted/30">
            <tr>
              <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Photo</th>
              <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
              <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Roll No</th>
              <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Grade & Section</th>
              <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Parent Name</th>
              <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Parent Phone</th>
              <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Face</th>
              <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <tr key={`skeleton-${index}`}>
                  {Array.from({ length: 8 }).map((_, colIndex) => (
                    <td key={colIndex} className="px-4 py-4">
                      <div className="skeleton h-4 w-20 rounded" />
                    </td>
                  ))}
                </tr>
              ))
            ) : null}
            {!isLoading && visibleStudents.length === 0 ? (
              <tr>
                <td className="px-4 py-12 text-center text-muted-foreground" colSpan={8}>
                  No students found.
                </td>
              </tr>
            ) : null}
            {visibleStudents.map((student) => (
              <tr className="transition-colors hover:bg-muted/30" key={student.id}>
                <td className="px-4 py-3.5">
                  <StudentAvatar student={student} />
                </td>
                <td className="px-4 py-3.5 font-medium">{student.student_name}</td>
                <td className="px-4 py-3.5 text-muted-foreground">{student.student_code}</td>
                <td className="px-4 py-3.5">
                  {student.grade}-{student.section}
                </td>
                <td className="px-4 py-3.5">
                  {student.parent_name ? student.parent_name : <span className="text-muted-foreground italic">Not provided</span>}
                </td>
                <td className="px-4 py-3.5 tabular-nums text-muted-foreground">
                  {student.parent_phone ? maskPhone(student.parent_phone) : <span className="italic">Not provided</span>}
                </td>
                <td className="px-4 py-3.5">
                  <FaceBadge hasFaceEnrolled={student.has_face_enrolled} />
                </td>
                <td className="px-4 py-3.5">
                  <StudentActions
                    student={student}
                    isDeactivating={removingStudentId === student.id}
                    onEdit={() => setEditingStudent(student)}
                    onEnroll={() => setEnrollingStudent(student)}
                    onRemove={() => {
                      setActionError(null);
                      setPendingRemoveStudent(student);
                    }}
                  />
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



      <ConfirmDialog
        open={pendingRemoveStudent !== null}
        title="Remove student permanently?"
        description={
          pendingRemoveStudent
            ? `${pendingRemoveStudent.student_name} will be permanently removed. This will also remove their face enrollment and attendance history.`
            : "This student will be permanently removed."
        }
        confirmLabel="Remove student"
        busyLabel="Removing..."
        destructive
        isConfirming={removingStudentId !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setPendingRemoveStudent(null);
          }
        }}
        onConfirm={() => void handleRemoveStudent()}
      />
    </section>
  );
}
