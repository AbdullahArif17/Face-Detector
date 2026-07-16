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
  getCurrentUser,
  logoutRequest,
  type User,
} from "@/lib/api";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (user: User) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      window.localStorage.removeItem("face_attendance_token");
      window.localStorage.removeItem("face_attendance_user");
      setUser(null);
      router.replace("/login");
    }
  }, [router]);

  const login = useCallback(
    (authenticatedUser: User) => {
      window.localStorage.removeItem("face_attendance_token");
      window.localStorage.removeItem("face_attendance_user");
      setUser(authenticatedUser);
      router.replace("/dashboard");
    },
    [router],
  );

  useEffect(() => {
    let isCancelled = false;

    async function restoreSession(): Promise<void> {
      try {
        const currentUser = await getCurrentUser();
        if (!isCancelled) {
          setUser(currentUser);
        }
      } catch {
        window.localStorage.removeItem("face_attendance_token");
        window.localStorage.removeItem("face_attendance_user");
        if (!isCancelled) {
          setUser(null);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void restoreSession();
    return () => {
      isCancelled = true;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: user !== null,
      login,
      logout,
    }),
    [isLoading, login, logout, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
