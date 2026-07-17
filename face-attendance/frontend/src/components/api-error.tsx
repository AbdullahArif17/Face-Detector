"use client";

import { AlertCircle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ApiError({
  title = "We couldn't load this data.",
  message = "Check your connection and try again. If the problem continues, contact your administrator.",
  onRetry,
  isRetrying = false,
}: Readonly<{
  title?: string;
  message?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
}>) {
  return (
    <div
      className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between"
      role="alert"
    >
      <div className="flex min-w-0 gap-3">
        <AlertCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <div>
          <p className="font-medium">{title}</p>
          <p className="mt-1 text-pretty text-red-700">{message}</p>
        </div>
      </div>
      {onRetry ? (
        <Button
          type="button"
          variant="outline"
          className="w-full shrink-0 gap-2 border-red-300 bg-white text-red-800 hover:bg-red-100 sm:w-auto"
          disabled={isRetrying}
          onClick={onRetry}
        >
          <RefreshCw
            aria-hidden="true"
            className={`size-4 ${isRetrying ? "animate-spin" : ""}`}
          />
          {isRetrying ? "Trying again..." : "Try again"}
        </Button>
      ) : null}
    </div>
  );
}
