"use client";

import {
  BookOpen,
  Briefcase,
  CalendarCheck,
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
import { PwaSidebarPanel } from "@/components/pwa-sidebar-panel";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { canManageUsers } from "@/lib/permissions";
import { cn } from "@/lib/utils";

/* ──────────────────────────── Navigation config ──────────────────────────── */

interface NavItem {
  readonly name: string;
  readonly href: string;
  readonly icon: typeof LayoutDashboard;
}

interface NavGroup {
  readonly label: string;
  readonly items: readonly NavItem[];
}

const coreNav: readonly NavItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Students", href: "/students", icon: Users },
  { name: "Teachers", href: "/teachers", icon: GraduationCap },
  { name: "Staff", href: "/staff", icon: Briefcase },
] as const;

const insightsNav: readonly NavItem[] = [
  { name: "Attendance", href: "/attendance", icon: CalendarCheck },
  { name: "Reports", href: "/reports", icon: FileText },
  { name: "Notifications", href: "/notifications", icon: MessageSquareText },
] as const;

const resourcesNav: readonly NavItem[] = [
  { name: "Guide", href: "/guide", icon: BookOpen },
] as const;

const usersNavigationItem: NavItem = {
  name: "Users",
  href: "/users",
  icon: UserCog,
} as const;

/* ───────────────────────────── Component ────────────────────────────────── */

export function Sidebar() {
  const pathname = usePathname();
  const { logout, user } = useAuth();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const groups: readonly NavGroup[] = canManageUsers(user)
    ? [
        { label: "Overview", items: coreNav },
        { label: "Management", items: [usersNavigationItem, ...insightsNav] },
        { label: "Resources", items: resourcesNav },
      ]
    : [
        { label: "Overview", items: coreNav },
        { label: "Insights", items: insightsNav },
        { label: "Resources", items: resourcesNav },
      ];

  function renderNavGroups() {
    return groups.map((group) => (
      <div key={group.label} className="space-y-1">
        <div className="mb-1.5 mt-4 first:mt-0 px-3 text-[11px] font-semibold uppercase tracking-widest text-sidebar-muted-fg/60 select-none">
          {group.label}
        </div>
        {group.items.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setIsMobileOpen(false)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-sidebar-accent/10 text-sidebar-accent"
                  : "text-sidebar-muted-fg hover:bg-sidebar-muted hover:text-sidebar-fg",
              )}
            >
              {/* Active indicator bar */}
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-sidebar-accent"
                />
              )}
              <Icon
                aria-hidden="true"
                className={cn(
                  "size-[18px] shrink-0 transition-colors duration-200",
                  isActive
                    ? "text-sidebar-accent"
                    : "text-sidebar-muted-fg group-hover:text-sidebar-fg",
                )}
              />
              {item.name}
            </Link>
          );
        })}
      </div>
    ));
  }

  function renderAccountPanel() {
    return (
      <div className="border-t border-sidebar-border bg-sidebar-bg p-4">
        <div className="flex items-center gap-3 px-1">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sidebar-accent to-purple-500 text-white text-sm font-semibold shadow-md">
            {user?.name?.[0]?.toUpperCase() ?? "U"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-sidebar-fg">
              {user?.name}
            </p>
            <p className="truncate text-xs text-sidebar-muted-fg">
              {user?.email}
            </p>
          </div>
        </div>
        <Button
          className="mt-4 w-full justify-start gap-3 bg-sidebar-muted/50 text-sidebar-muted-fg hover:bg-destructive/10 hover:text-red-400 border border-transparent hover:border-red-400/20 shadow-none transition-colors duration-200"
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
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur-md lg:hidden shadow-sm">
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

      {/* Mobile Sidebar Overlay */}
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
              <BrandLogo
                markClassName="size-9"
                nameClassName="text-base text-sidebar-fg"
              />
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
              className="scrollbar-thin flex-1 overflow-y-auto p-4"
            >
              {renderNavGroups()}
            </nav>
            <PwaSidebarPanel />
            {renderAccountPanel()}
          </aside>
        </div>
      ) : null}

      {/* Desktop Sidebar */}
      <aside className="hidden w-[var(--sidebar-width)] shrink-0 flex-col border-r border-sidebar-border bg-sidebar-bg text-sidebar-fg lg:flex shadow-xl">
        <div className="flex h-16 items-center border-b border-sidebar-border px-6">
          <BrandLogo
            markClassName="size-9"
            nameClassName="text-base font-bold text-sidebar-fg"
          />
        </div>
        <nav
          aria-label="Dashboard navigation"
          className="scrollbar-thin flex-1 overflow-y-auto p-4"
        >
          {renderNavGroups()}
        </nav>
        <PwaSidebarPanel />
        {renderAccountPanel()}
      </aside>
    </>
  );
}
