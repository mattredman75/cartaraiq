/**
 * Tests for hooks/useWidgetSync.ts
 * Pure async functions — no React hooks involved.
 */
import { Platform, NativeModules } from "react-native";

// Mock dependencies
jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
  NativeModules: {
    SharedDataModule: {
      syncToWidget: jest.fn().mockResolvedValue(undefined),
      syncAllListsToWidget: jest.fn().mockResolvedValue(undefined),
      syncMaintenanceToWidget: jest.fn().mockResolvedValue(undefined),
    },
  },
}));

import {
  syncListToWidget,
  syncAllListsToWidget,
  syncMaintenanceToWidget,
} from "../../hooks/useWidgetSync";
import type { ListItem, ShoppingList } from "../../lib/types";

const { SharedDataModule } = NativeModules;

beforeEach(() => jest.clearAllMocks());

// ── syncListToWidget ────────────────────────────────────────────────────────
describe("syncListToWidget", () => {
  const items: ListItem[] = [
    {
      id: "1",
      name: "Milk",
      quantity: 2,
      unit: "L",
      checked: 0,
      sort_order: 0,
      times_added: 1,
    },
    {
      id: "2",
      name: "Deleted",
      quantity: 1,
      unit: null,
      checked: 2,
      sort_order: 1,
      times_added: 1,
    },
    {
      id: "3",
      name: "Eggs",
      quantity: 12,
      unit: "pcs",
      checked: 1,
      sort_order: 2,
      times_added: 3,
    },
  ];
  const list: ShoppingList = { id: "L1", name: "Groceries" };

  it("syncs formatted items to widget on iOS", async () => {
    await syncListToWidget(list, items);
    expect(SharedDataModule.syncToWidget).toHaveBeenCalledWith("Groceries", [
      { id: "1", name: "Milk", quantity: 2, unit: "L", checked: 0 },
      // id:"2" excluded because checked === 2 (soft-deleted)
      { id: "3", name: "Eggs", quantity: 12, unit: "pcs", checked: 1 },
    ]);
  });

  it("uses 'My List' when list is null", async () => {
    await syncListToWidget(null, items);
    expect(SharedDataModule.syncToWidget).toHaveBeenCalledWith(
      "My List",
      expect.any(Array),
    );
  });

  it("no-ops on Android", async () => {
    (Platform as any).OS = "android";
    await syncListToWidget(list, items);
    expect(SharedDataModule.syncToWidget).not.toHaveBeenCalled();
    (Platform as any).OS = "ios"; // restore
  });

  it("handles native module errors gracefully", async () => {
    SharedDataModule.syncToWidget.mockRejectedValueOnce(new Error("fail"));
    await expect(syncListToWidget(list, items)).resolves.toBeUndefined();
  });

  it("defaults quantity to 1 and unit to null for missing values", async () => {
    const sparse: ListItem[] = [
      {
        id: "x",
        name: "Apple",
        quantity: undefined as any,
        unit: undefined as any,
        checked: 0,
        sort_order: 0,
        times_added: 0,
      },
    ];
    await syncListToWidget(list, sparse);
    expect(SharedDataModule.syncToWidget).toHaveBeenCalledWith("Groceries", [
      { id: "x", name: "Apple", quantity: 1, unit: null, checked: 0 },
    ]);
  });
});

// ── syncAllListsToWidget ────────────────────────────────────────────────────
describe("syncAllListsToWidget", () => {
  const lists: ShoppingList[] = [
    { id: "L1", name: "Groceries" },
    { id: "L2", name: "Hardware" },
  ];
  const currentList: ShoppingList = { id: "L1", name: "Groceries" };
  const items: ListItem[] = [
    {
      id: "1",
      name: "Milk",
      quantity: 1,
      unit: null,
      checked: 0,
      sort_order: 0,
      times_added: 1,
    },
  ];

  it("sends items only for the current list", async () => {
    await syncAllListsToWidget(lists, currentList, items);
    const payload = SharedDataModule.syncAllListsToWidget.mock.calls[0][0];
    expect(payload).toEqual([
      {
        id: "L1",
        name: "Groceries",
        items: [{ id: "1", name: "Milk", quantity: 1, unit: null, checked: 0 }],
      },
      { id: "L2", name: "Hardware", items: [] },
    ]);
  });

  it("no-ops on Android", async () => {
    (Platform as any).OS = "android";
    await syncAllListsToWidget(lists, currentList, items);
    expect(SharedDataModule.syncAllListsToWidget).not.toHaveBeenCalled();
    (Platform as any).OS = "ios";
  });
});

// ── syncMaintenanceToWidget ─────────────────────────────────────────────────
describe("syncMaintenanceToWidget", () => {
  it("passes maintenance flag and message", async () => {
    await syncMaintenanceToWidget(true, "Server is down");
    expect(SharedDataModule.syncMaintenanceToWidget).toHaveBeenCalledWith(
      true,
      "Server is down",
    );
  });

  it("no-ops on Android", async () => {
    (Platform as any).OS = "android";
    await syncMaintenanceToWidget(true, "down");
    expect(SharedDataModule.syncMaintenanceToWidget).not.toHaveBeenCalled();
    (Platform as any).OS = "ios";
  });

  it("handles errors gracefully", async () => {
    SharedDataModule.syncMaintenanceToWidget.mockRejectedValueOnce(
      new Error("fail"),
    );
    await expect(syncMaintenanceToWidget(true, "err")).resolves.toBeUndefined();
  });
});
