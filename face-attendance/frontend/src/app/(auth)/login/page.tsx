"use client";

import Link from "next/link";
import { type KeyboardEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { loginRequest } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/errors";

export default function LoginPage() {
  const { login } = useAuth();
  const [organizationName, setOrganizationName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
          "Unable to sign in. Check your credentials.",
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
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in to your organization</CardTitle>
          <p className="text-sm text-muted-foreground text-pretty">
            Enter your school or organization name with your account details.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4" onKeyDown={handleKeyDown}>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="organization-name">
                Organization / School name
              </label>
              <Input
                id="organization-name"
                name="organization"
                autoComplete="organization"
                placeholder="Demo School"
                value={organizationName}
                onChange={(event) => setOrganizationName(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="email">
                Email
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="password">
                Password
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            {error ? (
              <p className="text-sm text-red-600 text-pretty" role="alert">
                {error}
              </p>
            ) : null}
            <Button
              className="w-full"
              type="button"
              disabled={isLoginDisabled}
              onClick={() => void handleLogin()}
            >
              {isSubmitting ? "Signing in..." : "Sign in"}
            </Button>
          </div>
          {process.env.NEXT_PUBLIC_ALLOW_SIGNUP === "true" ? (
            <p className="text-center text-sm text-muted-foreground text-pretty">
              New organization?{" "}
              <Link className="font-medium text-primary hover:underline" href="/signup">
                Create an account
              </Link>
            </p>
          ) : null}
          <p className="text-center text-xs text-muted-foreground">
            <Link className="hover:underline" href="/privacy">Privacy</Link>
            {" · "}
            <Link className="hover:underline" href="/terms">Terms</Link>
            {" · "}
            <Link className="hover:underline" href="/data-deletion">Data deletion</Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
