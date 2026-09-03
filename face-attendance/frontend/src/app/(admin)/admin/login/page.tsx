"use client";

import { useState } from "react";
import { Eye, EyeOff, KeyRound, ShieldAlert } from "lucide-react";

import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePlatformAdmin } from "@/context/PlatformAdminContext";

export default function AdminLoginPage() {
  const { login } = usePlatformAdmin();
  const [key, setKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim()) {
      setError("Please enter your platform admin key.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await login(key.trim());
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Invalid platform admin key or server error";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/90 p-8 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col items-center text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-violet-600/10 border border-violet-500/30 text-violet-400 mb-4 shadow-inner">
            <KeyRound className="size-7" />
          </div>

          <BrandLogo markClassName="size-8" nameClassName="text-xl font-bold text-slate-100" />
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-violet-950/70 border border-violet-800/80 px-2.5 py-0.5 text-xs font-semibold text-violet-300">
            <ShieldAlert className="size-3" />
            Platform Owner Portal
          </div>
          <p className="mt-3 text-sm text-slate-400">
            Enter your secret platform administrator key to monitor and manage all organizations.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          {error && (
            <div className="rounded-lg border border-rose-800/50 bg-rose-950/50 p-3 text-xs text-rose-200">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="platform-key"
              className="block text-xs font-medium text-slate-300"
            >
              Secret Key
            </label>
            <div className="relative">
              <Input
                id="platform-key"
                type={showKey ? "text" : "password"}
                placeholder="Enter PLATFORM_ADMIN_KEY"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                autoFocus
                disabled={loading}
                className="pr-10 border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-600 focus:border-violet-500 focus:ring-violet-500"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-violet-600 font-medium text-white hover:bg-violet-500 transition-all shadow-lg shadow-violet-600/20"
          >
            {loading ? "Authenticating..." : "Unlock Control Plane"}
          </Button>
        </form>

        <div className="mt-6 border-t border-slate-800/80 pt-4 text-center text-xs text-slate-500">
          This portal is reserved strictly for system operators.
        </div>
      </div>
    </div>
  );
}
