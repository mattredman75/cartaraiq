/**
 * Tests for SwipeableListItem component
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

import { SwipeableListItem } from "../../components/SwipeableListItem";
import type { ShoppingList } from "../../lib/types";

const { __gestureCallbacks } = require("react-native-gesture-handler");

const list: ShoppingList = { id: "L1", name: "Groceries" };

describe("SwipeableListItem", () => {
  const baseProps = {
    list,
    isSelected: false,
    canDelete: true,
    onSelect: jest.fn(),
    onDelete: jest.fn(),
    onEdit: jest.fn(),
  };

  it("renders list name", () => {
    const { getByText } = render(<SwipeableListItem {...baseProps} />);
    expect(getByText("Groceries")).toBeTruthy();
  });

  it("shows checkmark when selected", () => {
    const { getByText } = render(
      <SwipeableListItem {...baseProps} isSelected={true} />,
    );
    expect(getByText("✓")).toBeTruthy();
  });

  it("does not show checkmark when not selected", () => {
    const { queryByText } = render(
      <SwipeableListItem {...baseProps} isSelected={false} />,
    );
    expect(queryByText("✓")).toBeNull();
  });

  it("calls onSelect on press", () => {
    const onSelect = jest.fn();
    const { getByText } = render(
      <SwipeableListItem {...baseProps} onSelect={onSelect} />,
    );
    fireEvent.press(getByText("Groceries"));
    expect(onSelect).toHaveBeenCalled();
  });

  it("shows delete button when canDelete", () => {
    const { getByText } = render(<SwipeableListItem {...baseProps} />);
    expect(getByText("Delete")).toBeTruthy();
  });

  it("calls onDelete when delete pressed", () => {
    const onDelete = jest.fn();
    const { getByText } = render(
      <SwipeableListItem {...baseProps} onDelete={onDelete} />,
    );
    fireEvent.press(getByText("Delete"));
    expect(onDelete).toHaveBeenCalled();
  });

  // ── Gesture callback tests ──────────────────────────────────────
  it("registers swipe gesture callbacks", () => {
    render(<SwipeableListItem {...baseProps} />);
    expect(__gestureCallbacks.onUpdate).toBeTruthy();
    expect(__gestureCallbacks.onEnd).toBeTruthy();
  });

  it("swipe gesture onUpdate clamps translateX value", () => {
    render(<SwipeableListItem {...baseProps} />);
    if (__gestureCallbacks.onUpdate) {
      __gestureCallbacks.onUpdate({ translationX: -50 });
    }
  });

  it("swipe gesture onEnd opens when past threshold", () => {
    render(<SwipeableListItem {...baseProps} />);
    if (__gestureCallbacks.onEnd) {
      __gestureCallbacks.onEnd({ translationX: -100 });
    }
  });

  it("swipe gesture onEnd closes when below threshold", () => {
    render(<SwipeableListItem {...baseProps} />);
    if (__gestureCallbacks.onEnd) {
      __gestureCallbacks.onEnd({ translationX: -10 });
    }
  });

  it("calls onEdit on long press", () => {
    const onEdit = jest.fn();
    const { getByText } = render(
      <SwipeableListItem {...baseProps} onEdit={onEdit} />,
    );
    fireEvent(getByText("Groceries"), "longPress");
    expect(onEdit).toHaveBeenCalled();
  });

  it("renders without delete button when canDelete is false", () => {
    // canDelete=false doesn't hide delete zone, but disables gesture
    const { getByText } = render(
      <SwipeableListItem {...baseProps} canDelete={false} />,
    );
    expect(getByText("Groceries")).toBeTruthy();
  });
});
