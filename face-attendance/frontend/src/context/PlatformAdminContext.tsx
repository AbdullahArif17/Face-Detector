"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import {
  checkPlatformAdminAuth,
  loginPlatformAdmin,
  logoutPlatformAdmin,
} from "@/lib/admin-api";

interface PlatformAdminContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (key: string) => Promise<void>;
  logout: () => Promise<void>;
}

const PlatformAdminContext = createContext<PlatformAdminContextValue | undefined>(
  undefined,
);

export function PlatformAdminProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const authed = await checkPlatformAdminAuth();
      setIsAuthenticated(authed);
    } catch {
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) {
        void checkAuth();
      }
    });
    return () => {
      active = false;
    };
  }, [checkAuth]);

  const login = useCallback(
    async (key: string) => {
      await loginPlatformAdmin(key);
      setIsAuthenticated(true);
      router.replace("/admin");
    },
    [router],
  );

  const logout = useCallback(async () => {
    try {
      await logoutPlatformAdmin();
    } finally {
      setIsAuthenticated(false);
      router.replace("/admin/login");
    }
  }, [router]);

  const value = useMemo<PlatformAdminContextValue>(
    () => ({
      isAuthenticated,
      isLoading,
      login,
      logout,
    }),
    [isAuthenticated, isLoading, login, logout],
  );

  return (
    <PlatformAdminContext.Provider value={value}>
      {children}
    </PlatformAdminContext.Provider>
  );
}

export function usePlatformAdmin(): PlatformAdminContextValue {
  const context = useContext(PlatformAdminContext);
  if (context === undefined) {
    throw new Error(
      "usePlatformAdmin must be used within a PlatformAdminProvider",
    );
  }
  return context;
}
