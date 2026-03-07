/**
 * Tests for hooks/useDismissedSuggestions.ts
 */
import { renderHook, act, waitFor } from "@testing-library/react-native";

const mockGetItem = jest.fn();
const mockSetItem = jest.fn();
jest.mock("../../lib/storage", () => ({
  getItem: (...args: any[]) => mockGetItem(...args),
  setItem: (...args: any[]) => mockSetItem(...args),
}));

import { useDismissedSuggestions } from "../../hooks/useDismissedSuggestions";

beforeEach(() => {
  jest.clearAllMocks();
  mockGetItem.mockResolvedValue(null);
  mockSetItem.mockResolvedValue(undefined);
});

describe("useDismissedSuggestions", () => {
  it("loads and prunes expired dismissals on mount", async () => {
    const now = Date.now();
    const stored = {
      Milk: now + 999999, // not expired
      Eggs: now - 1, // expired
    };
    mockGetItem.mockResolvedValue(JSON.stringify(stored));

    const { result } = renderHook(() => useDismissedSuggestions("user1"));

    await waitFor(() => {
      expect(result.current.dismissedUntil).toHaveProperty("Milk");
      expect(result.current.dismissedUntil).not.toHaveProperty("Eggs");
    });

    // Pruned version saved back
    expect(mockSetItem).toHaveBeenCalledWith(
      "dismissed_user1",
      expect.not.stringContaining("Eggs"),
    );
  });

  it("starts with empty when no stored data", async () => {
    const { result } = renderHook(() => useDismissedSuggestions("user1"));
    await waitFor(() => {
      expect(mockGetItem).toHaveBeenCalledWith("dismissed_user1");
    });
    expect(result.current.dismissedUntil).toEqual({});
  });

  it("dismissSuggestion adds 7-day expiry and persists", async () => {
    const { result } = renderHook(() => useDismissedSuggestions("user1"));

    const before = Date.now();
    await act(async () => {
      await result.current.dismissSuggestion("Cheese");
    });
    const after = Date.now();

    // Verify the data was persisted to storage with correct expiry
    expect(mockSetItem).toHaveBeenCalledWith(
      "dismissed_user1",
      expect.any(String),
    );

    const savedJson = mockSetItem.mock.calls.find(
      (c: any[]) => c[0] === "dismissed_user1",
    )?.[1];
    const saved = JSON.parse(savedJson);
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    expect(saved.Cheese).toBeGreaterThanOrEqual(before + sevenDays);
    expect(saved.Cheese).toBeLessThanOrEqual(after + sevenDays);
  });

  it("does not load when userId is undefined", async () => {
    renderHook(() => useDismissedSuggestions(undefined));
    // Give time for any async effect
    await new Promise((r) => setTimeout(r, 50));
    expect(mockGetItem).not.toHaveBeenCalled();
  });

  it("handles malformed stored data gracefully", async () => {
    mockGetItem.mockResolvedValue("not-json!!!{");
    const { result } = renderHook(() => useDismissedSuggestions("user1"));
    await waitFor(() => {
      expect(result.current.dismissedUntil).toEqual({});
    });
  });

  it("dismissSuggestion skips saveDismissed when userId is undefined", async () => {
    const { result } = renderHook(() => useDismissedSuggestions(undefined));
    await act(async () => {
      await result.current.dismissSuggestion("Cheese");
    });
    // setItem should NOT be called since userId is falsy
    expect(mockSetItem).not.toHaveBeenCalled();
    // But the local state should still be updated
    expect(result.current.dismissedUntil).toHaveProperty("Cheese");
  });
});
