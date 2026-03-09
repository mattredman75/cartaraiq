/**
 * api.ts — Prescriptive tests
 *
 * The API module MUST:
 * 1. Attach Bearer token from sessionStorage to every request
 * 2. NOT attach a token when none is stored
 * 3. On 401 with no refresh token: clear session + redirect to /login
 * 4. On 403 with no refresh token: clear session + redirect to /login
 * 5. On 401/403 for /auth/login or /auth/refresh: NOT redirect (let caller handle)
 * 6. On other HTTP errors: propagate without redirecting
 * 7. On 401 with a valid refresh token: call /auth/refresh, store new tokens, retry
 * 8. On 401 with a refresh token but refresh fails: clear session + redirect
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
// axios imported via vi.mock below

vi.mock("axios", () => {
  const requestInterceptors: any[] = [];
  const responseInterceptors: any[] = [];
  // Make instance callable (needed for api(err.config) retry path)
  const instance = Object.assign(vi.fn().mockResolvedValue({ data: {} }), {
    interceptors: {
      request: {
        use: (fn: any) => {
          requestInterceptors.push(fn);
        },
      },
      response: {
        use: (ok: any, err: any) => {
          responseInterceptors.push({ ok, err });
        },
      },
    },
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    _requestInterceptors: requestInterceptors,
    _responseInterceptors: responseInterceptors,
  });
  return {
    default: {
      create: vi.fn(() => instance),
    },
  };
});

let api: any;
let mockAxios: any;

beforeEach(async () => {
  vi.resetModules();
  const mod = await import("../lib/api");
  api = mod.default;
  // Re-import axios after resetModules to get the mocked version
  const axiosMod = await import("axios");
  mockAxios = (axiosMod as any).default;
});

describe("api module", () => {
  describe("request interceptor — token attachment", () => {
    it("attaches Bearer token when admin_token exists in sessionStorage", () => {
      sessionStorage.setItem("admin_token", "test-jwt-token");
      const interceptor = api._requestInterceptors[0];
      const config = { headers: {} } as any;
      const result = interceptor(config);
      expect(result.headers.Authorization).toBe("Bearer test-jwt-token");
    });

    it("does NOT attach Authorization header when no token stored", () => {
      const interceptor = api._requestInterceptors[0];
      const config = { headers: {} } as any;
      const result = interceptor(config);
      expect(result.headers.Authorization).toBeUndefined();
    });
  });

  describe("response interceptor — auth error handling", () => {
    let errorHandler: any;

    beforeEach(() => {
      errorHandler = api._responseInterceptors[0].err;
      sessionStorage.setItem("admin_token", "some-token");
      sessionStorage.setItem("admin_user", '{"id":"1"}');
      Object.defineProperty(window, "location", {
        writable: true,
        value: { href: "/" },
      });
    });

    it("clears session and redirects to /login on 401 for non-login request", async () => {
      const err = {
        config: { url: "/admin/dashboard/overview" },
        response: { status: 401 },
      };
      await expect(errorHandler(err)).rejects.toBe(err);
      expect(sessionStorage.getItem("admin_token")).toBeNull();
      expect(sessionStorage.getItem("admin_user")).toBeNull();
      expect(window.location.href).toBe("/login");
    });

    it("clears session and redirects to /login on 403 for non-login request", async () => {
      const err = {
        config: { url: "/admin/users" },
        response: { status: 403 },
      };
      await expect(errorHandler(err)).rejects.toBe(err);
      expect(sessionStorage.getItem("admin_token")).toBeNull();
      expect(window.location.href).toBe("/login");
    });

    it("does NOT redirect on 401 for login request — Login.tsx handles it", async () => {
      const err = {
        config: { url: "/auth/login" },
        response: { status: 401 },
      };
      await expect(errorHandler(err)).rejects.toBe(err);
      expect(sessionStorage.getItem("admin_token")).toBe("some-token");
    });

    it("does NOT redirect on 403 for login request — Login.tsx handles it", async () => {
      const err = {
        config: { url: "/auth/login" },
        response: { status: 403, data: { detail: "Account deactivated" } },
      };
      await expect(errorHandler(err)).rejects.toBe(err);
      expect(sessionStorage.getItem("admin_token")).toBe("some-token");
    });

    it("does NOT redirect on 401 for refresh request — prevents infinite loop", async () => {
      const err = {
        config: { url: "/auth/refresh" },
        response: { status: 401 },
      };
      await expect(errorHandler(err)).rejects.toBe(err);
      expect(sessionStorage.getItem("admin_token")).toBe("some-token");
    });

    it("does NOT clear session on non-auth errors (500, 422, etc.)", async () => {
      const err = {
        config: { url: "/admin/users" },
        response: { status: 500 },
      };
      await expect(errorHandler(err)).rejects.toBe(err);
      expect(sessionStorage.getItem("admin_token")).toBe("some-token");
    });

    it("handles network errors (no response) without crashing", async () => {
      const err = { message: "Network Error" };
      await expect(errorHandler(err)).rejects.toBe(err);
      expect(sessionStorage.getItem("admin_token")).toBe("some-token");
    });
  });

  describe("response interceptor — sliding session (refresh token flow)", () => {
    let errorHandler: any;

    beforeEach(() => {
      errorHandler = api._responseInterceptors[0].err;
      sessionStorage.setItem("admin_token", "old-access");
      sessionStorage.setItem("admin_refresh_token", "stored-refresh");
      sessionStorage.setItem("admin_user", '{"id":"1"}');
      Object.defineProperty(window, "location", {
        writable: true,
        value: { href: "/" },
      });
    });

    it("on 401 with refresh token: calls /auth/refresh and stores new tokens", async () => {
      api.post.mockResolvedValueOnce({
        data: { access_token: "new-access", refresh_token: "new-refresh" },
      });
      const err = {
        config: { url: "/admin/users", headers: {} },
        response: { status: 401 },
      };
      await errorHandler(err);
      expect(api.post).toHaveBeenCalledWith("/auth/refresh", {
        refresh_token: "stored-refresh",
      });
      expect(sessionStorage.getItem("admin_token")).toBe("new-access");
      expect(sessionStorage.getItem("admin_refresh_token")).toBe("new-refresh");
    });

    it("on 401 with refresh token but refresh fails: clears session and redirects", async () => {
      api.post.mockRejectedValueOnce(new Error("Refresh failed"));
      const err = {
        config: { url: "/admin/users", headers: {} },
        response: { status: 401 },
      };
      await expect(errorHandler(err)).rejects.toBeDefined();
      expect(sessionStorage.getItem("admin_token")).toBeNull();
      expect(sessionStorage.getItem("admin_refresh_token")).toBeNull();
      expect(sessionStorage.getItem("admin_user")).toBeNull();
      expect(window.location.href).toBe("/login");
    });

    it("on 403 with refresh token: attempts refresh the same way", async () => {
      api.post.mockResolvedValueOnce({
        data: { access_token: "new-access-403", refresh_token: "new-rt-403" },
      });
      const err = {
        config: { url: "/admin/settings", headers: {} },
        response: { status: 403 },
      };
      await errorHandler(err);
      expect(api.post).toHaveBeenCalledWith("/auth/refresh", {
        refresh_token: "stored-refresh",
      });
      expect(sessionStorage.getItem("admin_token")).toBe("new-access-403");
    });
  });

  describe("instance configuration", () => {
    it("creates axios instance with JSON content type", () => {
      expect(mockAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
  });

  describe("response interceptor — success handler", () => {
    it("passes through successful responses unchanged", () => {
      const okHandler = api._responseInterceptors[0].ok;
      const mockResponse = { data: { test: true }, status: 200 };
      expect(okHandler(mockResponse)).toBe(mockResponse);
    });
  });
});
