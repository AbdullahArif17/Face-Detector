"use client";

import {
  Briefcase,
  CalendarCheck,
  ClipboardList,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  UserCog,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { ApkDownloadPanel } from "@/components/apk-download-panel";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { canManageUsers } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Students", href: "/students", icon: Users },
  { name: "Teachers", href: "/teachers", icon: GraduationCap },
  { name: "Staff", href: "/staff", icon: Briefcase },
  { name: "Attendance", href: "/attendance", icon: CalendarCheck },
  { name: "Staff Attendance", href: "/staff-attendance", icon: CalendarCheck },
  { name: "Student Reports", href: "/reports", icon: FileText },
  { name: "Staff Reports", href: "/staff-reports", icon: ClipboardList },
  { name: "Notifications", href: "/notifications", icon: MessageSquareText },
] as const;

const usersNavigationItem = {
  name: "Users",
  href: "/users",
  icon: UserCog,
} as const;

export function Sidebar() {
  const pathname = usePathname();
  const { logout, user } = useAuth();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const visibleNavigation =
    canManageUsers(user)
      ? [
          ...navigation.slice(0, 4),
          usersNavigationItem,
          ...navigation.slice(4),
        ]
      : navigation;

  function renderNavLinks() {
    return visibleNavigation.map((item) => {
      const Icon = item.icon;
      const isActive =
        pathname === item.href || pathname.startsWith(`${item.href}/`);

      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => setIsMobileOpen(false)}
          className={cn(
            "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
            isActive
              ? "bg-sidebar-accent/10 text-sidebar-accent"
              : "text-sidebar-muted-fg hover:bg-sidebar-muted hover:text-sidebar-fg",
          )}
        >
          <Icon
            aria-hidden="true"
            className={cn(
              "size-5 transition-colors duration-200",
              isActive ? "text-sidebar-accent" : "text-sidebar-muted-fg group-hover:text-sidebar-fg",
            )}
          />
          {item.name}
        </Link>
      );
    });
  }

  function renderAccountPanel() {
    return (
      <div className="border-t border-sidebar-border bg-sidebar-bg p-4">
        <div className="flex items-center gap-3 px-1">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sidebar-muted text-sidebar-fg font-semibold shadow-inner">
            {user?.name?.[0]?.toUpperCase() ?? "U"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-sidebar-fg">{user?.name}</p>
            <p className="truncate text-xs text-sidebar-muted-fg">
              {user?.email}
            </p>
          </div>
        </div>
        <Button
          className="mt-4 w-full justify-start gap-3 bg-sidebar-muted/50 text-sidebar-muted-fg hover:bg-sidebar-muted hover:text-sidebar-fg border border-transparent hover:border-sidebar-border shadow-none"
          type="button"
          variant="ghost"
          onClick={() => {
            setIsMobileOpen(false);
            void logout();
          }}
        >
          <LogOut aria-hidden="true" className="size-4" />
          Sign out
        </Button>
      </div>
    );
  }

  return (
    <>
      {/* Mobile Header */}
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur lg:hidden shadow-sm">
        <Link
          href="/dashboard"
          className="min-w-0"
          onClick={() => setIsMobileOpen(false)}
          aria-label="Face Attendance dashboard"
        >
          <BrandLogo
            markClassName="size-9"
            nameClassName="hidden text-base min-[360px]:inline text-foreground"
          />
        </Link>
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="Open navigation menu"
          aria-expanded={isMobileOpen}
          onClick={() => setIsMobileOpen(true)}
          className="rounded-full shadow-sm"
        >
          <Menu aria-hidden="true" className="size-4" />
        </Button>
      </header>

      {/* Mobile Sidebar */}
      {isMobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation menu"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => setIsMobileOpen(false)}
          />
          <aside className="animate-slide-in-right relative flex h-full w-[280px] max-w-[85vw] flex-col border-r border-sidebar-border bg-sidebar-bg text-sidebar-fg shadow-2xl">
            <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
              <BrandLogo markClassName="size-9" nameClassName="text-base text-sidebar-fg" />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="text-sidebar-muted-fg hover:bg-sidebar-muted hover:text-sidebar-fg rounded-full"
                aria-label="Close navigation menu"
                onClick={() => setIsMobileOpen(false)}
              >
                <X aria-hidden="true" className="size-5" />
              </Button>
            </div>
            <nav
              aria-label="Mobile dashboard navigation"
              className="scrollbar-thin flex-1 overflow-y-auto space-y-1 p-4"
            >
              {renderNavLinks()}
            </nav>
            <ApkDownloadPanel />
            {renderAccountPanel()}
          </aside>
        </div>
      ) : null}

      {/* Desktop Sidebar */}
      <aside className="hidden w-[var(--sidebar-width)] shrink-0 flex-col border-r border-sidebar-border bg-sidebar-bg text-sidebar-fg lg:flex shadow-xl">
        <div className="flex h-16 items-center border-b border-sidebar-border px-6">
          <BrandLogo markClassName="size-9" nameClassName="text-base font-bold text-sidebar-fg" />
        </div>
        <nav aria-label="Dashboard navigation" className="scrollbar-thin flex-1 overflow-y-auto space-y-1 p-4">
          <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-sidebar-muted-fg/70">
            Main Menu
          </div>
          {renderNavLinks()}
        </nav>
        <ApkDownloadPanel />
        {renderAccountPanel()}
      </aside>
    </>
  );
}
