import { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";
import api from "./api";

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AuthContextType {
  user: AdminUser | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

function isValidAdminUser(obj: any): obj is AdminUser {
  return (
    obj &&
    typeof obj.id === "string" &&
    typeof obj.email === "string" &&
    typeof obj.name === "string" &&
    obj.role === "admin"
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const savedToken = sessionStorage.getItem("admin_token");
    const savedUser = sessionStorage.getItem("admin_user");
    if (savedToken && savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        if (isValidAdminUser(parsed)) {
          setToken(savedToken);
          setUser(parsed);
        } else {
          sessionStorage.removeItem("admin_token");
          sessionStorage.removeItem("admin_user");
        }
      } catch {
        sessionStorage.removeItem("admin_token");
        sessionStorage.removeItem("admin_user");
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post("/auth/login", {
      email,
      password,
      client: "admin",
    });
    const { access_token, user: u } = res.data;

    if (!access_token || typeof access_token !== "string") {
      throw new Error("Invalid server response");
    }

    if (!isValidAdminUser(u)) {
      if (u && u.role && u.role !== "admin") {
        throw new Error("Admin access required");
      }
      throw new Error("Invalid server response");
    }

    // Use sessionStorage (not localStorage) — session dies when browser closes
    sessionStorage.setItem("admin_token", access_token);
    sessionStorage.setItem("admin_user", JSON.stringify(u));
    setToken(access_token);
    setUser(u);
  };

  const logout = () => {
    sessionStorage.removeItem("admin_token");
    sessionStorage.removeItem("admin_user");
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
