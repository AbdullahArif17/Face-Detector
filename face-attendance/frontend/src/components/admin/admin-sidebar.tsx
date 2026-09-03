"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  X,
} from "lucide-react";

import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { usePlatformAdmin } from "@/context/PlatformAdminContext";
import { cn } from "@/lib/utils";

const adminNav = [
  { name: "Overview", href: "/admin", icon: LayoutDashboard },
  { name: "Organizations", href: "/admin/organizations", icon: Building2 },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const { logout } = usePlatformAdmin();
  const [mobileOpen, setMobileOpen] = useState(false);

  function renderLinks() {
    return adminNav.map((item) => {
      const Icon = item.icon;
      const isActive =
        pathname === item.href ||
        (item.href !== "/admin" && pathname.startsWith(item.href));

      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => setMobileOpen(false)}
          className={cn(
            "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
            isActive
              ? "bg-violet-600/20 text-violet-400 border border-violet-500/30 shadow-sm"
              : "text-slate-400 hover:bg-slate-900 hover:text-slate-100",
          )}
        >
          <Icon
            aria-hidden="true"
            className={cn(
              "size-5 transition-colors duration-200",
              isActive ? "text-violet-400" : "text-slate-400 group-hover:text-slate-100",
            )}
          />
          {item.name}
        </Link>
      );
    });
  }

  return (
    <>
      {/* Mobile Top Header */}
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-slate-800 bg-slate-950/95 px-4 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2">
          <BrandLogo markClassName="size-8" nameClassName="text-base text-slate-100 font-bold" />
          <span className="rounded bg-violet-950 px-1.5 py-0.5 text-[10px] font-semibold text-violet-300 border border-violet-800">
            ADMIN
          </span>
        </div>
        <Button
          type="button"
          size="icon"
          variant="outline"
          onClick={() => setMobileOpen(true)}
          className="border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white"
        >
          <Menu className="size-5" />
        </Button>
      </header>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative flex h-full w-[280px] max-w-[85vw] flex-col border-r border-slate-800 bg-slate-950 text-slate-200 shadow-2xl p-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <div className="flex items-center gap-2">
                <BrandLogo markClassName="size-8" nameClassName="text-base text-slate-100" />
                <span className="rounded bg-violet-950 px-1.5 py-0.5 text-[10px] font-semibold text-violet-300 border border-violet-800">
                  ADMIN
                </span>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => setMobileOpen(false)}
                className="text-slate-400 hover:bg-slate-900 hover:text-white"
              >
                <X className="size-5" />
              </Button>
            </div>
            <nav className="flex-1 space-y-1.5">{renderLinks()}</nav>
            <div className="border-t border-slate-800 pt-4 space-y-2">
              <Link
                href="/dashboard"
                className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-900 rounded-lg"
              >
                <ExternalLink className="size-4" />
                Switch to Tenant App
              </Link>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start gap-2 border-slate-800 bg-slate-900 text-slate-300 hover:bg-rose-950/40 hover:text-rose-300 hover:border-rose-900/50"
                onClick={() => {
                  setMobileOpen(false);
                  void logout();
                }}
              >
                <LogOut className="size-4" />
                Sign Out
              </Button>
            </div>
          </aside>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-950 text-slate-200 lg:flex shadow-2xl">
        <div className="flex h-16 items-center gap-2.5 border-b border-slate-800 px-6">
          <BrandLogo markClassName="size-8" nameClassName="text-base font-bold text-slate-100" />
          <div className="flex items-center gap-1 rounded bg-violet-500/10 px-2 py-0.5 border border-violet-500/30 text-violet-400 text-[10px] font-semibold tracking-wider">
            <ShieldCheck className="size-3" />
            ADMIN
          </div>
        </div>
        <div className="px-6 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Platform Control
          </p>
        </div>
        <nav className="flex-1 space-y-1.5 px-4">{renderLinks()}</nav>
        <div className="border-t border-slate-800 p-4 space-y-2">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-900 rounded-lg transition-colors"
          >
            <ExternalLink className="size-4 text-slate-500" />
            Switch to Tenant App
          </Link>
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start gap-2 text-slate-400 hover:bg-rose-950/30 hover:text-rose-300 transition-colors"
            onClick={() => void logout()}
          >
            <LogOut className="size-4" />
            Sign Out
          </Button>
        </div>
      </aside>
    </>
  );
}
