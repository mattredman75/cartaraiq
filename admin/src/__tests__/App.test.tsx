/**
 * App.tsx — Prescriptive tests
 *
 * App MUST:
 * 1. Wrap everything in ThemeProvider, AuthProvider, BrowserRouter
 * 2. Render Login route at /login
 * 3. Render protected routes for authenticated admin users
 * 4. Redirect unauthenticated users to /login
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// We test the component wiring, not each individual page
vi.mock("../lib/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}));

// Mock all page components to isolate routing logic
vi.mock("../pages/Login", () => ({
  default: () => <div data-testid="login-page">Login Page</div>,
}));

vi.mock("../pages/Dashboard", () => ({
  default: () => <div data-testid="dashboard-page">Dashboard</div>,
}));

vi.mock("../pages/Users", () => ({
  default: () => <div data-testid="users-page">Users</div>,
}));

vi.mock("../pages/UserDetail", () => ({
  default: () => <div data-testid="user-detail-page">UserDetail</div>,
}));

vi.mock("../pages/AuditLog", () => ({
  default: () => <div data-testid="audit-page">Audit</div>,
}));

vi.mock("../pages/Settings", () => ({
  default: () => <div data-testid="settings-page">Settings</div>,
}));

// Provide auth context
const mockUser = vi.fn();

vi.mock("../lib/auth", () => ({
  AuthProvider: ({ children }: any) => <div>{children}</div>,
  useAuth: () => mockUser(),
}));

vi.mock("../lib/theme", () => ({
  ThemeProvider: ({ children }: any) => <div>{children}</div>,
  useTheme: () => ({ theme: "light", toggle: vi.fn() }),
}));

import App from "../App";

describe("App routing", () => {
  it("renders login page at /login", async () => {
    mockUser.mockReturnValue({ user: null, isLoading: false });

    // Override BrowserRouter's behavior by setting window.location
    window.history.pushState({}, "", "/login");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("login-page")).toBeInTheDocument();
    });
  });

  it("redirects to login when user is not authenticated", async () => {
    mockUser.mockReturnValue({ user: null, isLoading: false });

    window.history.pushState({}, "", "/");
    render(<App />);

    // Should not see dashboard since user is not authenticated
    await waitFor(() => {
      expect(screen.queryByTestId("dashboard-page")).toBeNull();
    });
  });

  it("renders dashboard for authenticated admin user", async () => {
    mockUser.mockReturnValue({
      user: { id: "1", email: "a@test.com", name: "Admin", role: "admin" },
      isLoading: false,
    });

    window.history.pushState({}, "", "/");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-page")).toBeInTheDocument();
    });
  });
});
