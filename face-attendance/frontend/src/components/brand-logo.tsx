import Image from "next/image";

import { cn } from "@/lib/utils";

interface BrandLogoProps {
  className?: string;
  label?: string;
  markClassName?: string;
  nameClassName?: string;
  priority?: boolean;
  showName?: boolean;
}

export function BrandLogo({
  className,
  label = "Face Attendance",
  markClassName,
  nameClassName,
  priority = false,
  showName = true,
}: BrandLogoProps) {
  return (
    <span
      className={cn("inline-flex min-w-0 items-center gap-2.5", className)}
      aria-label={showName ? undefined : label}
      role={showName ? undefined : "img"}
    >
      <span
        className={cn(
          "relative size-9 shrink-0 overflow-hidden rounded-xl bg-blue-600 shadow-sm",
          markClassName,
        )}
      >
        <Image
          src="/images/face-attendance-logo.png"
          alt=""
          fill
          priority={priority}
          sizes="64px"
          className="object-cover"
        />
      </span>
      {showName ? (
        <span className={cn("truncate font-semibold tracking-tight", nameClassName)}>
          {label}
        </span>
      ) : null}
    </span>
  );
}
