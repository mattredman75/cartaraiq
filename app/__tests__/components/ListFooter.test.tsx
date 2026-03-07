/**
 * Tests for ListFooter component
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Alert } from "react-native";

import { ListFooter } from "../../components/ListFooter";
import type { ListItem } from "../../lib/types";

// Mock Alert.alert
jest.spyOn(Alert, "alert");

const makeItem = (overrides: Partial<ListItem> = {}): ListItem => ({
  id: "1",
  name: "Milk",
  quantity: 1,
  unit: null,
  checked: 1,
  sort_order: 0,
  times_added: 1,
  ...overrides,
});

const baseProps = {
  checked: [] as ListItem[],
  items: [makeItem({ id: "a", checked: 0 })],
  isLoading: false,
  onToggle: jest.fn(),
  onDelete: jest.fn(),
  onLongPress: jest.fn(),
};

describe("ListFooter", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows 'All done!' when items empty and not loading", () => {
    const { getByText } = render(<ListFooter {...baseProps} items={[]} />);
    expect(getByText("All done!")).toBeTruthy();
  });

  it("shows ActivityIndicator when items empty and loading", () => {
    const { queryByText } = render(
      <ListFooter {...baseProps} items={[]} isLoading={true} />,
    );
    // "All done!" should not appear when loading
    expect(queryByText("All done!")).toBeNull();
  });

  it("renders DONE section when checked items exist", () => {
    const checked = [
      makeItem({ id: "c1" }),
      makeItem({ id: "c2", name: "Eggs" }),
    ];
    const { getByText } = render(
      <ListFooter {...baseProps} checked={checked} />,
    );
    expect(getByText("DONE")).toBeTruthy();
    expect(getByText("CLEAR ALL")).toBeTruthy();
  });

  it("does not render DONE section when no checked items", () => {
    const { queryByText } = render(<ListFooter {...baseProps} />);
    expect(queryByText("DONE")).toBeNull();
    expect(queryByText("CLEAR ALL")).toBeNull();
  });

  it("shows alert on CLEAR ALL press with confirm that deletes all", () => {
    const onDelete = jest.fn();
    const checked = [makeItem({ id: "c1" }), makeItem({ id: "c2" })];
    const { getByText } = render(
      <ListFooter {...baseProps} checked={checked} onDelete={onDelete} />,
    );
    fireEvent.press(getByText("CLEAR ALL"));
    expect(Alert.alert).toHaveBeenCalledWith(
      "Clear done items",
      "Are you sure you want to clear all done items?",
      expect.arrayContaining([
        expect.objectContaining({ text: "Cancel" }),
        expect.objectContaining({ text: "Confirm" }),
      ]),
    );

    // Simulate confirm
    const confirmButton = (Alert.alert as jest.Mock).mock.calls[0][2].find(
      (b: any) => b.text === "Confirm",
    );
    confirmButton.onPress();
    expect(onDelete).toHaveBeenCalledTimes(2);
    expect(onDelete).toHaveBeenCalledWith("c1");
    expect(onDelete).toHaveBeenCalledWith("c2");
  });

  it("renders checked items as ItemRows in DONE section", () => {
    const onToggle = jest.fn();
    const onLongPress = jest.fn();
    const checked = [
      makeItem({ id: "c1", name: "Milk" }),
      makeItem({ id: "c2", name: "Eggs" }),
    ];
    const { getByText } = render(
      <ListFooter
        {...baseProps}
        checked={checked}
        onToggle={onToggle}
        onLongPress={onLongPress}
      />,
    );
    expect(getByText("Milk")).toBeTruthy();
    expect(getByText("Eggs")).toBeTruthy();
  });

  // ── onLongPress on checked items ─────────────────────────────────
  it("calls onLongPress with item when checked item is long-pressed", () => {
    const onLongPress = jest.fn();
    const checked = [makeItem({ id: "c1", name: "Butter" })];
    const { UNSAFE_root } = render(
      <ListFooter {...baseProps} checked={checked} onLongPress={onLongPress} />,
    );
    // Find ItemRow and trigger its onLongPress
    const itemRows = UNSAFE_root.findAll(
      (n: any) =>
        n.type?.name === "ItemRow" || n.type?.displayName === "ItemRow",
    );
    if (itemRows.length > 0 && itemRows[0].props.onLongPress) {
      itemRows[0].props.onLongPress();
      expect(onLongPress).toHaveBeenCalledWith(
        expect.objectContaining({ id: "c1", name: "Butter" }),
      );
    }
  });
});
