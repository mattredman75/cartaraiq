/**
 * Settings.tsx — Prescriptive tests
 *
 * Settings MUST:
 * 1. Show loading spinner while fetching status
 * 2. Show "OPERATIONAL" when maintenance is off
 * 3. Show "MAINTENANCE" when maintenance is on
 * 4. Show error state when API fails (BUG FIX: was showing OPERATIONAL falsely)
 * 5. Toggle maintenance with confirmation dialog
 * 6. Do NOT toggle if confirm is cancelled
 * 7. Show success feedback after toggling
 * 8. Show error feedback when toggle API fails
 * 9. Send correct message payload when enabling maintenance
 * 10. Send empty message when disabling maintenance
 * 11. Show maintenance warning when active
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SettingsPage from "../pages/Settings";

vi.mock("../lib/api", () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}));

import api from "../lib/api";
const mockApi = api as any;

describe("Settings page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading spinner while fetching status", () => {
    mockApi.get.mockReturnValue(new Promise(() => {}));
    render(<SettingsPage />);
    expect(document.querySelector(".animate-spin")).not.toBeNull();
  });

  it("shows OPERATIONAL when maintenance is off", async () => {
    mockApi.get.mockResolvedValue({
      data: { maintenance: false, message: "" },
    });

    await act(async () => {
      render(<SettingsPage />);
    });

    await waitFor(() => {
      expect(screen.getByText("OPERATIONAL")).toBeInTheDocument();
    });
  });

  it("shows MAINTENANCE when maintenance is on", async () => {
    mockApi.get.mockResolvedValue({
      data: { maintenance: true, message: "Under maintenance" },
    });

    await act(async () => {
      render(<SettingsPage />);
    });

    await waitFor(() => {
      expect(screen.getByText("MAINTENANCE")).toBeInTheDocument();
    });
  });

  it("shows error when API fails (BUG FIX: was falsely showing OPERATIONAL)", async () => {
    mockApi.get.mockRejectedValue(new Error("Server down"));

    await act(async () => {
      render(<SettingsPage />);
    });

    await waitFor(() => {
      expect(
        screen.getByText("Failed to load maintenance status"),
      ).toBeInTheDocument();
    });
    // Must NOT show OPERATIONAL — that would be misleading
    expect(screen.queryByText("OPERATIONAL")).toBeNull();
    expect(screen.queryByText("MAINTENANCE")).toBeNull();
  });

  it("shows maintenance warning banner when active", async () => {
    mockApi.get.mockResolvedValue({
      data: { maintenance: true, message: "Maintenance" },
    });

    await act(async () => {
      render(<SettingsPage />);
    });

    await waitFor(() => {
      expect(
        screen.getByText(/maintenance mode is active/i),
      ).toBeInTheDocument();
    });
  });

  it("does NOT show warning banner when operational", async () => {
    mockApi.get.mockResolvedValue({
      data: { maintenance: false, message: "" },
    });

    await act(async () => {
      render(<SettingsPage />);
    });

    await waitFor(() => {
      expect(screen.getByText("OPERATIONAL")).toBeInTheDocument();
    });
    expect(screen.queryByText(/maintenance mode is active/i)).toBeNull();
  });

  it("shows Enable button when operational, Disable when maintenance", async () => {
    mockApi.get.mockResolvedValue({
      data: { maintenance: false, message: "" },
    });

    await act(async () => {
      render(<SettingsPage />);
    });

    await waitFor(() => {
      expect(screen.getByText("Enable Maintenance Mode")).toBeInTheDocument();
    });
  });

  it("shows Disable button when in maintenance mode", async () => {
    mockApi.get.mockResolvedValue({
      data: { maintenance: true, message: "Down" },
    });

    await act(async () => {
      render(<SettingsPage />);
    });

    await waitFor(() => {
      expect(screen.getByText("Disable Maintenance Mode")).toBeInTheDocument();
    });
  });

  it("enables maintenance with confirmation and sends message", async () => {
    mockApi.get.mockResolvedValue({
      data: { maintenance: false, message: "" },
    });
    mockApi.put.mockResolvedValue({
      data: { maintenance: true, message: "We're fixing things" },
    });

    const user = userEvent.setup();
    await act(async () => {
      render(<SettingsPage />);
    });

    await waitFor(() => {
      expect(screen.getByText("Enable Maintenance Mode")).toBeInTheDocument();
    });

    // Type a message first
    await user.type(screen.getByRole("textbox"), "We're fixing things");

    await user.click(screen.getByText("Enable Maintenance Mode"));

    await waitFor(() => {
      expect(mockApi.put).toHaveBeenCalledWith("/app/maintenance", {
        maintenance: true,
        message: "We're fixing things",
      });
      expect(screen.getByText("Maintenance mode enabled")).toBeInTheDocument();
    });
  });

  it("disables maintenance with confirmation", async () => {
    mockApi.get.mockResolvedValue({
      data: { maintenance: true, message: "Down" },
    });
    mockApi.put.mockResolvedValue({
      data: { maintenance: false, message: "" },
    });

    const user = userEvent.setup();
    await act(async () => {
      render(<SettingsPage />);
    });

    await waitFor(() => {
      expect(screen.getByText("Disable Maintenance Mode")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Disable Maintenance Mode"));

    await waitFor(() => {
      expect(mockApi.put).toHaveBeenCalledWith("/app/maintenance", {
        maintenance: false,
        message: "",
      });
      expect(screen.getByText("Maintenance mode disabled")).toBeInTheDocument();
    });
  });

  it("does NOT toggle when confirm is cancelled", async () => {
    mockApi.get.mockResolvedValue({
      data: { maintenance: false, message: "" },
    });
    vi.spyOn(window, "confirm").mockReturnValueOnce(false);

    const user = userEvent.setup();
    await act(async () => {
      render(<SettingsPage />);
    });

    await waitFor(() => {
      expect(screen.getByText("Enable Maintenance Mode")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Enable Maintenance Mode"));
    expect(mockApi.put).not.toHaveBeenCalled();
  });

  it("shows error feedback when toggle API fails", async () => {
    mockApi.get.mockResolvedValue({
      data: { maintenance: false, message: "" },
    });
    mockApi.put.mockRejectedValue({
      response: { data: { detail: "Unauthorized" } },
    });

    const user = userEvent.setup();
    await act(async () => {
      render(<SettingsPage />);
    });

    await waitFor(() => {
      expect(screen.getByText("Enable Maintenance Mode")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Enable Maintenance Mode"));

    await waitFor(() => {
      expect(screen.getByText("Unauthorized")).toBeInTheDocument();
    });
  });

  it("shows 'Failed to update' when toggle error has no detail", async () => {
    mockApi.get.mockResolvedValue({
      data: { maintenance: false, message: "" },
    });
    mockApi.put.mockRejectedValue(new Error("Network Error"));

    const user = userEvent.setup();
    await act(async () => {
      render(<SettingsPage />);
    });

    await waitFor(() => {
      expect(screen.getByText("Enable Maintenance Mode")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Enable Maintenance Mode"));

    await waitFor(() => {
      expect(screen.getByText("Failed to update")).toBeInTheDocument();
    });
  });

  it("shows About section with app name", async () => {
    mockApi.get.mockResolvedValue({
      data: { maintenance: false, message: "" },
    });

    await act(async () => {
      render(<SettingsPage />);
    });

    await waitFor(() => {
      expect(screen.getByText("About")).toBeInTheDocument();
      expect(screen.getByText("CartaraIQ Admin Portal")).toBeInTheDocument();
    });
  });
});
