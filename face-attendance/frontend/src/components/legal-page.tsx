import Link from "next/link";
import type { ReactNode } from "react";

interface LegalPageProps {
  title: string;
  description: string;
  children: ReactNode;
}

export function LegalPage({ title, description, children }: LegalPageProps) {
  return (
    <main className="min-h-screen bg-muted/30 px-4 py-10 sm:px-6">
      <article className="mx-auto max-w-3xl rounded-xl border bg-background p-6 shadow-sm sm:p-10">
        <Link className="text-sm font-medium text-primary hover:underline" href="/login">
          ← Back to Face Attendance
        </Link>
        <header className="mt-6 border-b pb-6">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-3 text-muted-foreground">{description}</p>
          <p className="mt-2 text-sm text-muted-foreground">Effective: July 12, 2026</p>
        </header>
        <div className="mt-8 space-y-8 text-sm leading-7 text-foreground [&_a]:text-primary [&_a]:underline [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-2">
          {children}
        </div>
        <footer className="mt-10 flex flex-wrap gap-x-5 gap-y-2 border-t pt-6 text-sm">
          <Link className="text-primary hover:underline" href="/privacy">Privacy Policy</Link>
          <Link className="text-primary hover:underline" href="/terms">Terms of Service</Link>
          <Link className="text-primary hover:underline" href="/data-deletion">Data Deletion</Link>
        </footer>
      </article>
    </main>
  );
}
