"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { AdminSidebar } from "@/components/admin/admin-sidebar";
import {
  PlatformAdminProvider,
  usePlatformAdmin,
} from "@/context/PlatformAdminContext";

function AdminLayoutContent({
  children,
}: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoading } = usePlatformAdmin();
  const isLoginPage = pathname === "/admin/login";

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isLoginPage) {
      router.replace("/admin/login");
    }
  }, [isAuthenticated, isLoading, isLoginPage, router]);

  if (isLoginPage) {
    return <div className="min-h-screen bg-slate-950 text-slate-100">{children}</div>;
  }

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <div className="size-6 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
          <span>Verifying platform credentials...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100 lg:flex-row">
      <AdminSidebar />
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}

export default function AdminLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <PlatformAdminProvider>
      <AdminLayoutContent>{children}</AdminLayoutContent>
    </PlatformAdminProvider>
  );
}
