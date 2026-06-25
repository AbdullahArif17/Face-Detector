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
  AUTH_TOKEN_KEY,
  AUTH_USER_KEY,
  getCurrentUser,
  type User,
} from "@/lib/api";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(() => {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    window.localStorage.removeItem(AUTH_USER_KEY);
    setUser(null);
    router.replace("/login");
  }, [router]);

  const login = useCallback(
    (token: string, authenticatedUser: User) => {
      window.localStorage.setItem(AUTH_TOKEN_KEY, token);
      window.localStorage.setItem(
        AUTH_USER_KEY,
        JSON.stringify(authenticatedUser),
      );
      setUser(authenticatedUser);
      router.replace("/dashboard");
    },
    [router],
  );

  useEffect(() => {
    let isCancelled = false;

    async function restoreSession(): Promise<void> {
      await Promise.resolve();

      const token = window.localStorage.getItem(AUTH_TOKEN_KEY);
      const storedUser = window.localStorage.getItem(AUTH_USER_KEY);

      if (!token || !storedUser) {
        if (!isCancelled) {
          setIsLoading(false);
        }
        return;
      }

      try {
        if (!isCancelled) {
          setUser(JSON.parse(storedUser) as User);
        }
      } catch {
        window.localStorage.removeItem(AUTH_USER_KEY);
      }

      try {
        const currentUser = await getCurrentUser();
        window.localStorage.setItem(
          AUTH_USER_KEY,
          JSON.stringify(currentUser),
        );
        if (!isCancelled) {
          setUser(currentUser);
        }
      } catch {
        window.localStorage.removeItem(AUTH_TOKEN_KEY);
        window.localStorage.removeItem(AUTH_USER_KEY);
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
