/**
 * auth.tsx — Prescriptive tests
 *
 * The auth module MUST:
 * 1. Validate restored user objects have all required fields (id, email, name, role=admin)
 * 2. Reject users missing required fields — don't just check role
 * 3. Clear invalid session data from sessionStorage
 * 4. Send correct login payload: { email, password, client: "admin" }
 * 5. Validate login response has access_token (string) and valid user object
 * 6. Reject non-admin users with "Admin access required"
 * 7. Reject responses missing access_token with "Invalid server response"
 * 8. Clear session state completely on logout
 * 9. Throw when useAuth is called outside AuthProvider
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { AuthProvider, useAuth } from "../lib/auth";

vi.mock("../lib/api", () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}));

import api from "../lib/api";
const mockApi = api as any;

// Helper to render a component that uses useAuth
function AuthConsumer({ onAuth }: { onAuth: (ctx: any) => void }) {
  const auth = useAuth();
  onAuth(auth);
  return (
    <div>
      <span data-testid="user">{auth.user?.email || "none"}</span>
      <span data-testid="loading">{String(auth.isLoading)}</span>
    </div>
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("session restoration — validates user structure", () => {
    it("restores a valid admin user from sessionStorage", async () => {
      const validUser = {
        id: "u1",
        email: "admin@test.com",
        name: "Admin",
        role: "admin",
      };
      sessionStorage.setItem("admin_token", "valid-token");
      sessionStorage.setItem("admin_user", JSON.stringify(validUser));

      let authState: any;
      await act(async () => {
        render(
          <AuthProvider>
            <AuthConsumer onAuth={(ctx) => (authState = ctx)} />
          </AuthProvider>,
        );
      });

      expect(authState.user).toEqual(validUser);
      expect(authState.token).toBe("valid-token");
      expect(authState.isLoading).toBe(false);
    });

    it("rejects user with role !== admin and clears sessionStorage", async () => {
      const nonAdmin = {
        id: "u1",
        email: "user@test.com",
        name: "User",
        role: "user",
      };
      sessionStorage.setItem("admin_token", "some-token");
      sessionStorage.setItem("admin_user", JSON.stringify(nonAdmin));

      let authState: any;
      await act(async () => {
        render(
          <AuthProvider>
            <AuthConsumer onAuth={(ctx) => (authState = ctx)} />
          </AuthProvider>,
        );
      });

      expect(authState.user).toBeNull();
      expect(sessionStorage.getItem("admin_token")).toBeNull();
      expect(sessionStorage.getItem("admin_user")).toBeNull();
    });

    it("rejects user missing required 'id' field and clears session", async () => {
      const incomplete = { email: "a@test.com", name: "Admin", role: "admin" };
      sessionStorage.setItem("admin_token", "t");
      sessionStorage.setItem("admin_user", JSON.stringify(incomplete));

      let authState: any;
      await act(async () => {
        render(
          <AuthProvider>
            <AuthConsumer onAuth={(ctx) => (authState = ctx)} />
          </AuthProvider>,
        );
      });

      expect(authState.user).toBeNull();
      expect(sessionStorage.getItem("admin_token")).toBeNull();
    });

    it("rejects user missing required 'email' field", async () => {
      const incomplete = { id: "u1", name: "Admin", role: "admin" };
      sessionStorage.setItem("admin_token", "t");
      sessionStorage.setItem("admin_user", JSON.stringify(incomplete));

      let authState: any;
      await act(async () => {
        render(
          <AuthProvider>
            <AuthConsumer onAuth={(ctx) => (authState = ctx)} />
          </AuthProvider>,
        );
      });

      expect(authState.user).toBeNull();
    });

    it("rejects user missing required 'name' field", async () => {
      const incomplete = { id: "u1", email: "a@test.com", role: "admin" };
      sessionStorage.setItem("admin_token", "t");
      sessionStorage.setItem("admin_user", JSON.stringify(incomplete));

      let authState: any;
      await act(async () => {
        render(
          <AuthProvider>
            <AuthConsumer onAuth={(ctx) => (authState = ctx)} />
          </AuthProvider>,
        );
      });

      expect(authState.user).toBeNull();
    });

    it("handles corrupted JSON in sessionStorage without crashing", async () => {
      sessionStorage.setItem("admin_token", "t");
      sessionStorage.setItem("admin_user", "{corrupted json!!!");

      let authState: any;
      await act(async () => {
        render(
          <AuthProvider>
            <AuthConsumer onAuth={(ctx) => (authState = ctx)} />
          </AuthProvider>,
        );
      });

      expect(authState.user).toBeNull();
      expect(sessionStorage.getItem("admin_token")).toBeNull();
    });

    it("handles missing token with existing user — requires both", async () => {
      sessionStorage.setItem(
        "admin_user",
        JSON.stringify({
          id: "u1",
          email: "a@test.com",
          name: "A",
          role: "admin",
        }),
      );
      // No admin_token set

      let authState: any;
      await act(async () => {
        render(
          <AuthProvider>
            <AuthConsumer onAuth={(ctx) => (authState = ctx)} />
          </AuthProvider>,
        );
      });

      expect(authState.user).toBeNull();
      expect(authState.token).toBeNull();
    });
  });

  describe("login — validates response structure", () => {
    it("sends correct payload with client:'admin'", async () => {
      mockApi.post.mockResolvedValueOnce({
        data: {
          access_token: "new-token",
          user: { id: "u1", email: "a@test.com", name: "Admin", role: "admin" },
        },
      });

      let loginFn: any;
      await act(async () => {
        render(
          <AuthProvider>
            <AuthConsumer onAuth={(ctx) => (loginFn = ctx.login)} />
          </AuthProvider>,
        );
      });

      await act(async () => {
        await loginFn("a@test.com", "pass123");
      });

      expect(mockApi.post).toHaveBeenCalledWith("/auth/login", {
        email: "a@test.com",
        password: "pass123",
        client: "admin",
      });
    });

    it("stores token and user in sessionStorage on successful login", async () => {
      const validUser = {
        id: "u1",
        email: "a@test.com",
        name: "Admin",
        role: "admin",
      };
      mockApi.post.mockResolvedValueOnce({
        data: { access_token: "jwt-123", user: validUser },
      });

      let loginFn: any;
      await act(async () => {
        render(
          <AuthProvider>
            <AuthConsumer onAuth={(ctx) => (loginFn = ctx.login)} />
          </AuthProvider>,
        );
      });

      await act(async () => {
        await loginFn("a@test.com", "pass");
      });

      expect(sessionStorage.getItem("admin_token")).toBe("jwt-123");
      expect(JSON.parse(sessionStorage.getItem("admin_user")!)).toEqual(
        validUser,
      );
    });

    it("rejects non-admin user with 'Admin access required' error", async () => {
      mockApi.post.mockResolvedValueOnce({
        data: {
          access_token: "token",
          user: { id: "u1", email: "u@test.com", name: "User", role: "user" },
        },
      });

      let loginFn: any;
      await act(async () => {
        render(
          <AuthProvider>
            <AuthConsumer onAuth={(ctx) => (loginFn = ctx.login)} />
          </AuthProvider>,
        );
      });

      await expect(loginFn("u@test.com", "pass")).rejects.toThrow(
        "Admin access required",
      );
      // Must NOT store non-admin user in sessionStorage
      expect(sessionStorage.getItem("admin_token")).toBeNull();
    });

    it("rejects response missing access_token with 'Invalid server response'", async () => {
      mockApi.post.mockResolvedValueOnce({
        data: {
          user: { id: "u1", email: "a@test.com", name: "A", role: "admin" },
        },
      });

      let loginFn: any;
      await act(async () => {
        render(
          <AuthProvider>
            <AuthConsumer onAuth={(ctx) => (loginFn = ctx.login)} />
          </AuthProvider>,
        );
      });

      await expect(loginFn("a@test.com", "p")).rejects.toThrow(
        "Invalid server response",
      );
    });

    it("rejects response with incomplete user object", async () => {
      mockApi.post.mockResolvedValueOnce({
        data: { access_token: "tok", user: { role: "admin" } }, // missing id, email, name
      });

      let loginFn: any;
      await act(async () => {
        render(
          <AuthProvider>
            <AuthConsumer onAuth={(ctx) => (loginFn = ctx.login)} />
          </AuthProvider>,
        );
      });

      await expect(loginFn("a@test.com", "p")).rejects.toThrow(
        "Invalid server response",
      );
    });

    it("propagates API errors (e.g. 401) to caller", async () => {
      const apiError = {
        response: { status: 401, data: { detail: "Invalid credentials" } },
      };
      mockApi.post.mockRejectedValueOnce(apiError);

      let loginFn: any;
      await act(async () => {
        render(
          <AuthProvider>
            <AuthConsumer onAuth={(ctx) => (loginFn = ctx.login)} />
          </AuthProvider>,
        );
      });

      await expect(loginFn("a@test.com", "wrong")).rejects.toBe(apiError);
    });
  });

  describe("logout — clears all session state", () => {
    it("clears user, token, and sessionStorage", async () => {
      const validUser = {
        id: "u1",
        email: "a@test.com",
        name: "Admin",
        role: "admin",
      };
      sessionStorage.setItem("admin_token", "tok");
      sessionStorage.setItem("admin_user", JSON.stringify(validUser));

      let authState: any;
      await act(async () => {
        render(
          <AuthProvider>
            <AuthConsumer onAuth={(ctx) => (authState = ctx)} />
          </AuthProvider>,
        );
      });

      expect(authState.user).not.toBeNull();

      act(() => {
        authState.logout();
      });

      expect(authState.user).toBeNull();
      expect(authState.token).toBeNull();
      expect(sessionStorage.getItem("admin_token")).toBeNull();
      expect(sessionStorage.getItem("admin_user")).toBeNull();
    });
  });

  describe("useAuth — context guard", () => {
    it("throws when used outside AuthProvider", () => {
      const Orphan = () => {
        useAuth();
        return null;
      };
      expect(() => render(<Orphan />)).toThrow(
        "useAuth must be used within AuthProvider",
      );
    });
  });
});
