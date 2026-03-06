/**
 * Login.tsx — Prescriptive tests
 *
 * The Login page MUST:
 * 1. Submit email and password via auth.login()
 * 2. Navigate to / on successful login
 * 3. Show "Invalid email or password." on 401
 * 4. Show "Account has been deactivated." on 403 (non-admin-access)
 * 5. Show "This account does not have admin privileges." on 403 with admin detail
 * 6. Show "This account does not have admin privileges." when client-side admin check fails
 * 7. Show "Too many attempts." on 429
 * 8. Show "An unexpected error occurred." on generic errors
 * 9. Show loading (disable button) during login, re-enable after error
 * 10. Have accessible form with labels
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Login from "../pages/Login";

const mockLogin = vi.fn();
const mockNavigate = vi.fn();

vi.mock("../lib/auth", () => ({
  useAuth: () => ({ login: mockLogin }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderLogin() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>,
  );
}

describe("Login page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submits email and password, navigates to / on success", async () => {
    mockLogin.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();

    renderLogin();
    await user.type(screen.getByLabelText("Email"), "admin@test.com");
    await user.type(screen.getByLabelText("Password"), "pass123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("admin@test.com", "pass123");
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });
  });

  it("shows 'Invalid email or password.' on 401", async () => {
    mockLogin.mockRejectedValueOnce({ response: { status: 401 } });
    const user = userEvent.setup();

    renderLogin();
    await user.type(screen.getByLabelText("Email"), "bad@test.com");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Invalid email or password."),
      ).toBeInTheDocument();
    });
  });

  it("shows deactivation message on 403 without admin-access detail", async () => {
    mockLogin.mockRejectedValueOnce({
      response: { status: 403, data: { detail: "Account is disabled" } },
    });
    const user = userEvent.setup();

    renderLogin();
    await user.type(screen.getByLabelText("Email"), "a@test.com");
    await user.type(screen.getByLabelText("Password"), "p");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Account has been deactivated."),
      ).toBeInTheDocument();
    });
  });

  it("shows admin-access denied on 403 with 'Admin access required' detail", async () => {
    mockLogin.mockRejectedValueOnce({
      response: { status: 403, data: { detail: "Admin access required" } },
    });
    const user = userEvent.setup();

    renderLogin();
    await user.type(screen.getByLabelText("Email"), "a@test.com");
    await user.type(screen.getByLabelText("Password"), "p");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(
        screen.getByText("This account does not have admin privileges."),
      ).toBeInTheDocument();
    });
  });

  it("shows admin-access denied when client-side role check fails", async () => {
    mockLogin.mockRejectedValueOnce(new Error("Admin access required"));
    const user = userEvent.setup();

    renderLogin();
    await user.type(screen.getByLabelText("Email"), "a@test.com");
    await user.type(screen.getByLabelText("Password"), "p");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(
        screen.getByText("This account does not have admin privileges."),
      ).toBeInTheDocument();
    });
  });

  it("shows rate limit message on 429", async () => {
    mockLogin.mockRejectedValueOnce({ response: { status: 429 } });
    const user = userEvent.setup();

    renderLogin();
    await user.type(screen.getByLabelText("Email"), "a@test.com");
    await user.type(screen.getByLabelText("Password"), "p");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Too many attempts. Please wait and try again."),
      ).toBeInTheDocument();
    });
  });

  it("shows generic error for unexpected failures", async () => {
    mockLogin.mockRejectedValueOnce(new Error("Network timeout"));
    const user = userEvent.setup();

    renderLogin();
    await user.type(screen.getByLabelText("Email"), "a@test.com");
    await user.type(screen.getByLabelText("Password"), "p");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(
        screen.getByText("An unexpected error occurred. Please try again."),
      ).toBeInTheDocument();
    });
  });

  it("shows loading state during login and re-enables after error", async () => {
    let rejectFn: any;
    mockLogin.mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectFn = reject;
      }),
    );
    const user = userEvent.setup();

    renderLogin();
    await user.type(screen.getByLabelText("Email"), "a@test.com");
    await user.type(screen.getByLabelText("Password"), "p");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    // Button should show loading state
    expect(screen.getByRole("button").textContent).toContain("Signing in");
    expect(screen.getByRole("button")).toBeDisabled();

    // Resolve error
    await waitFor(async () => {
      rejectFn({ response: { status: 401 } });
    });

    await waitFor(() => {
      expect(screen.getByRole("button").textContent).toContain("Sign In");
      expect(screen.getByRole("button")).not.toBeDisabled();
    });
  });

  it("does NOT navigate on failed login", async () => {
    mockLogin.mockRejectedValueOnce({ response: { status: 401 } });
    const user = userEvent.setup();

    renderLogin();
    await user.type(screen.getByLabelText("Email"), "a@test.com");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Invalid email or password."),
      ).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("shows deactivation message on 403 with empty detail string", async () => {
    mockLogin.mockRejectedValueOnce({
      response: { status: 403, data: { detail: "" } },
    });
    const user = userEvent.setup();

    renderLogin();
    await user.type(screen.getByLabelText("Email"), "a@test.com");
    await user.type(screen.getByLabelText("Password"), "p");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Account has been deactivated."),
      ).toBeInTheDocument();
    });
  });
});
