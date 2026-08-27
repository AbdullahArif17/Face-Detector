"use client";

import { useEffect, useState } from "react";
import { 
  Bell, 
  Mail, 
  Smartphone, 
  CheckCircle2, 
  AlertCircle,
  Loader2
} from "lucide-react";
import { getNotificationLogs, NotificationLog } from "@/lib/api";

export default function NotificationsPage() {
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchLogs() {
      try {
        const data = await getNotificationLogs({ limit: 100 });
        setLogs(data);
      } catch (error) {
        setError("Failed to load notifications. Please try again later.");
        console.error("Failed to load notifications:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchLogs();
  }, []);

  return (
    <section className="animate-page-enter space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            <span className="text-gradient">Notifications</span>
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground text-pretty">
            Monitor system-generated emails and push notifications.
          </p>
        </div>
      </div>

      <div className="rounded-xl border bg-card shadow-card overflow-hidden">
        {loading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center">
            <Bell className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="font-semibold">No Notifications Found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              There are currently no notification logs to display.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {logs.map((log) => (
              <div key={log.id} className="p-4 sm:p-6 hover:bg-muted/50 transition-colors flex gap-4">
                <div className="shrink-0 mt-1">
                  {log.notification_type === "email" ? (
                    <Mail className="h-5 w-5 text-blue-500" />
                  ) : (
                    <Smartphone className="h-5 w-5 text-indigo-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-4 mb-1">
                    <p className="font-medium text-foreground truncate">
                      {log.event_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </p>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                  </div>
                  
                  <div className="text-sm text-muted-foreground mb-2 line-clamp-2" dangerouslySetInnerHTML={{ __html: log.message_content }} />
                  
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-foreground">To:</span>
                      <span className="text-muted-foreground truncate max-w-[200px]" title={log.recipient_email || log.recipient_fcm_token || 'Broadcast'}>
                        {log.recipient_email || (log.recipient_fcm_token ? 'Mobile Device' : 'Broadcast')}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-foreground">Status:</span>
                      {log.status === "sent" ? (
                        <span className="inline-flex items-center text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                          Delivered
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-destructive">
                          <AlertCircle className="mr-1 h-3.5 w-3.5" />
                          Failed
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {log.error_message && (
                    <div className="mt-2 text-xs p-2 bg-destructive/10 text-destructive rounded-md font-mono break-all">
                      {log.error_message}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
