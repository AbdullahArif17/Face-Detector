"use client";

import { BellRing, LoaderCircle, ScanFace, ShieldCheck, UserCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { type KeyboardEvent, useState } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { signupRequest } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/errors";

const PRODUCT_BENEFITS = [
  { icon: UserCheck, label: "Class-scoped sessions" },
  { icon: ScanFace, label: "Fast face check-in" },
  { icon: BellRing, label: "Parent notifications" },
] as const;

export default function SignupPage() {
  const { login } = useAuth();
  const [companyName, setCompanyName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSignup(): Promise<void> {
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await signupRequest({
        company_name: companyName,
        name,
        email,
        password,
      });
      login(response.user);
    } catch (requestError) {
      setError(
        getApiErrorMessage(
          requestError,
          "Unable to create your account. Please try again.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Enter" && !isSubmitting) {
      void handleSignup();
    }
  }

  const isInvalid =
    !companyName ||
    !name ||
    !email ||
    password.length < 8 ||
    !confirmPassword;



  return (
    <main className="min-h-dvh bg-background lg:grid lg:grid-cols-[minmax(0,1.12fr)_minmax(28rem,0.88fr)]">
      <section className="relative min-h-[20rem] overflow-hidden bg-slate-950 sm:min-h-[24rem] lg:min-h-dvh">
        <Image
          src="/images/login-attendance-hero.png"
          alt="Students checking in at a school attendance kiosk"
          fill
          priority
          sizes="(min-width: 1024px) 56vw, 100vw"
          className="object-cover object-[center_68%] lg:object-[center_58%]"
        />
        <div
          className="absolute inset-0 bg-gradient-to-b from-slate-950/75 via-slate-950/5 to-slate-950/90 lg:bg-gradient-to-tr lg:from-slate-950/90 lg:via-slate-950/15 lg:to-transparent"
          aria-hidden="true"
        />

        <div className="relative flex min-h-[20rem] flex-col justify-between p-4 text-white sm:min-h-[24rem] sm:p-8 lg:min-h-dvh lg:p-12 xl:p-16">
          <div className="inline-flex w-fit rounded-full border border-white/20 bg-slate-950/35 py-1 pl-1 pr-2.5 shadow-sm backdrop-blur-md">
            <BrandLogo
              priority
              markClassName="size-8 rounded-full sm:size-9"
              nameClassName="text-xs text-white sm:text-sm"
            />
          </div>

          <div className="max-w-2xl">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-blue-200 sm:text-sm sm:tracking-[0.22em]">
              AI-powered school attendance
            </p>
            <h1 className="mt-2 max-w-xl text-[1.65rem] font-bold leading-[1.12] text-balance min-[390px]:text-3xl sm:mt-3 sm:text-4xl sm:leading-tight lg:text-5xl xl:text-6xl">
              Every arrival, recorded in real time.
            </h1>
            <p className="mt-2 max-w-xl text-[0.8125rem] leading-5 text-slate-200 text-pretty sm:mt-3 sm:text-base sm:leading-6 lg:mt-5 lg:text-lg">
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

      <section className="relative flex items-center justify-center px-3 py-5 sm:px-8 sm:py-10 lg:px-10 lg:py-12 xl:px-16">
        <Card className="w-full max-w-md border-0 bg-card shadow-lg ring-1 ring-border/70 sm:shadow-xl lg:shadow-2xl">
          <CardHeader className="px-5 pb-3 pt-5 sm:px-8 sm:pb-4 sm:pt-8">
            <div>
              <h2 className="text-[1.65rem] font-bold tracking-tight sm:text-3xl">
                Create your organization
              </h2>
              <p className="mt-1.5 text-sm leading-5 text-muted-foreground text-pretty sm:mt-2 sm:leading-6">
                Start with a school or organization administrator account.
              </p>
            </div>
          </CardHeader>
        <CardContent className="space-y-4 px-5 pb-5 sm:space-y-5 sm:px-8 sm:pb-8">
          <div className="space-y-3.5 sm:space-y-4" onKeyDown={handleKeyDown}>
            <div className="space-y-1.5 sm:space-y-2">
              <label className="text-sm font-medium" htmlFor="company-name">
                Organization / School name
              </label>
              <Input
                id="company-name"
                autoComplete="organization"
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                aria-invalid={Boolean(error)}
                className="h-10 sm:h-11"
              />
            </div>
            <div className="space-y-1.5 sm:space-y-2">
              <label className="text-sm font-medium" htmlFor="name">
                Your name
              </label>
              <Input
                id="name"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-invalid={Boolean(error)}
                className="h-10 sm:h-11"
              />
            </div>
            <div className="space-y-1.5 sm:space-y-2">
              <label className="text-sm font-medium" htmlFor="signup-email">
                Email
              </label>
              <Input
                id="signup-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={Boolean(error)}
                className="h-10 sm:h-11"
              />
            </div>
            <div className="space-y-1.5 sm:space-y-2">
              <label className="text-sm font-medium" htmlFor="signup-password">
                Password
              </label>
              <Input
                id="signup-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={Boolean(error)}
                className="h-10 sm:h-11"
              />
              <p className="text-xs text-muted-foreground">
                Use at least 8 characters.
              </p>
            </div>
            <div className="space-y-1.5 sm:space-y-2">
              <label className="text-sm font-medium" htmlFor="confirm-password">
                Confirm password
              </label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                aria-invalid={Boolean(error)}
                className="h-10 sm:h-11"
              />
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
              className="h-10 w-full gap-2 sm:h-11"
              type="button"
              disabled={isSubmitting || isInvalid}
              aria-busy={isSubmitting}
              onClick={() => void handleSignup()}
            >
              {isSubmitting ? (
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
              ) : null}
              {isSubmitting ? "Creating account..." : "Create account"}
            </Button>
          </div>

          <p className="text-center text-sm text-muted-foreground text-pretty">
            Already have an account?{" "}
            <Link className="font-medium text-primary hover:underline" href="/login">
              Sign in
            </Link>
          </p>
          
          <div className="flex items-center justify-center gap-1.5 rounded-lg bg-muted/60 px-2.5 py-2 text-[0.6875rem] text-muted-foreground sm:gap-2 sm:px-3 sm:text-xs">
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
