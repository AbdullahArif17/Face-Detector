import { Metadata } from "next";
import {
  BookOpen,
  Camera,
  CheckCircle2,
  Settings,
  Users,
  Video,
} from "lucide-react";

export const metadata: Metadata = {
  title: "System Guide | Face Attendance",
  description: "Learn how to use the Face Attendance platform.",
};

export default function GuidePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">System Guide</h1>
        <p className="mt-2 text-muted-foreground">
          Welcome to the Face Attendance platform. This guide explains how the system works and how you can use it to efficiently manage attendance.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden">
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3 text-primary">
              <Users className="size-6" />
              <h2 className="text-xl font-semibold">1. Managing Users</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Before you can take attendance, you need to add your students, teachers, and staff members to the system.
            </p>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="size-4 mt-0.5 text-primary shrink-0" />
                <span>Navigate to <strong>Students</strong>, <strong>Teachers</strong>, or <strong>Staff</strong> from the sidebar.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="size-4 mt-0.5 text-primary shrink-0" />
                <span>Click the <strong>Add</strong> button to create a new profile.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="size-4 mt-0.5 text-primary shrink-0" />
                <span>Fill in their details such as name, roll number (for students), and designation.</span>
              </li>
            </ul>
          </div>
        </section>

        <section className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden">
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3 text-primary">
              <Camera className="size-6" />
              <h2 className="text-xl font-semibold">2. Enrolling Faces</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Each user needs to have their face registered in the system so the AI can recognize them during attendance.
            </p>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="size-4 mt-0.5 text-primary shrink-0" />
                <span>In the user list, click the <strong>Camera</strong> icon next to a person&apos;s name.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="size-4 mt-0.5 text-primary shrink-0" />
                <span>Upload a clear photo or take a new one using your device camera.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="size-4 mt-0.5 text-primary shrink-0" />
                <span>Ensure the face is clearly visible, well-lit, and directly facing the camera for best accuracy.</span>
              </li>
            </ul>
          </div>
        </section>

        <section className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden md:col-span-2">
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3 text-primary">
              <Video className="size-6" />
              <h2 className="text-xl font-semibold">3. Taking Attendance (Kiosk)</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              The Kiosk is the public-facing interface where users stand in front of the camera to mark their attendance.
            </p>
            <div className="grid gap-4 sm:grid-cols-2 mt-4">
              <div className="rounded-lg bg-muted/50 p-4 space-y-2">
                <h3 className="font-medium">Launching the Kiosk</h3>
                <p className="text-xs text-muted-foreground">
                  Go to the <strong>Dashboard</strong> or <strong>Attendance</strong> page and click &quot;Launch Check-in Kiosk&quot; or &quot;Launch Check-out Kiosk&quot;. This opens a fullscreen camera view in a new tab.
                </p>
              </div>
              <div className="rounded-lg bg-muted/50 p-4 space-y-2">
                <h3 className="font-medium">How it Works</h3>
                <p className="text-xs text-muted-foreground">
                  The system continuously scans the camera feed. When a registered face is detected, it automatically records their check-in or check-out time and displays a success message.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden">
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3 text-primary">
              <BookOpen className="size-6" />
              <h2 className="text-xl font-semibold">4. Viewing Reports</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Track attendance history and monitor late arrivals.
            </p>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="size-4 mt-0.5 text-primary shrink-0" />
                <span>Use the <strong>Student Reports</strong> and <strong>Staff Reports</strong> pages to view detailed logs.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="size-4 mt-0.5 text-primary shrink-0" />
                <span>Filter records by date ranges to generate weekly or monthly summaries.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="size-4 mt-0.5 text-primary shrink-0" />
                <span>Export data to CSV for external payroll or academic systems.</span>
              </li>
            </ul>
          </div>
        </section>

        <section className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden">
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3 text-primary">
              <Settings className="size-6" />
              <h2 className="text-xl font-semibold">5. System Settings</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Configure your organization&apos;s global attendance rules.
            </p>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="size-4 mt-0.5 text-primary shrink-0" />
                <span>On the <strong>Dashboard</strong>, you can set the official <em>Start Time</em> and <em>Late Grace Minutes</em>.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="size-4 mt-0.5 text-primary shrink-0" />
                <span>Users checking in after the grace period will automatically be marked as Late.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="size-4 mt-0.5 text-primary shrink-0" />
                <span>Configure the <em>HR Email</em> to receive immediate alerts when staff members arrive or leave.</span>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
