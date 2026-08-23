"use client";

export default function NotificationsPage() {
  return (
    <section className="animate-page-enter space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            <span className="text-gradient">Notifications</span>
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground text-pretty">
            The notification system is currently being upgraded to a new architecture.
          </p>
        </div>
      </div>
      <div className="rounded-xl border bg-card p-8 text-center shadow-card">
        <p className="font-semibold">Coming Soon</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Email and push notification tracking will be available here soon.
        </p>
      </div>
    </section>
  );
}
