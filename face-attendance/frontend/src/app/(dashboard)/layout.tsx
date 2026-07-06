"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { Sidebar } from "@/components/sidebar";
import { useAuth } from "@/context/AuthContext";

export default function DashboardLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <main className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">
        Checking authentication...
      </main>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <Sidebar />
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
