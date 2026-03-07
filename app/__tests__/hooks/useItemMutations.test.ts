/**
 * Tests for hooks/useItemMutations.ts
 * Tests mutation configs (mutationFn args, optimistic updates, invalidations).
 */
import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ListItem } from "../../lib/types";

const mockAddListItem = jest.fn().mockResolvedValue({ data: {} });
const mockParseAndAddItems = jest.fn().mockResolvedValue({ data: {} });
const mockUpdateListItem = jest.fn().mockResolvedValue({ data: {} });

jest.mock("../../lib/api", () => ({
  addListItem: (...args: any[]) => mockAddListItem(...args),
  parseAndAddItems: (...args: any[]) => mockParseAndAddItems(...args),
  updateListItem: (...args: any[]) => mockUpdateListItem(...args),
}));

import { useItemMutations } from "../../hooks/useItemMutations";

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return { qc, Wrapper };
}

beforeEach(() => jest.clearAllMocks());

describe("useItemMutations", () => {
  it("addMutation calls addListItem with trimmed text", async () => {
    const { qc, Wrapper } = createWrapper();
    const { result } = renderHook(
      () => useItemMutations({ listId: "L1", qc }),
      { wrapper: Wrapper },
    );
    await act(async () => {
      await result.current.addMutation.mutateAsync({ text: "  Milk  " });
    });
    expect(mockAddListItem).toHaveBeenCalledWith("Milk", 1, "L1");
  });

  it("toggleMutation passes sort_order:0 when unchecking", async () => {
    const { qc, Wrapper } = createWrapper();
    qc.setQueryData<ListItem[]>(
      ["listItems", "L1"],
      [
        {
          id: "i1",
          name: "Milk",
          quantity: 1,
          unit: null,
          checked: 1,
          sort_order: 5,
          times_added: 1,
        },
      ],
    );
    const { result } = renderHook(
      () => useItemMutations({ listId: "L1", qc }),
      { wrapper: Wrapper },
    );
    await act(async () => {
      result.current.toggleMutation.mutate({ id: "i1", checked: 0 });
    });
    expect(mockUpdateListItem).toHaveBeenCalledWith("i1", {
      checked: 0,
      sort_order: 0,
    });
  });

  it("toggleMutation only passes checked when checking", async () => {
    const { qc, Wrapper } = createWrapper();
    qc.setQueryData<ListItem[]>(
      ["listItems", "L1"],
      [
        {
          id: "i1",
          name: "Milk",
          quantity: 1,
          unit: null,
          checked: 0,
          sort_order: 0,
          times_added: 1,
        },
      ],
    );
    const { result } = renderHook(
      () => useItemMutations({ listId: "L1", qc }),
      { wrapper: Wrapper },
    );
    await act(async () => {
      result.current.toggleMutation.mutate({ id: "i1", checked: 1 });
    });
    expect(mockUpdateListItem).toHaveBeenCalledWith("i1", { checked: 1 });
  });

  it("toggleMutation unchecked item moves to front (optimistic)", async () => {
    const { qc, Wrapper } = createWrapper();
    qc.setQueryData<ListItem[]>(
      ["listItems", "L1"],
      [
        {
          id: "i1",
          name: "Eggs",
          quantity: 1,
          unit: null,
          checked: 0,
          sort_order: 0,
          times_added: 1,
        },
        {
          id: "i2",
          name: "Milk",
          quantity: 1,
          unit: null,
          checked: 1,
          sort_order: 1,
          times_added: 1,
        },
      ],
    );
    const { result } = renderHook(
      () => useItemMutations({ listId: "L1", qc }),
      { wrapper: Wrapper },
    );
    await act(async () => {
      result.current.toggleMutation.mutate({ id: "i2", checked: 0 });
    });
    const items = qc.getQueryData<ListItem[]>(["listItems", "L1"]);
    expect(items?.[0]?.id).toBe("i2"); // Milk moved to front
  });

  it("deleteMutation soft-deletes (checked=2) and removes from cache", async () => {
    const { qc, Wrapper } = createWrapper();
    qc.setQueryData<ListItem[]>(
      ["listItems", "L1"],
      [
        {
          id: "i1",
          name: "Milk",
          quantity: 1,
          unit: null,
          checked: 0,
          sort_order: 0,
          times_added: 1,
        },
      ],
    );
    const { result } = renderHook(
      () => useItemMutations({ listId: "L1", qc }),
      { wrapper: Wrapper },
    );
    await act(async () => {
      result.current.deleteMutation.mutate("i1");
    });
    expect(mockUpdateListItem).toHaveBeenCalledWith("i1", { checked: 2 });
    const items = qc.getQueryData<ListItem[]>(["listItems", "L1"]);
    expect(items).toEqual([]);
  });

  it("renameMutation updates name optimistically", async () => {
    const { qc, Wrapper } = createWrapper();
    qc.setQueryData<ListItem[]>(
      ["listItems", "L1"],
      [
        {
          id: "i1",
          name: "Milk",
          quantity: 1,
          unit: null,
          checked: 0,
          sort_order: 0,
          times_added: 1,
        },
      ],
    );
    const { result } = renderHook(
      () => useItemMutations({ listId: "L1", qc }),
      { wrapper: Wrapper },
    );
    await act(async () => {
      result.current.renameMutation.mutate({ id: "i1", name: "Almond Milk" });
    });
    expect(mockUpdateListItem).toHaveBeenCalledWith("i1", {
      name: "Almond Milk",
    });
    const items = qc.getQueryData<ListItem[]>(["listItems", "L1"]);
    expect(items?.[0]?.name).toBe("Almond Milk");
  });

  // ── Empty cache (old=[]) fallback branches ─────────────────────
  it("toggleMutation handles empty cache gracefully (old=[] default)", async () => {
    const { qc, Wrapper } = createWrapper();
    // Do NOT setQueryData — cache is undefined, so old=[] kicks in
    const { result } = renderHook(
      () => useItemMutations({ listId: "L1", qc }),
      { wrapper: Wrapper },
    );
    await act(async () => {
      result.current.toggleMutation.mutate({ id: "i1", checked: 1 });
    });
    expect(mockUpdateListItem).toHaveBeenCalledWith("i1", { checked: 1 });
    const items = qc.getQueryData<ListItem[]>(["listItems", "L1"]);
    expect(items).toEqual([]);
  });

  it("deleteMutation handles empty cache gracefully (old=[] default)", async () => {
    const { qc, Wrapper } = createWrapper();
    const { result } = renderHook(
      () => useItemMutations({ listId: "L1", qc }),
      { wrapper: Wrapper },
    );
    await act(async () => {
      result.current.deleteMutation.mutate("i1");
    });
    expect(mockUpdateListItem).toHaveBeenCalledWith("i1", { checked: 2 });
    const items = qc.getQueryData<ListItem[]>(["listItems", "L1"]);
    expect(items).toEqual([]);
  });

  it("renameMutation handles empty cache gracefully (old=[] default)", async () => {
    const { qc, Wrapper } = createWrapper();
    const { result } = renderHook(
      () => useItemMutations({ listId: "L1", qc }),
      { wrapper: Wrapper },
    );
    await act(async () => {
      result.current.renameMutation.mutate({ id: "i1", name: "New" });
    });
    expect(mockUpdateListItem).toHaveBeenCalledWith("i1", { name: "New" });
    const items = qc.getQueryData<ListItem[]>(["listItems", "L1"]);
    expect(items).toEqual([]);
  });

  it("toggleMutation unchecking with empty cache uses old=[] default", async () => {
    const { qc, Wrapper } = createWrapper();
    const { result } = renderHook(
      () => useItemMutations({ listId: "L1", qc }),
      { wrapper: Wrapper },
    );
    await act(async () => {
      result.current.toggleMutation.mutate({ id: "i1", checked: 0 });
    });
    expect(mockUpdateListItem).toHaveBeenCalledWith("i1", {
      checked: 0,
      sort_order: 0,
    });
  });
});
