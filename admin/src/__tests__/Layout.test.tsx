/**
 * Layout.tsx — Prescriptive tests
 *
 * Layout MUST:
 * 1. Render navigation links: Dashboard, Users, Audit Log, Settings
 * 2. Show user email in sidebar
 * 3. Perform best-effort backend logout before clearing session (BUG FIX)
 * 4. Logout still works if backend logout call fails
 * 5. Navigate to /login after logout
 * 6. Show theme toggle button (Dark/Light Mode)
 * 7. Call theme toggle when button is clicked
 * 8. Render Outlet for child routes
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Layout from "../components/Layout";

const mockLogout = vi.fn();
const mockNavigate = vi.fn();
const mockToggle = vi.fn();

vi.mock("../lib/auth", () => ({
  useAuth: () => ({
    user: {
      id: "a1",
      email: "admin@cartaraiq.app",
      name: "Admin",
      role: "admin",
    },
    logout: mockLogout,
  }),
}));

let currentTheme = "light";

vi.mock("../lib/theme", () => ({
  useTheme: () => ({
    get theme() {
      return currentTheme;
    },
    toggle: mockToggle,
  }),
}));

vi.mock("../lib/api", () => ({
  default: {
    post: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    Outlet: () => <div data-testid="outlet">Route Content</div>,
  };
});

import api from "../lib/api";
const mockApi = api as any;

function renderLayout() {
  return render(
    <MemoryRouter>
      <Layout />
    </MemoryRouter>,
  );
}

describe("Layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentTheme = "light";
  });

  it("renders all navigation links", () => {
    renderLayout();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Users")).toBeInTheDocument();
    expect(screen.getByText("Audit Log")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("shows user email in sidebar", () => {
    renderLayout();
    expect(screen.getByText("admin@cartaraiq.app")).toBeInTheDocument();
  });

  it("renders the Outlet for child routes", () => {
    renderLayout();
    expect(screen.getByTestId("outlet")).toBeInTheDocument();
  });

  it("calls backend /auth/logout then clears session on sign out", async () => {
    mockApi.post.mockResolvedValueOnce({ data: {} });
    const user = userEvent.setup();

    renderLayout();
    await user.click(screen.getByText("Sign Out"));

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith("/auth/logout");
      expect(mockLogout).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith("/login");
    });
  });

  it("still clears session if backend logout fails (best-effort)", async () => {
    mockApi.post.mockRejectedValueOnce(new Error("Network Error"));
    const user = userEvent.setup();

    renderLayout();
    await user.click(screen.getByText("Sign Out"));

    await waitFor(() => {
      // Even though backend call failed, local session must be cleared
      expect(mockLogout).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith("/login");
    });
  });

  it("shows Dark Mode toggle when theme is light", () => {
    renderLayout();
    expect(screen.getByText("Dark Mode")).toBeInTheDocument();
  });

  it("calls theme toggle when clicked", async () => {
    const user = userEvent.setup();
    renderLayout();
    await user.click(screen.getByText("Dark Mode"));
    expect(mockToggle).toHaveBeenCalled();
  });

  it("shows app branding", () => {
    renderLayout();
    expect(screen.getByText("CartaraIQ")).toBeInTheDocument();
    expect(screen.getByText("Admin Portal")).toBeInTheDocument();
  });

  it("shows Light Mode toggle when theme is dark", () => {
    currentTheme = "dark";
    renderLayout();
    expect(screen.getByText("Light Mode")).toBeInTheDocument();
  });
});
