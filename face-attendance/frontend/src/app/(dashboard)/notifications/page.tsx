"use client";

import { Eye, RefreshCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError } from "@/components/api-error";
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
  getWhatsappLogs,
  getWhatsappStats,
  retryFailedWhatsapp,
  type WhatsappLog,
  type WhatsappStats,
} from "@/lib/api";
import { cn } from "@/lib/utils";

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function maskPhone(phone: string): string {
  if (phone.length < 7) {
    return phone;
  }
  return `${phone.slice(0, 3)}***${phone.slice(-4)}`;
}

function TypeBadge({ type }: Readonly<{ type: string }>) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-1 text-xs font-medium",
        type === "check_in"
          ? "bg-green-50 text-green-700"
          : type === "check_out"
            ? "bg-blue-50 text-blue-700"
            : type === "absent"
              ? "bg-orange-50 text-orange-700"
              : "bg-slate-100 text-slate-600",
      )}
    >
      {type.replace("_", " ")}
    </span>
  );
}

function StatusBadge({ status }: Readonly<{ status: string }>) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-1 text-xs font-medium",
        ["sent", "delivered", "read"].includes(status)
          ? "bg-green-50 text-green-700"
          : status === "failed"
            ? "bg-red-50 text-red-700"
            : "bg-yellow-50 text-yellow-700",
      )}
    >
      {status}
    </span>
  );
}

export default function NotificationsPage() {
  const [stats, setStats] = useState<WhatsappStats | null>(null);
  const [logs, setLogs] = useState<WhatsappLog[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayInputValue());
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [selectedLog, setSelectedLog] = useState<WhatsappLog | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const loadData = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      const [statsResponse, logsResponse] = await Promise.all([
        getWhatsappStats(),
        getWhatsappLogs({
          date: selectedDate,
          status: statusFilter,
          messageType: typeFilter,
        }),
      ]);
      setStats(statsResponse);
      setLogs(logsResponse);
      setHasError(false);
    } catch {
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate, statusFilter, typeFilter]);

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, [loadData]);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }
    const timeout = window.setTimeout(() => setToastMessage(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  const summaryCards = useMemo(
    () => [
      { label: "Sent Today", value: stats?.sent_today ?? 0 },
      { label: "Failed Today", value: stats?.failed_today ?? 0 },
      { label: "Total This Month", value: stats?.total_this_month ?? 0 },
      { label: "Success Rate", value: `${stats?.success_rate ?? 0}%` },
    ],
    [stats],
  );

  async function handleRetryFailed(): Promise<void> {
    if (isRetrying) {
      return;
    }
    setIsRetrying(true);
    try {
      const result = await retryFailedWhatsapp();
      setToastMessage(
        `Retried ${result.retried}; ${result.success} sent, ${result.still_failed} still failed`,
      );
      await loadData();
    } catch {
      setHasError(true);
    } finally {
      setIsRetrying(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-balance sm:text-3xl">
            Notifications
          </h1>
          <p className="mt-2 text-muted-foreground text-pretty">
            WhatsApp parent notification delivery and failure tracking.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-full gap-2 sm:w-auto"
          disabled={isRetrying}
          onClick={() => void handleRetryFailed()}
        >
          <RefreshCcw aria-hidden="true" className="size-4" />
          {isRetrying ? "Retrying..." : "Retry Failed Today"}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <div key={card.label} className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">{card.label}</p>
            <p className="mt-2 text-2xl font-bold tabular-nums">
              {card.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-3">
        <div className="grid gap-2">
          <label className="text-sm font-medium" htmlFor="notification-date">
            Date
          </label>
          <Input
            id="notification-date"
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <label className="text-sm font-medium" htmlFor="notification-status">
            Status
          </label>
          <select
            id="notification-status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">All statuses</option>
            <option value="sent">Sent</option>
            <option value="delivered">Delivered</option>
            <option value="read">Read</option>
            <option value="failed">Failed</option>
            <option value="pending">Pending</option>
          </select>
        </div>
        <div className="grid gap-2">
          <label className="text-sm font-medium" htmlFor="notification-type">
            Message type
          </label>
          <select
            id="notification-type"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">All types</option>
            <option value="check_in">Check-in</option>
            <option value="check_out">Check-out</option>
            <option value="absent">Absent</option>
          </select>
        </div>
      </div>

      {toastMessage ? (
        <p
          className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-medium text-green-700"
          role="status"
          aria-live="polite"
        >
          {toastMessage}
        </p>
      ) : null}
      {hasError ? (
        <ApiError onRetry={() => void loadData()} isRetrying={isLoading} />
      ) : null}

      <div className="grid gap-3 md:hidden">
        {isLoading ? (
          <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">
            Loading notification logs...
          </div>
        ) : null}
        {!isLoading && logs.length === 0 ? (
          <div className="rounded-lg border bg-card p-5 text-center">
            <p className="font-medium">No WhatsApp activity</p>
            <p className="mt-1 text-sm text-muted-foreground">
              No messages match the selected date and filters.
            </p>
          </div>
        ) : null}
        {logs.map((log) => (
          <article className="rounded-lg border bg-card p-4" key={`${log.id}-mobile`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">
                  {log.student_name ?? `Student #${log.student_id}`}
                </p>
                <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">
                  {maskPhone(log.parent_phone)}
                </p>
              </div>
              <StatusBadge status={log.status} />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
              <TypeBadge type={log.message_type} />
              <time className="text-xs text-muted-foreground">
                {new Date(log.created_at).toLocaleString()}
              </time>
            </div>
            <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
              {log.message_body}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-4 w-full gap-1"
              onClick={() => setSelectedLog(log)}
            >
              <Eye aria-hidden="true" className="size-3" />
              {log.status === "failed" ? "View message and error" : "View full message"}
            </Button>
          </article>
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
        <table className="min-w-[980px] w-full text-left text-sm">
          <thead className="border-b bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Student Name</th>
              <th className="px-4 py-3 font-medium">Parent Phone</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Message Preview</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td className="px-4 py-6 text-muted-foreground" colSpan={7}>
                  Loading notification logs...
                </td>
              </tr>
            ) : null}
            {!isLoading && logs.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-muted-foreground" colSpan={7}>
                  No WhatsApp logs found.
                </td>
              </tr>
            ) : null}
            {logs.map((log) => (
              <tr key={log.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-medium">
                  {log.student_name ?? `Student #${log.student_id}`}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {maskPhone(log.parent_phone)}
                </td>
                <td className="px-4 py-3">
                  <TypeBadge type={log.message_type} />
                </td>
                <td className="max-w-xs truncate px-4 py-3">
                  {log.message_body.slice(0, 60)}
                  {log.message_body.length > 60 ? "..." : ""}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={log.status} />
                </td>
                <td className="px-4 py-3">
                  {new Date(log.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      onClick={() => setSelectedLog(log)}
                    >
                      <Eye aria-hidden="true" className="size-3" />
                      View Full Message
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={selectedLog !== null} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Full WhatsApp message</DialogTitle>
            <DialogDescription>
              Parent phone: {selectedLog ? maskPhone(selectedLog.parent_phone) : ""}
            </DialogDescription>
          </DialogHeader>
          <pre className="max-h-[50dvh] overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-muted p-4 text-sm">
            {selectedLog?.message_body}
          </pre>
          {selectedLog?.error_message ? (
            <p
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
              role="alert"
            >
              Meta error: {selectedLog.error_message}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
