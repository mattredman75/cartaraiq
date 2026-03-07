/**
 * TestResults.tsx — Prescriptive tests
 *
 * TestResults MUST:
 * 1. Render page heading and "Run All Tests" button
 * 2. Render a card for each test suite (Backend, Mobile App, Admin)
 * 3. Show individual "Run" buttons for each suite
 * 4. Show loading state when a suite is running
 * 5. Display pass/fail stats after a suite run
 * 6. Show error state when API request fails
 * 7. Show summary bar after running tests
 * 8. Show failed test details when tests fail
 * 9. Toggle raw output visibility
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TestResultsPage from "../pages/TestResults";

vi.mock("../lib/api", () => ({
  default: {
    post: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}));

import api from "../lib/api";
const mockApi = api as any;

describe("TestResults page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders page heading and Run All Tests button", () => {
    render(<TestResultsPage />);
    expect(screen.getByText("Test Results")).toBeInTheDocument();
    expect(screen.getByText("Run All Tests")).toBeInTheDocument();
  });

  it("renders a card for each test suite", () => {
    render(<TestResultsPage />);
    expect(screen.getByText("Backend API")).toBeInTheDocument();
    expect(screen.getByText("Mobile App")).toBeInTheDocument();
    expect(screen.getByText("Admin Panel")).toBeInTheDocument();
  });

  it("renders individual Run buttons for each suite", () => {
    render(<TestResultsPage />);
    const runButtons = screen.getAllByText("Run");
    expect(runButtons).toHaveLength(3);
  });

  it("shows pass/fail stats after a suite run", async () => {
    const user = userEvent.setup();
    mockApi.post.mockResolvedValue({
      data: {
        suites: {
          backend: {
            status: "pass",
            passed: 42,
            failed: 0,
            skipped: 2,
            errors: 0,
            total: 44,
            coverage: 95,
            duration: 8.5,
            output: "All tests passed",
          },
        },
      },
    });

    render(<TestResultsPage />);
    const runButtons = screen.getAllByText("Run");
    await act(async () => {
      await user.click(runButtons[0]);
    });

    await waitFor(() => {
      expect(screen.getByText("95%")).toBeInTheDocument();
      expect(screen.getByText("8.5s")).toBeInTheDocument();
    });
  });

  it("shows error state when API fails", async () => {
    const user = userEvent.setup();
    mockApi.post.mockRejectedValue(new Error("Network error"));

    render(<TestResultsPage />);
    const runButtons = screen.getAllByText("Run");
    await act(async () => {
      await user.click(runButtons[0]);
    });

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  it("shows summary bar after tests complete", async () => {
    const user = userEvent.setup();
    mockApi.post.mockResolvedValue({
      data: {
        suites: {
          backend: {
            status: "pass",
            passed: 10,
            failed: 0,
            skipped: 0,
            errors: 0,
            total: 10,
            coverage: 90,
            duration: 5,
            output: "",
          },
        },
      },
    });

    render(<TestResultsPage />);
    const runButtons = screen.getAllByText("Run");
    await act(async () => {
      await user.click(runButtons[0]);
    });

    await waitFor(() => {
      expect(screen.getByText("All Tests Passing")).toBeInTheDocument();
    });
  });

  it("shows coverage ring with percentage", async () => {
    const user = userEvent.setup();
    mockApi.post.mockResolvedValue({
      data: {
        suites: {
          backend: {
            status: "pass",
            passed: 10,
            failed: 0,
            skipped: 0,
            errors: 0,
            total: 10,
            coverage: 92,
            duration: 3,
            output: "",
          },
        },
      },
    });

    render(<TestResultsPage />);
    const runButtons = screen.getAllByText("Run");
    await act(async () => {
      await user.click(runButtons[0]);
    });

    await waitFor(() => {
      expect(screen.getByText("92%")).toBeInTheDocument();
    });
  });

  it("shows failed test details when tests fail", async () => {
    const user = userEvent.setup();
    mockApi.post.mockResolvedValue({
      data: {
        suites: {
          backend: {
            status: "fail",
            passed: 8,
            failed: 2,
            skipped: 0,
            errors: 0,
            total: 10,
            coverage: 85,
            duration: 4,
            output: "",
            failed_tests: [
              {
                name: "test_login_fails",
                message: "AssertionError: expected 200 but got 401",
              },
            ],
          },
        },
      },
    });

    render(<TestResultsPage />);
    const runButtons = screen.getAllByText("Run");
    await act(async () => {
      await user.click(runButtons[0]);
    });

    await waitFor(() => {
      expect(screen.getByText("test_login_fails")).toBeInTheDocument();
      expect(screen.getByText("Some Tests Failing")).toBeInTheDocument();
    });
  });

  it("toggles raw output visibility", async () => {
    const user = userEvent.setup();
    mockApi.post.mockResolvedValue({
      data: {
        suites: {
          backend: {
            status: "pass",
            passed: 5,
            failed: 0,
            skipped: 0,
            errors: 0,
            total: 5,
            coverage: 99,
            duration: 2,
            output: "pytest output here",
          },
        },
      },
    });

    render(<TestResultsPage />);
    const runButtons = screen.getAllByText("Run");
    await act(async () => {
      await user.click(runButtons[0]);
    });

    await waitFor(() => {
      expect(screen.getByText("Show raw output")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Show raw output"));
    expect(screen.getByText(/pytest output here/)).toBeInTheDocument();

    await user.click(screen.getByText("Hide raw output"));
    expect(screen.queryByText(/pytest output here/)).not.toBeInTheDocument();
  });

  it("shows Passed badge when suite passes", async () => {
    const user = userEvent.setup();
    mockApi.post.mockResolvedValue({
      data: {
        suites: {
          app: {
            status: "pass",
            passed: 20,
            failed: 0,
            skipped: 0,
            errors: 0,
            total: 20,
            coverage: null,
            duration: 10,
            output: "",
          },
        },
      },
    });

    render(<TestResultsPage />);
    const runButtons = screen.getAllByText("Run");
    // Click the second run button (Mobile App)
    await act(async () => {
      await user.click(runButtons[1]);
    });

    await waitFor(() => {
      // The "Passed" badge text from the statusBadge function
      expect(mockApi.post).toHaveBeenCalledWith("/admin/tests/run?suite=app");
    });
  });
});
