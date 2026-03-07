/**
 * Tests for hooks/useListQueries.ts
 * Tests query configuration, computed values (unchecked/checked), and suggestion filtering.
 */
import React from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ListItem, Suggestion, ShoppingList } from "../../lib/types";

const mockFetchListItems = jest.fn();
const mockFetchDeletedItems = jest.fn();
const mockFetchSuggestions = jest.fn();
const mockFetchRecipeSuggestions = jest.fn();
const mockFetchShoppingLists = jest.fn();

jest.mock("../../lib/api", () => ({
  fetchListItems: (...args: any[]) => mockFetchListItems(...args),
  fetchDeletedItems: (...args: any[]) => mockFetchDeletedItems(...args),
  fetchSuggestions: (...args: any[]) => mockFetchSuggestions(...args),
  fetchRecipeSuggestions: (...args: any[]) =>
    mockFetchRecipeSuggestions(...args),
  fetchShoppingLists: (...args: any[]) => mockFetchShoppingLists(...args),
}));

import { useListQueries } from "../../hooks/useListQueries";

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return { qc, Wrapper };
}

const baseArgs = {
  listId: "L1",
  aiEnabled: true,
  pairingEnabled: true,
  dismissedUntil: {} as Record<string, number>,
  userId: "u1",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchShoppingLists.mockResolvedValue({
    data: [{ id: "L1", name: "Groceries" }],
  });
  mockFetchListItems.mockResolvedValue({
    data: [
      {
        id: "1",
        name: "Milk",
        quantity: 1,
        unit: null,
        checked: 0,
        sort_order: 0,
        times_added: 1,
      },
      {
        id: "2",
        name: "Eggs",
        quantity: 12,
        unit: null,
        checked: 1,
        sort_order: 1,
        times_added: 2,
      },
    ],
  });
  mockFetchDeletedItems.mockResolvedValue({ data: [] });
  mockFetchSuggestions.mockResolvedValue({
    data: [
      { name: "Cheese", reason: "frequently bought" },
      { name: "Milk", reason: "already on list" }, // should be filtered
    ],
  });
  mockFetchRecipeSuggestions.mockResolvedValue({
    data: [{ name: "Butter", reason: "pairs with bread" }],
  });
});

describe("useListQueries", () => {
  it("separates items into unchecked and checked", async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useListQueries(baseArgs), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.items.length).toBe(2);
    });

    expect(result.current.unchecked).toEqual([
      expect.objectContaining({ id: "1", name: "Milk", checked: 0 }),
    ]);
    expect(result.current.checked).toEqual([
      expect.objectContaining({ id: "2", name: "Eggs", checked: 1 }),
    ]);
  });

  it("filters out suggestions that match unchecked items (case-insensitive)", async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useListQueries(baseArgs), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.suggestions.length).toBe(1);
    });

    expect(result.current.suggestions[0].name).toBe("Cheese");
  });

  it("filters out dismissed suggestions", async () => {
    const { Wrapper } = createWrapper();
    const args = {
      ...baseArgs,
      dismissedUntil: { Cheese: Date.now() + 999999 },
    };
    const { result } = renderHook(() => useListQueries(args), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.items.length).toBe(2);
    });

    // Cheese is dismissed, Milk is on list — no suggestions left
    expect(result.current.suggestions).toEqual([]);
  });

  it("disables suggestions when aiEnabled is false", async () => {
    const { Wrapper } = createWrapper();
    const args = { ...baseArgs, aiEnabled: false };
    const { result } = renderHook(() => useListQueries(args), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.items.length).toBe(2);
    });

    expect(result.current.suggestions).toEqual([]);
    expect(result.current.recipeSuggestions).toEqual([]);
  });

  it("combines AI and recipe suggestions in allSuggestions", async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useListQueries(baseArgs), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.allSuggestions.length).toBeGreaterThan(0);
    });

    const types = result.current.allSuggestions.map((s) => s._type);
    expect(types).toContain("ai");
    expect(types).toContain("recipe");
  });

  it("does not fetch items when listId is undefined", async () => {
    const { Wrapper } = createWrapper();
    const args = { ...baseArgs, listId: undefined };
    renderHook(() => useListQueries(args), { wrapper: Wrapper });

    // Wait a bit for any potential calls
    await new Promise((r) => setTimeout(r, 100));
    expect(mockFetchListItems).not.toHaveBeenCalled();
  });

  it("fetches shopping lists", async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useListQueries(baseArgs), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.shoppingLists.length).toBe(1);
    });

    expect(result.current.shoppingLists[0]).toEqual({
      id: "L1",
      name: "Groceries",
    });
  });
});
