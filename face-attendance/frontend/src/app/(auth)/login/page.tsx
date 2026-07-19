"use client";

import {
  BellRing,
  Eye,
  EyeOff,
  LoaderCircle,
  ScanFace,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { type KeyboardEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { loginRequest } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/errors";

const PRODUCT_BENEFITS = [
  { icon: UserCheck, label: "Class-scoped sessions" },
  { icon: ScanFace, label: "Fast face check-in" },
  { icon: BellRing, label: "Parent notifications" },
] as const;

export default function LoginPage() {
  const { login } = useAuth();
  const [organizationName, setOrganizationName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLogin(): Promise<void> {
    setError("");

    if (!organizationName.trim()) {
      setError("Enter your organization or school name.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await loginRequest(organizationName, email, password);
      login(response.user);
    } catch (requestError) {
      setError(
        getApiErrorMessage(
          requestError,
          "Unable to sign in. Check your organization, email, and password.",
          "Cannot reach the service. Check your internet connection and try again.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Enter" && !isSubmitting) {
      void handleLogin();
    }
  }

  const isLoginDisabled =
    isSubmitting || !organizationName.trim() || !email || !password;

  return (
    <main className="min-h-dvh bg-background lg:grid lg:grid-cols-[minmax(0,1.12fr)_minmax(28rem,0.88fr)]">
      <section className="relative min-h-[18rem] overflow-hidden bg-slate-950 sm:min-h-[23rem] lg:min-h-dvh">
        <Image
          src="/images/login-attendance-hero.png"
          alt="Students checking in at a school attendance kiosk"
          fill
          priority
          sizes="(min-width: 1024px) 56vw, 100vw"
          className="object-cover object-[center_70%] lg:object-[center_58%]"
        />
        <div
          className="absolute inset-0 bg-gradient-to-b from-slate-950/75 via-slate-950/5 to-slate-950/90 lg:bg-gradient-to-tr lg:from-slate-950/90 lg:via-slate-950/15 lg:to-transparent"
          aria-hidden="true"
        />

        <div className="relative flex min-h-[18rem] flex-col justify-between p-5 text-white sm:min-h-[23rem] sm:p-8 lg:min-h-dvh lg:p-12 xl:p-16">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-slate-950/35 px-3 py-2 text-sm font-semibold shadow-sm backdrop-blur-md">
            <span className="flex size-8 items-center justify-center rounded-full bg-blue-600">
              <ScanFace aria-hidden="true" className="size-4" />
            </span>
            Face Attendance
          </div>

          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-200 sm:text-sm">
              AI-powered school attendance
            </p>
            <h1 className="mt-3 max-w-xl text-3xl font-bold leading-tight text-balance sm:text-4xl lg:text-5xl xl:text-6xl">
              Every arrival, recorded in real time.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-200 text-pretty sm:text-base lg:mt-5 lg:text-lg">
              Run secure class sessions, recognize enrolled students, and keep
              attendance organized from one simple portal.
            </p>

            <div className="mt-6 hidden gap-3 sm:grid sm:grid-cols-3 lg:mt-8">
              {PRODUCT_BENEFITS.map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex items-center gap-2 rounded-xl border border-white/15 bg-slate-950/35 px-3 py-3 text-xs font-medium text-slate-100 backdrop-blur-md lg:text-sm"
                >
                  <Icon aria-hidden="true" className="size-4 shrink-0 text-emerald-300" />
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="relative flex items-center justify-center px-4 py-8 sm:px-8 sm:py-12 lg:px-10 xl:px-16">
        <Card className="w-full max-w-md border-0 bg-card shadow-xl ring-1 ring-border/70 lg:shadow-2xl">
          <CardHeader className="space-y-3 px-5 pb-4 pt-6 sm:px-8 sm:pt-8">
            <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary lg:hidden">
              <ScanFace aria-hidden="true" className="size-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Welcome back
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground text-pretty">
                Sign in with your organization and account details.
              </p>
            </div>
          </CardHeader>

          <CardContent className="space-y-5 px-5 pb-6 sm:px-8 sm:pb-8">
            <div className="space-y-4" onKeyDown={handleKeyDown}>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="organization-name">
                  Organization or school
                </label>
                <Input
                  id="organization-name"
                  name="organization"
                  autoComplete="organization"
                  placeholder="Demo School"
                  value={organizationName}
                  onChange={(event) => setOrganizationName(event.target.value)}
                  aria-invalid={Boolean(error)}
                  className="h-11"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="email">
                  Email address
                </label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@school.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  aria-invalid={Boolean(error)}
                  className="h-11"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="password">
                  Password
                </label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    aria-invalid={Boolean(error)}
                    className="h-11 pr-11"
                    required
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((current) => !current)}
                  >
                    {showPassword ? (
                      <EyeOff aria-hidden="true" className="size-4" />
                    ) : (
                      <Eye aria-hidden="true" className="size-4" />
                    )}
                  </button>
                </div>
              </div>

              {error ? (
                <p
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 text-pretty"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}

              <Button
                className="h-11 w-full gap-2"
                type="button"
                disabled={isLoginDisabled}
                aria-busy={isSubmitting}
                onClick={() => void handleLogin()}
              >
                {isSubmitting ? (
                  <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                ) : null}
                {isSubmitting ? "Signing in..." : "Sign in"}
              </Button>
            </div>

            {process.env.NEXT_PUBLIC_ALLOW_SIGNUP === "true" ? (
              <p className="text-center text-sm text-muted-foreground text-pretty">
                New organization?{" "}
                <Link
                  className="font-medium text-primary hover:underline"
                  href="/signup"
                >
                  Create an account
                </Link>
              </p>
            ) : null}

            <div className="flex items-center justify-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              <ShieldCheck aria-hidden="true" className="size-4 text-emerald-600" />
              Secure, organization-scoped access
            </div>

            <nav
              aria-label="Legal"
              className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground"
            >
              <Link className="hover:text-foreground hover:underline" href="/privacy">
                Privacy
              </Link>
              <Link className="hover:text-foreground hover:underline" href="/terms">
                Terms
              </Link>
              <Link
                className="hover:text-foreground hover:underline"
                href="/data-deletion"
              >
                Data deletion
              </Link>
            </nav>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
