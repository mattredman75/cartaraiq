/**
 * Tests for hooks/useListMutations.ts
 */
import React from "react";
import { renderHook, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ShoppingList } from "../../lib/types";

const mockCreateShoppingList = jest.fn();
const mockDeleteShoppingList = jest.fn();
const mockRenameShoppingList = jest.fn();

jest.mock("../../lib/api", () => ({
  createShoppingList: (...args: any[]) => mockCreateShoppingList(...args),
  deleteShoppingList: (...args: any[]) => mockDeleteShoppingList(...args),
  renameShoppingList: (...args: any[]) => mockRenameShoppingList(...args),
}));

import { useListMutations } from "../../hooks/useListMutations";

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return { qc, Wrapper };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateShoppingList.mockResolvedValue({
    data: { id: "new", name: "New List" },
  });
  mockDeleteShoppingList.mockResolvedValue({});
  mockRenameShoppingList.mockResolvedValue({});
});

describe("useListMutations", () => {
  it("createListMutation calls createShoppingList and sets current list", async () => {
    const { qc, Wrapper } = createWrapper();
    const setCurrentList = jest.fn();
    const { result } = renderHook(
      () => useListMutations({ qc, setCurrentList, currentList: null }),
      { wrapper: Wrapper },
    );
    await act(async () => {
      await result.current.createListMutation.mutateAsync("Groceries");
    });
    expect(mockCreateShoppingList).toHaveBeenCalledWith("Groceries");
    expect(setCurrentList).toHaveBeenCalledWith({
      id: "new",
      name: "New List",
    });
  });

  it("deleteListMutation calls deleteShoppingList", async () => {
    const { qc, Wrapper } = createWrapper();
    const { result } = renderHook(
      () =>
        useListMutations({ qc, setCurrentList: jest.fn(), currentList: null }),
      { wrapper: Wrapper },
    );
    await act(async () => {
      await result.current.deleteListMutation.mutateAsync("L1");
    });
    expect(mockDeleteShoppingList).toHaveBeenCalledWith("L1");
  });

  it("renameListMutation updates cache optimistically", async () => {
    const { qc, Wrapper } = createWrapper();
    const currentList: ShoppingList = { id: "L1", name: "Old" };
    const setCurrentList = jest.fn();
    qc.setQueryData<ShoppingList[]>(
      ["shoppingLists"],
      [
        { id: "L1", name: "Old" },
        { id: "L2", name: "Other" },
      ],
    );
    const { result } = renderHook(
      () => useListMutations({ qc, setCurrentList, currentList }),
      { wrapper: Wrapper },
    );
    await act(async () => {
      result.current.renameListMutation.mutate({ id: "L1", name: "Renamed" });
    });
    // Optimistic cache update
    const lists = qc.getQueryData<ShoppingList[]>(["shoppingLists"]);
    expect(lists?.find((l) => l.id === "L1")?.name).toBe("Renamed");
    // Current list updated
    expect(setCurrentList).toHaveBeenCalledWith({ id: "L1", name: "Renamed" });
    expect(mockRenameShoppingList).toHaveBeenCalledWith("L1", "Renamed");
  });

  it("renameListMutation does not update currentList if different id", async () => {
    const { qc, Wrapper } = createWrapper();
    const currentList: ShoppingList = { id: "L2", name: "Other" };
    const setCurrentList = jest.fn();
    qc.setQueryData<ShoppingList[]>(
      ["shoppingLists"],
      [{ id: "L1", name: "Old" }],
    );
    const { result } = renderHook(
      () => useListMutations({ qc, setCurrentList, currentList }),
      { wrapper: Wrapper },
    );
    await act(async () => {
      result.current.renameListMutation.mutate({ id: "L1", name: "New" });
    });
    expect(setCurrentList).not.toHaveBeenCalled();
  });

  it("renameListMutation handles empty cache gracefully (old=[] default)", async () => {
    const { qc, Wrapper } = createWrapper();
    const setCurrentList = jest.fn();
    const currentList: ShoppingList = { id: "L1", name: "Old" };
    // Do NOT setQueryData — cache is undefined, so old=[] kicks in
    const { result } = renderHook(
      () => useListMutations({ qc, setCurrentList, currentList }),
      { wrapper: Wrapper },
    );
    await act(async () => {
      result.current.renameListMutation.mutate({ id: "L1", name: "New" });
    });
    const lists = qc.getQueryData<ShoppingList[]>(["shoppingLists"]);
    expect(lists).toEqual([]);
    expect(setCurrentList).toHaveBeenCalledWith({ id: "L1", name: "New" });
  });
});
