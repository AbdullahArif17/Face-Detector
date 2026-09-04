"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-full min-h-[400px] flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <AlertTriangle className="size-8" />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">
          Something went wrong
        </h2>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
          An unexpected error occurred. Please try again or contact support if
          the issue persists.
        </p>
      </div>
      <Button
        onClick={() => reset()}
        className="gap-2"
        variant="outline"
      >
        <RotateCcw className="size-4" />
        Try again
      </Button>
    </div>
  );
}
