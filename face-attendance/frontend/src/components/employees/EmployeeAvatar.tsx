import { cn } from "@/lib/utils";
import type { Employee } from "@/lib/api";

interface EmployeeAvatarProps {
  employee: Pick<Employee, "name" | "headshot_url">;
  className?: string;
}

function initialsFromName(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function EmployeeAvatar({ employee, className }: EmployeeAvatarProps) {
  const initials = initialsFromName(employee.name) || "?";

  if (employee.headshot_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt={`${employee.name} headshot`}
        src={employee.headshot_url}
        className={cn(
          "size-10 rounded-full border object-cover shadow-sm",
          className,
        )}
      />
    );
  }

  return (
    <span
      aria-label={`${employee.name} initials`}
      className={cn(
        "inline-flex size-10 items-center justify-center rounded-full border bg-muted text-sm font-semibold text-muted-foreground shadow-sm",
        className,
      )}
    >
      {initials}
    </span>
  );
}
