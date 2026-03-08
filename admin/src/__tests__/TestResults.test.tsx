/**
 * TestResults.tsx — Prescriptive tests
 *
 * TestResults MUST:
 * 1. Auto-load last results on mount (GET /admin/tests/results + history)
 * 2. Render page heading and "Run All Tests" button
 * 3. Render a card for each test suite (Backend, Mobile App, Admin)
 * 4. Show "Running" badge with background message when a suite is running
 * 5. Display pass/fail stats from persisted data
 * 6. Show error state when API request fails
 * 7. Show summary bar for completed suites
 * 8. Show failed test details when tests fail
 * 9. Toggle raw output visibility
 * 10. Poll for updates when a suite is running
 * 11. Show "time ago" for last run
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TestResultsPage from "../pages/TestResults";

// Mock recharts to avoid SVG rendering issues in jsdom
vi.mock("recharts", () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CartesianGrid: () => null,
  Legend: () => null,
}));

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

import api from "../lib/api";
const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

const emptyResults = {
  data: {
    suites: { backend: null, app: null, admin: null },
  },
};
const emptyHistory = {
  data: {
    history: { backend: [], app: [], admin: [] },
  },
};

const backendPassResult = {
  id: "run-1",
  suite: "backend",
  status: "pass",
  passed: 42,
  failed: 0,
  skipped: 2,
  errors: 0,
  total: 44,
  coverage: 95,
  duration: 8.5,
  output: "All tests passed",
  stderr: null,
  error: null,
  failed_tests: null,
  triggered_by: "admin-1",
  created_at: new Date().toISOString(),
};

describe("TestResults page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no existing results
    mockApi.get.mockImplementation((url: string) => {
      if (url === "/admin/tests/results") return Promise.resolve(emptyResults);
      if (url === "/admin/tests/history") return Promise.resolve(emptyHistory);
      return Promise.resolve({ data: {} });
    });
  });

  it("auto-loads results on mount and renders heading", async () => {
    render(<TestResultsPage />);

    await waitFor(() => {
      expect(screen.getByText("Test Results")).toBeInTheDocument();
      expect(screen.getByText("Run All Tests")).toBeInTheDocument();
    });

    expect(mockApi.get).toHaveBeenCalledWith("/admin/tests/results");
    expect(mockApi.get).toHaveBeenCalledWith("/admin/tests/history");
  });

  it("renders a card for each test suite", async () => {
    render(<TestResultsPage />);

    await waitFor(() => {
      expect(screen.getByText("Backend API")).toBeInTheDocument();
      expect(screen.getByText("Mobile App")).toBeInTheDocument();
      expect(screen.getByText("Admin Portal")).toBeInTheDocument();
    });
  });

  it("shows persisted results from last run on load", async () => {
    mockApi.get.mockImplementation((url: string) => {
      if (url === "/admin/tests/results") {
        return Promise.resolve({
          data: {
            suites: { backend: backendPassResult, app: null, admin: null },
          },
        });
      }
      if (url === "/admin/tests/history") return Promise.resolve(emptyHistory);
      return Promise.resolve({ data: {} });
    });

    render(<TestResultsPage />);

    await waitFor(() => {
      expect(screen.getByText("95%")).toBeInTheDocument();
      expect(screen.getByText("8.5s")).toBeInTheDocument();
    });
  });

  it("shows Running badge and background message when suite is running", async () => {
    mockApi.get.mockImplementation((url: string) => {
      if (url === "/admin/tests/results") {
        return Promise.resolve({
          data: {
            suites: {
              backend: {
                ...backendPassResult,
                status: "running",
                passed: 0,
                total: 0,
                coverage: null,
                duration: null,
              },
              app: null,
              admin: null,
            },
          },
        });
      }
      if (url === "/admin/tests/history") return Promise.resolve(emptyHistory);
      return Promise.resolve({ data: {} });
    });

    render(<TestResultsPage />);

    await waitFor(() => {
      expect(screen.getByText("Running")).toBeInTheDocument();
      expect(
        screen.getByText("Tests running in background…"),
      ).toBeInTheDocument();
      expect(screen.getByText(/You can leave this page/)).toBeInTheDocument();
    });
  });

  it("triggers a run and shows running state", async () => {
    const user = userEvent.setup();
    mockApi.post.mockResolvedValue({
      data: {
        suites: {
          backend: {
            ...backendPassResult,
            status: "running",
            passed: 0,
            total: 0,
            coverage: null,
          },
        },
      },
    });

    render(<TestResultsPage />);

    await waitFor(() => {
      expect(screen.getByText("Backend API")).toBeInTheDocument();
    });

    const runButtons = screen.getAllByText("Run");
    await act(async () => {
      await user.click(runButtons[0]);
    });

    expect(mockApi.post).toHaveBeenCalledWith("/admin/tests/run?suite=backend");
  });

  it("shows error state when run POST fails", async () => {
    const user = userEvent.setup();
    mockApi.post.mockRejectedValue(new Error("Network error"));

    render(<TestResultsPage />);

    await waitFor(() => {
      expect(screen.getByText("Backend API")).toBeInTheDocument();
    });

    const runButtons = screen.getAllByText("Run");
    await act(async () => {
      await user.click(runButtons[0]);
    });

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  it("shows summary bar when completed results exist", async () => {
    mockApi.get.mockImplementation((url: string) => {
      if (url === "/admin/tests/results") {
        return Promise.resolve({
          data: {
            suites: { backend: backendPassResult, app: null, admin: null },
          },
        });
      }
      if (url === "/admin/tests/history") return Promise.resolve(emptyHistory);
      return Promise.resolve({ data: {} });
    });

    render(<TestResultsPage />);

    await waitFor(() => {
      expect(screen.getByText("All Tests Passing")).toBeInTheDocument();
    });
  });

  it("shows failed test details", async () => {
    const failResult = {
      ...backendPassResult,
      status: "fail",
      passed: 8,
      failed: 2,
      total: 10,
      coverage: 85,
      failed_tests: [
        {
          name: "test_login_fails",
          message: "AssertionError: expected 200 but got 401",
        },
      ],
    };

    mockApi.get.mockImplementation((url: string) => {
      if (url === "/admin/tests/results") {
        return Promise.resolve({
          data: {
            suites: { backend: failResult, app: null, admin: null },
          },
        });
      }
      if (url === "/admin/tests/history") return Promise.resolve(emptyHistory);
      return Promise.resolve({ data: {} });
    });

    render(<TestResultsPage />);

    await waitFor(() => {
      expect(screen.getByText("test_login_fails")).toBeInTheDocument();
      expect(screen.getByText("Some Tests Failing")).toBeInTheDocument();
    });
  });

  it("toggles raw output visibility", async () => {
    const user = userEvent.setup();
    mockApi.get.mockImplementation((url: string) => {
      if (url === "/admin/tests/results") {
        return Promise.resolve({
          data: {
            suites: {
              backend: { ...backendPassResult, output: "pytest output here" },
              app: null,
              admin: null,
            },
          },
        });
      }
      if (url === "/admin/tests/history") return Promise.resolve(emptyHistory);
      return Promise.resolve({ data: {} });
    });

    render(<TestResultsPage />);

    await waitFor(() => {
      expect(screen.getByText("Show raw output")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Show raw output"));
    expect(screen.getByText(/pytest output here/)).toBeInTheDocument();

    await user.click(screen.getByText("Hide raw output"));
    expect(screen.queryByText(/pytest output here/)).not.toBeInTheDocument();
  });

  it("shows Passed badge for passed suite", async () => {
    mockApi.get.mockImplementation((url: string) => {
      if (url === "/admin/tests/results") {
        return Promise.resolve({
          data: {
            suites: { backend: backendPassResult, app: null, admin: null },
          },
        });
      }
      if (url === "/admin/tests/history") return Promise.resolve(emptyHistory);
      return Promise.resolve({ data: {} });
    });

    render(<TestResultsPage />);

    await waitFor(() => {
      // "Passed" appears in both the status badge and the summary stat label
      const passedElements = screen.getAllByText("Passed");
      expect(passedElements.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("renders trend chart when history has 2+ points", async () => {
    const historyData = [
      {
        id: "r1",
        status: "pass",
        passed: 40,
        failed: 0,
        skipped: 2,
        total: 42,
        coverage: 90,
        duration: 7,
        created_at: "2026-03-01T10:00:00Z",
      },
      {
        id: "r2",
        status: "pass",
        passed: 42,
        failed: 0,
        skipped: 2,
        total: 44,
        coverage: 95,
        duration: 8,
        created_at: "2026-03-02T10:00:00Z",
      },
    ];

    mockApi.get.mockImplementation((url: string) => {
      if (url === "/admin/tests/results") {
        return Promise.resolve({
          data: {
            suites: { backend: backendPassResult, app: null, admin: null },
          },
        });
      }
      if (url === "/admin/tests/history") {
        return Promise.resolve({
          data: {
            history: { backend: historyData, app: [], admin: [] },
          },
        });
      }
      return Promise.resolve({ data: {} });
    });

    render(<TestResultsPage />);

    await waitFor(() => {
      expect(screen.getByText("Recent Trend")).toBeInTheDocument();
      // Use getAllByTestId — multiple suite cards may each render a trend chart
      const charts = screen.getAllByTestId("line-chart");
      expect(charts.length).toBeGreaterThanOrEqual(1);
    });
  });
});
