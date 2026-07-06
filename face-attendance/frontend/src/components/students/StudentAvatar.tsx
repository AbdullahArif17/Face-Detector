import type { Student } from "@/lib/api";
import { cn } from "@/lib/utils";

export function StudentAvatar({
  student,
  className,
}: Readonly<{ student: Student; className?: string }>) {
  if (student.profile_image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt={`${student.student_name} profile`}
        src={student.profile_image}
        className={cn("size-10 rounded-full border object-cover", className)}
      />
    );
  }

  const initials = student.student_name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className={cn(
        "flex size-10 items-center justify-center rounded-full border bg-muted text-xs font-semibold text-muted-foreground",
        className,
      )}
    >
      {initials}
    </div>
  );
}
