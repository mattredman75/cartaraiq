/**
 * Users.tsx — Prescriptive tests
 *
 * Users page MUST:
 * 1. Show loading state initially
 * 2. Render user table with correct data
 * 3. Show "No users found" for empty results
 * 4. Debounce search input before fetching
 * 5. Pass filter/sort params to API correctly
 * 6. Navigate to /users/:id when row is clicked
 * 7. Paginate correctly
 * 8. Toggle sort direction correctly
 * 9. Show drill-down banner from URL params
 * 10. Format relative time correctly for various durations
 * 11. Show "email" as provider when auth_provider is null
 * 12. Show correct active/inactive badge styling
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import UsersPage from "../pages/Users";

const mockNavigate = vi.fn();
let mockSearchParams = new URLSearchParams();
const mockSetSearchParams = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
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

const sampleUsers = {
  users: [
    {
      id: "u1",
      email: "admin@test.com",
      name: "Admin User",
      role: "admin",
      auth_provider: null,
      is_active: true,
      created_at: "2025-01-01T00:00:00Z",
      last_activity: null,
      list_count: 5,
      item_count: 20,
    },
    {
      id: "u2",
      email: "user@test.com",
      name: "Regular User",
      role: "user",
      auth_provider: "google",
      is_active: false,
      created_at: "2025-06-01T00:00:00Z",
      last_activity: "2025-06-15T10:00:00Z",
      list_count: 3,
      item_count: 12,
    },
  ],
  total: 2,
  page: 1,
  page_size: 25,
};

function renderUsers(initialPath = "/users") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <UsersPage />
    </MemoryRouter>,
  );
}

describe("Users page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockSearchParams = new URLSearchParams();
    mockApi.get.mockResolvedValue({ data: sampleUsers });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows loading state initially, then renders user data", async () => {
    await act(async () => {
      renderUsers();
      // Advance debounce timer
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByText("Admin User")).toBeInTheDocument();
      expect(screen.getByText("Regular User")).toBeInTheDocument();
    });
  });

  it("shows 'No users found' for empty results", async () => {
    mockApi.get.mockResolvedValue({
      data: { users: [], total: 0, page: 1, page_size: 25 },
    });

    await act(async () => {
      renderUsers();
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByText("No users found")).toBeInTheDocument();
    });
  });

  it("shows 'email' as provider when auth_provider is null", async () => {
    await act(async () => {
      renderUsers();
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      // Admin User has auth_provider: null → should show "email"
      expect(screen.getByText("email")).toBeInTheDocument();
      // Regular User has auth_provider: "google" → should show "google"
      expect(screen.getByText("google")).toBeInTheDocument();
    });
  });

  it("shows correct active/inactive badges", async () => {
    await act(async () => {
      renderUsers();
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByText("Active")).toBeInTheDocument();
      expect(screen.getByText("Inactive")).toBeInTheDocument();
    });
  });

  it("handles API error gracefully without crashing", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockApi.get.mockRejectedValue(new Error("Network failure"));

    await act(async () => {
      renderUsers();
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to fetch users",
        expect.any(Error),
      );
    });
    consoleSpy.mockRestore();
  });

  it("navigates to /users/:id when row is clicked", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    await act(async () => {
      renderUsers();
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByText("Admin User")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Admin User"));
    expect(mockNavigate).toHaveBeenCalledWith("/users/u1");
  });

  it("passes search query to API after debounce", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    await act(async () => {
      renderUsers();
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByText("Admin User")).toBeInTheDocument();
    });

    mockApi.get.mockClear();
    mockApi.get.mockResolvedValue({ data: sampleUsers });

    await user.type(screen.getByPlaceholderText(/search/i), "test");

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith(
        "/admin/users",
        expect.objectContaining({
          params: expect.objectContaining({ search: "test" }),
        }),
      );
    });
  });

  it("passes sort params to API when column header is clicked", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    await act(async () => {
      renderUsers();
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByText("Admin User")).toBeInTheDocument();
    });

    mockApi.get.mockClear();
    mockApi.get.mockResolvedValue({ data: sampleUsers });

    // Click on Email column header (use getAllByText to avoid matching filter dropdown)
    const emailElements = screen.getAllByText("Email");
    // Column header is the <th> element, not the <option>
    const emailHeader = emailElements.find((el) => el.closest("th") !== null)!;
    await user.click(emailHeader);

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith(
        "/admin/users",
        expect.objectContaining({
          params: expect.objectContaining({
            sort_by: "email",
            sort_dir: "asc",
          }),
        }),
      );
    });
  });

  it("toggles sort direction when same column clicked twice", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    await act(async () => {
      renderUsers();
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByText("Admin User")).toBeInTheDocument();
    });

    // Default sort is created_at desc. Clicking created_at should toggle to asc.
    mockApi.get.mockClear();
    mockApi.get.mockResolvedValue({ data: sampleUsers });

    await user.click(screen.getByText("Joined"));

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith(
        "/admin/users",
        expect.objectContaining({
          params: expect.objectContaining({
            sort_by: "created_at",
            sort_dir: "asc",
          }),
        }),
      );
    });
  });

  it("shows drill-down banner when URL has filter params", async () => {
    mockSearchParams = new URLSearchParams(
      "is_active=false&label=Deactivated+Users",
    );

    await act(async () => {
      renderUsers();
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByText(/filtered/i)).toBeInTheDocument();
      expect(screen.getByText(/deactivated users/i)).toBeInTheDocument();
    });
  });

  it("clears drill-down when clear button is clicked", async () => {
    mockSearchParams = new URLSearchParams("is_active=false&label=Test");
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    await act(async () => {
      renderUsers();
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByText(/clear filter/i)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/clear filter/i));
    expect(mockSetSearchParams).toHaveBeenCalledWith({});
  });

  it("shows pagination when total exceeds page size", async () => {
    mockApi.get.mockResolvedValue({
      data: { users: sampleUsers.users, total: 50, page: 1, page_size: 25 },
    });

    await act(async () => {
      renderUsers();
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByText(/page 1 of 2/i)).toBeInTheDocument();
    });
  });

  it("handles null created_at by showing dash", async () => {
    mockApi.get.mockResolvedValue({
      data: {
        users: [{ ...sampleUsers.users[0], created_at: null }],
        total: 1,
        page: 1,
        page_size: 25,
      },
    });

    await act(async () => {
      renderUsers();
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      // Should show "—" for null created_at
      const dashes = screen.getAllByText("—");
      expect(dashes.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("formatRelative", () => {
    it("shows 'Just now' for activity less than 1 minute ago", async () => {
      const now = new Date();
      mockApi.get.mockResolvedValue({
        data: {
          users: [
            {
              ...sampleUsers.users[0],
              last_activity: new Date(now.getTime() - 10_000).toISOString(), // 10 seconds ago
            },
          ],
          total: 1,
          page: 1,
          page_size: 25,
        },
      });

      await act(async () => {
        renderUsers();
        vi.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(screen.getByText("Just now")).toBeInTheDocument();
      });
    });

    it("shows 'Xm ago' for activity less than 60 minutes ago", async () => {
      const now = new Date();
      mockApi.get.mockResolvedValue({
        data: {
          users: [
            {
              ...sampleUsers.users[0],
              last_activity: new Date(
                now.getTime() - 15 * 60_000,
              ).toISOString(), // 15 min ago
            },
          ],
          total: 1,
          page: 1,
          page_size: 25,
        },
      });

      await act(async () => {
        renderUsers();
        vi.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(screen.getByText("15m ago")).toBeInTheDocument();
      });
    });

    it("shows 'Xh ago' for activity less than 24 hours ago", async () => {
      const now = new Date();
      mockApi.get.mockResolvedValue({
        data: {
          users: [
            {
              ...sampleUsers.users[0],
              last_activity: new Date(
                now.getTime() - 5 * 3600_000,
              ).toISOString(), // 5 hours ago
            },
          ],
          total: 1,
          page: 1,
          page_size: 25,
        },
      });

      await act(async () => {
        renderUsers();
        vi.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(screen.getByText("5h ago")).toBeInTheDocument();
      });
    });

    it("shows 'Xd ago' for activity less than 7 days ago", async () => {
      const now = new Date();
      mockApi.get.mockResolvedValue({
        data: {
          users: [
            {
              ...sampleUsers.users[0],
              last_activity: new Date(
                now.getTime() - 3 * 86400_000,
              ).toISOString(), // 3 days ago
            },
          ],
          total: 1,
          page: 1,
          page_size: 25,
        },
      });

      await act(async () => {
        renderUsers();
        vi.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(screen.getByText("3d ago")).toBeInTheDocument();
      });
    });

    it("shows locale date for activity older than 7 days", async () => {
      mockApi.get.mockResolvedValue({
        data: {
          users: [
            {
              ...sampleUsers.users[0],
              last_activity: "2024-01-01T00:00:00Z", // Very old
            },
          ],
          total: 1,
          page: 1,
          page_size: 25,
        },
      });

      await act(async () => {
        renderUsers();
        vi.advanceTimersByTime(300);
      });

      await waitFor(() => {
        // Should show toLocaleDateString output — depends on locale but must not show "—"
        const dateStr = new Date("2024-01-01T00:00:00Z").toLocaleDateString();
        expect(screen.getByText(dateStr)).toBeInTheDocument();
      });
    });
  });

  describe("filter dropdowns", () => {
    it("passes is_active filter to API when status dropdown changes", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      await act(async () => {
        renderUsers();
        vi.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(screen.getByText("Admin User")).toBeInTheDocument();
      });

      mockApi.get.mockClear();
      mockApi.get.mockResolvedValue({ data: sampleUsers });

      await user.selectOptions(screen.getByDisplayValue("All Status"), "true");

      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(mockApi.get).toHaveBeenCalledWith(
          "/admin/users",
          expect.objectContaining({
            params: expect.objectContaining({ is_active: true }),
          }),
        );
      });
    });

    it("passes auth_provider filter to API when provider dropdown changes", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      await act(async () => {
        renderUsers();
        vi.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(screen.getByText("Admin User")).toBeInTheDocument();
      });

      mockApi.get.mockClear();
      mockApi.get.mockResolvedValue({ data: sampleUsers });

      await user.selectOptions(
        screen.getByDisplayValue("All Providers"),
        "google",
      );

      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(mockApi.get).toHaveBeenCalledWith(
          "/admin/users",
          expect.objectContaining({
            params: expect.objectContaining({ auth_provider: "google" }),
          }),
        );
      });
    });

    it("passes role filter to API when role dropdown changes", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      await act(async () => {
        renderUsers();
        vi.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(screen.getByText("Admin User")).toBeInTheDocument();
      });

      mockApi.get.mockClear();
      mockApi.get.mockResolvedValue({ data: sampleUsers });

      await user.selectOptions(screen.getByDisplayValue("All Roles"), "admin");

      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(mockApi.get).toHaveBeenCalledWith(
          "/admin/users",
          expect.objectContaining({
            params: expect.objectContaining({ role: "admin" }),
          }),
        );
      });
    });
  });

  describe("pagination buttons", () => {
    it("advances to next page when next button is clicked", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      mockApi.get.mockResolvedValue({
        data: { users: sampleUsers.users, total: 50, page: 1, page_size: 25 },
      });

      await act(async () => {
        renderUsers();
        vi.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(screen.getByText(/page 1 of 2/i)).toBeInTheDocument();
      });

      mockApi.get.mockClear();
      mockApi.get.mockResolvedValue({
        data: { users: sampleUsers.users, total: 50, page: 2, page_size: 25 },
      });

      // Click the "next" button (ChevronRight)
      const buttons = screen.getAllByRole("button");
      // The next button is the second pagination button
      const paginationBtns = buttons.filter(
        (b) =>
          b.closest(".flex.items-center.justify-between.px-4.py-3.border-t") !==
          null,
      );
      await user.click(paginationBtns[1]); // Next button

      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(mockApi.get).toHaveBeenCalledWith(
          "/admin/users",
          expect.objectContaining({
            params: expect.objectContaining({ page: 2 }),
          }),
        );
      });
    });

    it("goes to previous page when prev button is clicked", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      // Start on page 2
      mockApi.get.mockResolvedValue({
        data: { users: sampleUsers.users, total: 75, page: 1, page_size: 25 },
      });

      await act(async () => {
        renderUsers();
        vi.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(screen.getByText(/page 1 of 3/i)).toBeInTheDocument();
      });

      // Go to page 2 first
      mockApi.get.mockClear();
      mockApi.get.mockResolvedValue({
        data: { users: sampleUsers.users, total: 75, page: 2, page_size: 25 },
      });

      const paginationContainer = screen
        .getByText(/page 1 of 3/i)
        .closest("div")!.parentElement!;
      const btns = paginationContainer.querySelectorAll("button");
      await user.click(btns[1]); // Next

      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      // Now go back to page 1
      mockApi.get.mockClear();
      mockApi.get.mockResolvedValue({
        data: { users: sampleUsers.users, total: 75, page: 1, page_size: 25 },
      });

      const updatedBtns = paginationContainer.querySelectorAll("button");
      await user.click(updatedBtns[0]); // Prev

      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(mockApi.get).toHaveBeenCalledWith(
          "/admin/users",
          expect.objectContaining({
            params: expect.objectContaining({ page: 1 }),
          }),
        );
      });
    });
  });

  describe("drill-down URL params", () => {
    it("passes active_minutes from URL to API", async () => {
      mockSearchParams = new URLSearchParams(
        "active_minutes=15&label=Logins+(15m)",
      );

      await act(async () => {
        renderUsers();
        vi.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(mockApi.get).toHaveBeenCalledWith(
          "/admin/users",
          expect.objectContaining({
            params: expect.objectContaining({ active_minutes: "15" }),
          }),
        );
      });
    });

    it("passes registered_after from URL to API", async () => {
      mockSearchParams = new URLSearchParams(
        "registered_after=2025-01-01&label=New+Today",
      );

      await act(async () => {
        renderUsers();
        vi.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(mockApi.get).toHaveBeenCalledWith(
          "/admin/users",
          expect.objectContaining({
            params: expect.objectContaining({
              registered_after: "2025-01-01",
            }),
          }),
        );
      });
    });

    it("passes is_active from URL to API (drill-down takes precedence)", async () => {
      mockSearchParams = new URLSearchParams(
        "is_active=false&label=Deactivated",
      );

      await act(async () => {
        renderUsers();
        vi.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(mockApi.get).toHaveBeenCalledWith(
          "/admin/users",
          expect.objectContaining({
            params: expect.objectContaining({ is_active: "false" }),
          }),
        );
      });
    });

    it("shows 'Dashboard drill-down' when no label in URL", async () => {
      mockSearchParams = new URLSearchParams("active_minutes=15");

      await act(async () => {
        renderUsers();
        vi.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(screen.getByText(/dashboard drill-down/i)).toBeInTheDocument();
      });
    });

    it("navigates back to dashboard when back arrow is clicked", async () => {
      mockSearchParams = new URLSearchParams("is_active=false&label=Test");
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      await act(async () => {
        renderUsers();
        vi.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(screen.getByText(/filtered/i)).toBeInTheDocument();
      });

      // Click the ArrowLeft button (first button in drill-down banner)
      const drillBanner = screen.getByText(/filtered/i).closest("div")!;
      const backBtn = drillBanner.querySelector("button")!;
      await user.click(backBtn);

      expect(mockNavigate).toHaveBeenCalledWith("/");
    });
  });

  describe("sort behavior", () => {
    it("defaults name column to ascending sort", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      await act(async () => {
        renderUsers();
        vi.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(screen.getByText("Admin User")).toBeInTheDocument();
      });

      mockApi.get.mockClear();
      mockApi.get.mockResolvedValue({ data: sampleUsers });

      // Click Name column — not the current sort, so should use "asc" for name
      await user.click(screen.getByText("Name"));

      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(mockApi.get).toHaveBeenCalledWith(
          "/admin/users",
          expect.objectContaining({
            params: expect.objectContaining({
              sort_by: "name",
              sort_dir: "asc",
            }),
          }),
        );
      });
    });

    it("defaults numeric/date columns to descending sort", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      await act(async () => {
        renderUsers();
        vi.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(screen.getByText("Admin User")).toBeInTheDocument();
      });

      mockApi.get.mockClear();
      mockApi.get.mockResolvedValue({ data: sampleUsers });

      // Click Lists column — should default to desc
      await user.click(screen.getByText("Lists"));

      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(mockApi.get).toHaveBeenCalledWith(
          "/admin/users",
          expect.objectContaining({
            params: expect.objectContaining({
              sort_by: "list_count",
              sort_dir: "desc",
            }),
          }),
        );
      });
    });
  });
});
