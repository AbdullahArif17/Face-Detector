import Link from "next/link";
import type { Metadata } from "next";

import { BrandLogo } from "@/components/brand-logo";

export const metadata: Metadata = {
  title: "Page Not Found",
};

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      <BrandLogo markClassName="size-12" nameClassName="text-xl" />
      <div className="space-y-2">
        <h1 className="text-7xl font-extrabold tracking-tighter text-gradient">
          404
        </h1>
        <p className="text-lg font-medium text-foreground">
          Page not found
        </p>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
      </div>
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        Back to Dashboard
      </Link>
    </main>
  );
}
