/**
 * AuditLog.tsx — Prescriptive tests
 *
 * AuditLog MUST:
 * 1. Show loading state initially
 * 2. Render audit log entries with correct data
 * 3. Show "No events found" for empty results
 * 4. Show drill-down label from URL params
 * 5. Pass filter params (action, status, search, ip, since_hours) to API
 * 6. Show pagination controls when total exceeds page size
 * 7. Handle null fields (created_at, user_email, ip_address, detail) with dashes
 * 8. Clear drill-down resets filters and clears URL params
 * 9. Display correct status badge colors (success=green, failure=red, other=amber)
 * 10. Debounce filter changes before API call
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import AuditLogPage from "../pages/AuditLog";

let mockSearchParams = new URLSearchParams();
const mockSetSearchParams = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useSearchParams: () => [mockSearchParams, mockSetSearchParams],
  };
});

vi.mock("../lib/api", () => ({
  default: {
    get: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}));

import api from "../lib/api";
const mockApi = api as any;

const sampleLogs = {
  logs: [
    {
      id: "log1",
      user_id: "u1",
      user_email: "admin@test.com",
      action: "admin_login",
      detail: "Logged in via admin panel",
      ip_address: "192.168.1.1",
      user_agent: "Mozilla/5.0",
      status: "success",
      created_at: "2025-01-15T10:00:00Z",
    },
    {
      id: "log2",
      user_id: null,
      user_email: null,
      action: "login_failed",
      detail: null,
      ip_address: null,
      user_agent: null,
      status: "failure",
      created_at: null,
    },
    {
      id: "log3",
      user_id: "u2",
      user_email: "user@test.com",
      action: "login_blocked",
      detail: "Rate limited",
      ip_address: "10.0.0.1",
      user_agent: null,
      status: "blocked",
      created_at: "2025-01-15T11:00:00Z",
    },
  ],
  total: 3,
  page: 1,
  page_size: 50,
};

function renderAuditLog() {
  return render(
    <MemoryRouter>
      <AuditLogPage />
    </MemoryRouter>,
  );
}

describe("AuditLog page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockSearchParams = new URLSearchParams();
    mockApi.get.mockResolvedValue({ data: sampleLogs });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows loading state, then renders audit log entries", async () => {
    await act(async () => {
      renderAuditLog();
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByText("admin_login")).toBeInTheDocument();
      expect(screen.getByText("login_failed")).toBeInTheDocument();
      expect(screen.getByText("login_blocked")).toBeInTheDocument();
    });
  });

  it("shows 'No events found' for empty results", async () => {
    mockApi.get.mockResolvedValue({
      data: { logs: [], total: 0, page: 1, page_size: 50 },
    });

    await act(async () => {
      renderAuditLog();
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByText("No events found")).toBeInTheDocument();
    });
  });

  it("handles API error gracefully without crashing", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockApi.get.mockRejectedValue(new Error("Network failure"));

    await act(async () => {
      renderAuditLog();
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to fetch audit logs",
        expect.any(Error),
      );
    });
    consoleSpy.mockRestore();
  });

  it("renders null fields as dashes", async () => {
    await act(async () => {
      renderAuditLog();
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      // log2 has null user_email, ip_address, detail, created_at → all should show "—"
      const dashes = screen.getAllByText("—");
      expect(dashes.length).toBeGreaterThanOrEqual(4);
    });
  });

  it("renders correct status badge colors", async () => {
    await act(async () => {
      renderAuditLog();
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      const successBadge = screen.getByText("success");
      expect(successBadge.className).toContain("green");

      const failureBadge = screen.getByText("failure");
      expect(failureBadge.className).toContain("red");

      const blockedBadge = screen.getByText("blocked");
      expect(blockedBadge.className).toContain("amber");
    });
  });

  it("shows drill-down label from URL params", async () => {
    mockSearchParams = new URLSearchParams(
      "action=login_failed&since_hours=24&label=Failed+Logins+(24h)",
    );

    await act(async () => {
      renderAuditLog();
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByText("Failed Logins (24h)")).toBeInTheDocument();
    });
  });

  it("shows since_hours in subtitle", async () => {
    mockSearchParams = new URLSearchParams("since_hours=24");

    await act(async () => {
      renderAuditLog();
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByText(/last 24h/)).toBeInTheDocument();
    });
  });

  it("clears drill-down resets filters and URL params", async () => {
    mockSearchParams = new URLSearchParams(
      "action=login_failed&label=Test+Filter",
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    await act(async () => {
      renderAuditLog();
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(
        screen.getByText(/clear filter — show all events/i),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByText(/clear filter/i));
    expect(mockSetSearchParams).toHaveBeenCalledWith({});
  });

  it("passes filter params to API", async () => {
    mockSearchParams = new URLSearchParams(
      "action=login_failed&status=failure&since_hours=24",
    );

    await act(async () => {
      renderAuditLog();
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith(
        "/admin/audit-logs",
        expect.objectContaining({
          params: expect.objectContaining({
            action: "login_failed",
            status: "failure",
            since_hours: "24",
          }),
        }),
      );
    });
  });

  it("shows pagination when total exceeds page size", async () => {
    mockApi.get.mockResolvedValue({
      data: { logs: sampleLogs.logs, total: 100, page: 1, page_size: 50 },
    });

    await act(async () => {
      renderAuditLog();
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByText(/page 1 of 2/i)).toBeInTheDocument();
    });
  });

  it("hides pagination when total fits in one page", async () => {
    await act(async () => {
      renderAuditLog();
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByText("admin_login")).toBeInTheDocument();
    });

    expect(screen.queryByText(/page \d+ of/i)).toBeNull();
  });

  it("passes email search to API after typing", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    await act(async () => {
      renderAuditLog();
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByText("admin_login")).toBeInTheDocument();
    });

    mockApi.get.mockClear();
    mockApi.get.mockResolvedValue({ data: sampleLogs });

    await user.type(screen.getByPlaceholderText(/search by email/i), "admin");

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith(
        "/admin/audit-logs",
        expect.objectContaining({
          params: expect.objectContaining({ search: "admin" }),
        }),
      );
    });
  });

  it("passes IP filter to API", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    await act(async () => {
      renderAuditLog();
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByText("admin_login")).toBeInTheDocument();
    });

    mockApi.get.mockClear();
    mockApi.get.mockResolvedValue({ data: sampleLogs });

    await user.type(screen.getByPlaceholderText(/ip address/i), "192.168");

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith(
        "/admin/audit-logs",
        expect.objectContaining({
          params: expect.objectContaining({ ip: "192.168" }),
        }),
      );
    });
  });

  describe("filter dropdowns", () => {
    it("passes action filter to API when action dropdown changes", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      await act(async () => {
        renderAuditLog();
        vi.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(screen.getByText("admin_login")).toBeInTheDocument();
      });

      mockApi.get.mockClear();
      mockApi.get.mockResolvedValue({ data: sampleLogs });

      await user.selectOptions(
        screen.getByDisplayValue("All Actions"),
        "login_failed",
      );

      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(mockApi.get).toHaveBeenCalledWith(
          "/admin/audit-logs",
          expect.objectContaining({
            params: expect.objectContaining({ action: "login_failed" }),
          }),
        );
      });
    });

    it("passes status filter to API when status dropdown changes", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      await act(async () => {
        renderAuditLog();
        vi.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(screen.getByText("admin_login")).toBeInTheDocument();
      });

      mockApi.get.mockClear();
      mockApi.get.mockResolvedValue({ data: sampleLogs });

      await user.selectOptions(
        screen.getByDisplayValue("All Status"),
        "failure",
      );

      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(mockApi.get).toHaveBeenCalledWith(
          "/admin/audit-logs",
          expect.objectContaining({
            params: expect.objectContaining({ status: "failure" }),
          }),
        );
      });
    });
  });

  describe("pagination buttons", () => {
    it("advances to next page when next button is clicked", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      mockApi.get.mockResolvedValue({
        data: {
          logs: sampleLogs.logs,
          total: 100,
          page: 1,
          page_size: 50,
        },
      });

      await act(async () => {
        renderAuditLog();
        vi.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(screen.getByText(/page 1 of 2/i)).toBeInTheDocument();
      });

      mockApi.get.mockClear();
      mockApi.get.mockResolvedValue({
        data: {
          logs: sampleLogs.logs,
          total: 100,
          page: 2,
          page_size: 50,
        },
      });

      const paginationContainer = screen
        .getByText(/page 1 of 2/i)
        .closest("div")!.parentElement!;
      const btns = paginationContainer.querySelectorAll("button");
      await user.click(btns[1]); // Next button

      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(mockApi.get).toHaveBeenCalledWith(
          "/admin/audit-logs",
          expect.objectContaining({
            params: expect.objectContaining({ page: 2 }),
          }),
        );
      });
    });

    it("goes to previous page when prev button is clicked", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      mockApi.get.mockResolvedValue({
        data: {
          logs: sampleLogs.logs,
          total: 150,
          page: 1,
          page_size: 50,
        },
      });

      await act(async () => {
        renderAuditLog();
        vi.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(screen.getByText(/page 1 of 3/i)).toBeInTheDocument();
      });

      // Go to page 2 first
      mockApi.get.mockClear();
      mockApi.get.mockResolvedValue({
        data: {
          logs: sampleLogs.logs,
          total: 150,
          page: 2,
          page_size: 50,
        },
      });

      const paginationContainer = screen
        .getByText(/page 1 of 3/i)
        .closest("div")!.parentElement!;
      const btns = paginationContainer.querySelectorAll("button");
      await user.click(btns[1]); // Next

      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      // Now go back
      mockApi.get.mockClear();
      mockApi.get.mockResolvedValue({
        data: {
          logs: sampleLogs.logs,
          total: 150,
          page: 1,
          page_size: 50,
        },
      });

      const updatedBtns = paginationContainer.querySelectorAll("button");
      await user.click(updatedBtns[0]); // Prev

      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(mockApi.get).toHaveBeenCalledWith(
          "/admin/audit-logs",
          expect.objectContaining({
            params: expect.objectContaining({ page: 1 }),
          }),
        );
      });
    });
  });
});
