/**
 * UserDetail.tsx — Prescriptive tests
 *
 * UserDetail MUST:
 * 1. Show loading spinner initially
 * 2. Render user details correctly
 * 3. Navigate to /users ONLY on 404 — NOT on other errors (BUG FIX)
 * 4. Show error message with retry button on non-404 errors (BUG FIX)
 * 5. Show correct action buttons based on user state
 * 6. Prevent self-demotion (disable button for own account)
 * 7. Show confirmation dialog before destructive actions
 * 8. Display success/error messages after actions
 * 9. Hide "Force Password Reset" for social auth users
 * 10. Show audit history table
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import UserDetailPage from "../pages/UserDetail";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("../lib/auth", () => ({
  useAuth: () => ({
    user: {
      id: "admin-1",
      email: "admin@test.com",
      name: "Admin",
      role: "admin",
    },
  }),
}));

vi.mock("../lib/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}));

import api from "../lib/api";
const mockApi = api as any;

const sampleUser = {
  id: "user-1",
  email: "user@test.com",
  name: "Test User",
  role: "user",
  auth_provider: null,
  auth_provider_id: null,
  is_active: true,
  biometric_enabled: false,
  biometric_type: null,
  created_at: "2025-01-01T00:00:00Z",
  has_password: true,
  has_refresh_token: true,
  list_count: 5,
  item_count: 20,
  push_token_count: 2,
  recent_audit: [
    {
      id: "a1",
      action: "login",
      status: "success",
      ip_address: "1.2.3.4",
      created_at: "2025-01-15T10:00:00Z",
      detail: null,
    },
  ],
};

function renderUserDetail(userId = "user-1") {
  return render(
    <MemoryRouter initialEntries={[`/users/${userId}`]}>
      <Routes>
        <Route path="/users/:userId" element={<UserDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("UserDetail page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading spinner initially", () => {
    mockApi.get.mockReturnValue(new Promise(() => {}));
    renderUserDetail();
    expect(document.querySelector(".animate-spin")).not.toBeNull();
  });

  it("renders user details correctly", async () => {
    mockApi.get.mockResolvedValue({ data: sampleUser });

    await act(async () => {
      renderUserDetail();
    });

    await waitFor(() => {
      expect(screen.getByText("Test User")).toBeInTheDocument();
      expect(screen.getByText("user@test.com")).toBeInTheDocument();
      expect(screen.getByText("Active")).toBeInTheDocument();
      expect(screen.getByText("user")).toBeInTheDocument();
    });
  });

  it("shows account info fields correctly", async () => {
    mockApi.get.mockResolvedValue({ data: sampleUser });

    await act(async () => {
      renderUserDetail();
    });

    await waitFor(() => {
      expect(screen.getByText("Email")).toBeInTheDocument();
      // has_password and has_active_session both show "Yes"
      const yesElements = screen.getAllByText("Yes");
      expect(yesElements.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Disabled")).toBeInTheDocument(); // biometric
    });
  });

  it("navigates to /users on 404 error (user not found)", async () => {
    mockApi.get.mockRejectedValue({
      response: { status: 404, data: { detail: "User not found" } },
    });

    await act(async () => {
      renderUserDetail();
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/users");
    });
  });

  it("shows error with retry button on non-404 error (BUG FIX: was navigating away)", async () => {
    mockApi.get.mockRejectedValue({
      response: { status: 500 },
    });

    await act(async () => {
      renderUserDetail();
    });

    await waitFor(() => {
      expect(
        screen.getByText(/failed to load user details/i),
      ).toBeInTheDocument();
      expect(screen.getByText("Retry")).toBeInTheDocument();
    });
    // Must NOT navigate away
    expect(mockNavigate).not.toHaveBeenCalledWith("/users");
  });

  it("navigates to /users when 'Back to Users' clicked in error state", async () => {
    mockApi.get.mockRejectedValue({
      response: { status: 500 },
    });

    const user = userEvent.setup();
    await act(async () => {
      renderUserDetail();
    });

    await waitFor(() => {
      expect(screen.getByText("Retry")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Back to Users"));
    expect(mockNavigate).toHaveBeenCalledWith("/users");
  });

  it("shows server error detail when available", async () => {
    mockApi.get.mockRejectedValue({
      response: { status: 500, data: { detail: "Database connection failed" } },
    });

    await act(async () => {
      renderUserDetail();
    });

    await waitFor(() => {
      expect(
        screen.getByText("Database connection failed"),
      ).toBeInTheDocument();
    });
  });

  it("shows error for network errors (no response)", async () => {
    mockApi.get.mockRejectedValue(new Error("Network Error"));

    await act(async () => {
      renderUserDetail();
    });

    await waitFor(() => {
      expect(
        screen.getByText(/failed to load user details/i),
      ).toBeInTheDocument();
    });
  });

  it("retry button re-fetches user data", async () => {
    mockApi.get.mockRejectedValueOnce({
      response: { status: 500, data: { detail: "Server Error" } },
    });

    await act(async () => {
      renderUserDetail();
    });

    await waitFor(() => {
      expect(screen.getByText("Retry")).toBeInTheDocument();
    });

    // Now make it succeed on retry
    mockApi.get.mockResolvedValue({ data: sampleUser });
    const user = userEvent.setup();
    await user.click(screen.getByText("Retry"));

    await waitFor(() => {
      expect(screen.getByText("Test User")).toBeInTheDocument();
    });
  });

  it("shows Deactivate button for active users", async () => {
    mockApi.get.mockResolvedValue({ data: sampleUser });

    await act(async () => {
      renderUserDetail();
    });

    await waitFor(() => {
      expect(screen.getByText("Deactivate")).toBeInTheDocument();
    });
  });

  it("shows Activate button for inactive users", async () => {
    mockApi.get.mockResolvedValue({
      data: { ...sampleUser, is_active: false },
    });

    await act(async () => {
      renderUserDetail();
    });

    await waitFor(() => {
      expect(screen.getByText("Activate")).toBeInTheDocument();
    });
  });

  it("hides 'Force Password Reset' for social auth users", async () => {
    mockApi.get.mockResolvedValue({
      data: { ...sampleUser, auth_provider: "google" },
    });

    await act(async () => {
      renderUserDetail();
    });

    await waitFor(() => {
      expect(screen.getByText("Test User")).toBeInTheDocument();
    });
    expect(screen.queryByText("Force Password Reset")).toBeNull();
  });

  it("shows 'Force Password Reset' for email-based users", async () => {
    mockApi.get.mockResolvedValue({ data: sampleUser });

    await act(async () => {
      renderUserDetail();
    });

    await waitFor(() => {
      expect(screen.getByText("Force Password Reset")).toBeInTheDocument();
    });
  });

  it("shows Promote to Admin for regular users", async () => {
    mockApi.get.mockResolvedValue({ data: sampleUser });

    await act(async () => {
      renderUserDetail();
    });

    await waitFor(() => {
      expect(screen.getByText("Promote to Admin")).toBeInTheDocument();
    });
  });

  it("shows Demote to User for admin users", async () => {
    mockApi.get.mockResolvedValue({
      data: { ...sampleUser, role: "admin" },
    });

    await act(async () => {
      renderUserDetail();
    });

    await waitFor(() => {
      expect(screen.getByText("Demote to User")).toBeInTheDocument();
    });
  });

  it("disables self-demotion button with tooltip", async () => {
    mockApi.get.mockResolvedValue({
      data: { ...sampleUser, id: "admin-1", role: "admin" }, // Same as mock auth user
    });

    await act(async () => {
      renderUserDetail("admin-1");
    });

    await waitFor(() => {
      const demoteBtn = screen.getByText("Demote to User").closest("button")!;
      expect(demoteBtn).toBeDisabled();
      expect(demoteBtn).toHaveAttribute("title", "You cannot demote yourself");
    });
  });

  it("calls API with correct action when deactivate is confirmed", async () => {
    mockApi.get.mockResolvedValue({ data: sampleUser });
    mockApi.post.mockResolvedValue({ data: { message: "User deactivated" } });

    const user = userEvent.setup();
    await act(async () => {
      renderUserDetail();
    });

    await waitFor(() => {
      expect(screen.getByText("Deactivate")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Deactivate"));

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith(
        "/admin/users/user-1/deactivate",
      );
      expect(screen.getByText("User deactivated")).toBeInTheDocument();
    });
  });

  it("does NOT call API when confirm dialog is cancelled", async () => {
    vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    mockApi.get.mockResolvedValue({ data: sampleUser });

    const user = userEvent.setup();
    await act(async () => {
      renderUserDetail();
    });

    await waitFor(() => {
      expect(screen.getByText("Deactivate")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Deactivate"));
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it("shows error message when action fails", async () => {
    mockApi.get.mockResolvedValue({ data: sampleUser });
    mockApi.post.mockRejectedValue({
      response: { data: { detail: "Permission denied" } },
    });

    const user = userEvent.setup();
    await act(async () => {
      renderUserDetail();
    });

    await waitFor(() => {
      expect(screen.getByText("Revoke Sessions")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Revoke Sessions"));

    await waitFor(() => {
      expect(screen.getByText("Permission denied")).toBeInTheDocument();
    });
  });

  it("shows 'Action failed' when action error has no detail", async () => {
    mockApi.get.mockResolvedValue({ data: sampleUser });
    mockApi.post.mockRejectedValue(new Error("Network Error"));

    const user = userEvent.setup();
    await act(async () => {
      renderUserDetail();
    });

    await waitFor(() => {
      expect(screen.getByText("Revoke Sessions")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Revoke Sessions"));

    await waitFor(() => {
      expect(screen.getByText("Action failed")).toBeInTheDocument();
    });
  });

  it("renders audit history table", async () => {
    mockApi.get.mockResolvedValue({ data: sampleUser });

    await act(async () => {
      renderUserDetail();
    });

    await waitFor(() => {
      expect(screen.getByText("Recent Activity (1)")).toBeInTheDocument();
      expect(screen.getByText("login")).toBeInTheDocument();
      expect(screen.getByText("1.2.3.4")).toBeInTheDocument();
    });
  });

  it("shows 'No audit history' when recent_audit is empty", async () => {
    mockApi.get.mockResolvedValue({
      data: { ...sampleUser, recent_audit: [] },
    });

    await act(async () => {
      renderUserDetail();
    });

    await waitFor(() => {
      expect(screen.getByText("No audit history")).toBeInTheDocument();
    });
  });

  it("shows biometric info when enabled", async () => {
    mockApi.get.mockResolvedValue({
      data: {
        ...sampleUser,
        biometric_enabled: true,
        biometric_type: "Face ID",
      },
    });

    await act(async () => {
      renderUserDetail();
    });

    await waitFor(() => {
      expect(screen.getByText("Face ID")).toBeInTheDocument();
    });
  });

  it("uses PUT method for role changes", async () => {
    mockApi.get.mockResolvedValue({ data: sampleUser });
    mockApi.put.mockResolvedValue({ data: { message: "Role updated" } });

    const user = userEvent.setup();
    await act(async () => {
      renderUserDetail();
    });

    await waitFor(() => {
      expect(screen.getByText("Promote to Admin")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Promote to Admin"));

    await waitFor(() => {
      expect(mockApi.put).toHaveBeenCalledWith("/admin/users/user-1/role", {
        role: "admin",
      });
    });
  });

  it("shows provider ID row when auth_provider_id is present", async () => {
    mockApi.get.mockResolvedValue({
      data: {
        ...sampleUser,
        auth_provider: "google",
        auth_provider_id: "google-sub-123456",
      },
    });

    await act(async () => {
      renderUserDetail();
    });

    await waitFor(() => {
      expect(screen.getByText("Provider ID")).toBeInTheDocument();
      expect(screen.getByText("google-sub-123456")).toBeInTheDocument();
    });
  });

  it("hides provider ID row when auth_provider_id is null", async () => {
    mockApi.get.mockResolvedValue({ data: sampleUser });

    await act(async () => {
      renderUserDetail();
    });

    await waitFor(() => {
      expect(screen.getByText("Test User")).toBeInTheDocument();
    });

    expect(screen.queryByText("Provider ID")).toBeNull();
  });

  it("shows 'Enabled' fallback when biometric_type is null but biometric is enabled", async () => {
    mockApi.get.mockResolvedValue({
      data: {
        ...sampleUser,
        biometric_enabled: true,
        biometric_type: null,
      },
    });

    await act(async () => {
      renderUserDetail();
    });

    await waitFor(() => {
      expect(screen.getByText("Enabled")).toBeInTheDocument();
    });
  });

  it("calls activate action for inactive user", async () => {
    mockApi.get.mockResolvedValue({
      data: { ...sampleUser, is_active: false },
    });
    mockApi.post.mockResolvedValue({ data: { message: "User activated" } });

    const user = userEvent.setup();
    await act(async () => {
      renderUserDetail();
    });

    await waitFor(() => {
      expect(screen.getByText("Activate")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Activate"));

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith("/admin/users/user-1/activate");
      expect(screen.getByText("User activated")).toBeInTheDocument();
    });
  });

  it("calls demote action for admin user (non-self)", async () => {
    mockApi.get.mockResolvedValue({
      data: { ...sampleUser, id: "other-admin", role: "admin" },
    });
    mockApi.put.mockResolvedValue({ data: { message: "Demoted to user" } });

    const user = userEvent.setup();
    await act(async () => {
      renderUserDetail("other-admin");
    });

    await waitFor(() => {
      expect(screen.getByText("Demote to User")).toBeInTheDocument();
    });

    const demoteBtn = screen.getByText("Demote to User").closest("button")!;
    expect(demoteBtn).not.toBeDisabled();

    await user.click(demoteBtn);

    await waitFor(() => {
      expect(mockApi.put).toHaveBeenCalledWith(
        "/admin/users/other-admin/role",
        { role: "user" },
      );
    });
  });

  it("calls force-password-reset action for email users", async () => {
    mockApi.get.mockResolvedValue({ data: sampleUser });
    mockApi.post.mockResolvedValue({
      data: { message: "Password reset forced" },
    });

    const user = userEvent.setup();
    await act(async () => {
      renderUserDetail();
    });

    await waitFor(() => {
      expect(screen.getByText("Force Password Reset")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Force Password Reset"));

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith(
        "/admin/users/user-1/force-password-reset",
      );
    });
  });

  it("shows usage stats correctly", async () => {
    mockApi.get.mockResolvedValue({ data: sampleUser });

    await act(async () => {
      renderUserDetail();
    });

    await waitFor(() => {
      expect(screen.getByText("Shopping Lists")).toBeInTheDocument();
      expect(screen.getByText("5")).toBeInTheDocument();
      expect(screen.getByText("Total Items")).toBeInTheDocument();
      expect(screen.getByText("20")).toBeInTheDocument();
      expect(screen.getByText("Push Tokens")).toBeInTheDocument();
    });
  });

  it("navigates to /users when 'Back to Users' clicked in detail view", async () => {
    mockApi.get.mockResolvedValue({ data: sampleUser });

    const user = userEvent.setup();
    await act(async () => {
      renderUserDetail();
    });

    await waitFor(() => {
      expect(screen.getByText("Test User")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Back to Users"));
    expect(mockNavigate).toHaveBeenCalledWith("/users");
  });
});
