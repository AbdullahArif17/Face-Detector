"use client";

import {
  CalendarCheck,
  FileText,
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
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { canManageUsers } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Students", href: "/students", icon: Users },
  { name: "Attendance", href: "/attendance", icon: CalendarCheck },
  { name: "Reports", href: "/reports", icon: FileText },
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
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
            isActive
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          )}
        >
          <Icon aria-hidden="true" className="size-4" />
          {item.name}
        </Link>
      );
    });
  }

  function renderAccountPanel() {
    return (
      <div className="border-t p-4">
        <p className="truncate px-3 text-sm font-medium">{user?.name}</p>
        <p className="truncate px-3 text-xs text-muted-foreground">
          {user?.email}
        </p>
        <Button
          className="mt-3 w-full justify-start gap-3"
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
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur lg:hidden">
        <Link
          href="/dashboard"
          className="min-w-0"
          onClick={() => setIsMobileOpen(false)}
          aria-label="Face Attendance dashboard"
        >
          <BrandLogo
            markClassName="size-9"
            nameClassName="hidden text-base min-[360px]:inline"
          />
        </Link>
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="Open navigation menu"
          aria-expanded={isMobileOpen}
          onClick={() => setIsMobileOpen(true)}
        >
          <Menu aria-hidden="true" className="size-4" />
        </Button>
      </header>

      {isMobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation menu"
            className="absolute inset-0 bg-black/50"
            onClick={() => setIsMobileOpen(false)}
          />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col border-r bg-card shadow-xl">
            <div className="flex h-16 items-center justify-between border-b px-4">
              <BrandLogo markClassName="size-9" nameClassName="text-base" />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Close navigation menu"
                onClick={() => setIsMobileOpen(false)}
              >
                <X aria-hidden="true" className="size-4" />
              </Button>
            </div>
            <nav
              aria-label="Mobile dashboard navigation"
              className="flex-1 space-y-1 p-4"
            >
              {renderNavLinks()}
            </nav>
            {renderAccountPanel()}
          </aside>
        </div>
      ) : null}

      <aside className="hidden w-64 shrink-0 flex-col border-r bg-card lg:flex">
        <div className="flex h-16 items-center border-b px-6">
          <BrandLogo markClassName="size-10" nameClassName="text-lg" />
        </div>
        <nav aria-label="Dashboard navigation" className="flex-1 space-y-1 p-4">
          {renderNavLinks()}
        </nav>
        {renderAccountPanel()}
      </aside>
    </>
  );
}
