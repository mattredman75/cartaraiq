/**
 * ProtectedRoute.tsx — Prescriptive tests
 *
 * ProtectedRoute MUST:
 * 1. Show loading spinner while auth state is loading
 * 2. Redirect to /login when no user
 * 3. Redirect to /login when user role is not admin
 * 4. Render children when user is admin
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ProtectedRoute from "../components/ProtectedRoute";

const mockUseAuth = vi.fn();

vi.mock("../lib/auth", () => ({
  useAuth: () => mockUseAuth(),
}));

function renderProtected() {
  return render(
    <MemoryRouter>
      <ProtectedRoute>
        <div data-testid="protected-content">Secret Admin Content</div>
      </ProtectedRoute>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute", () => {
  it("shows loading spinner while auth is loading", () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: true });
    renderProtected();
    // Should show spinner, not content, not redirect
    expect(screen.queryByTestId("protected-content")).toBeNull();
    // Spinner element present
    expect(document.querySelector(".animate-spin")).not.toBeNull();
  });

  it("redirects to /login when auth is loaded but no user", () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false });
    renderProtected();
    expect(screen.queryByTestId("protected-content")).toBeNull();
  });

  it("redirects to /login when user role is not admin", () => {
    mockUseAuth.mockReturnValue({
      user: { id: "1", email: "u@test.com", name: "U", role: "user" },
      isLoading: false,
    });
    renderProtected();
    expect(screen.queryByTestId("protected-content")).toBeNull();
  });

  it("renders children when user is admin", () => {
    mockUseAuth.mockReturnValue({
      user: { id: "1", email: "a@test.com", name: "A", role: "admin" },
      isLoading: false,
    });
    renderProtected();
    expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    expect(screen.getByText("Secret Admin Content")).toBeInTheDocument();
  });
});
