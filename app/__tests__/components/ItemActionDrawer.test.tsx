/**
 * Tests for ItemActionDrawer component
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

import { ItemActionDrawer } from "../../components/ItemActionDrawer";
import type { ListItem } from "../../lib/types";

const item: ListItem = {
  id: "1",
  name: "Organic Bananas",
  quantity: 1,
  unit: null,
  checked: 0,
  sort_order: 0,
  times_added: 3,
};

const baseProps = {
  visible: true,
  item,
  isFixing: false,
  onClose: jest.fn(),
  onEditItem: jest.fn(),
  onFixWithAI: jest.fn(),
};

describe("ItemActionDrawer", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders item name", () => {
    const { getByText } = render(<ItemActionDrawer {...baseProps} />);
    expect(getByText("Organic Bananas")).toBeTruthy();
  });

  it("renders nothing visible when visible=false", () => {
    const { toJSON } = render(
      <ItemActionDrawer {...baseProps} visible={false} />,
    );
    expect(toJSON()).toBeNull();
  });

  it("does not render item name when item is null", () => {
    const { queryByText } = render(
      <ItemActionDrawer {...baseProps} item={null} />,
    );
    expect(queryByText("Organic Bananas")).toBeNull();
  });

  it("renders Edit item and Fix with AI buttons", () => {
    const { getByText } = render(<ItemActionDrawer {...baseProps} />);
    expect(getByText("Edit item")).toBeTruthy();
    expect(getByText("Fix with AI")).toBeTruthy();
  });

  it("calls onEditItem when Edit item pressed", () => {
    const onEditItem = jest.fn();
    const { getByText } = render(
      <ItemActionDrawer {...baseProps} onEditItem={onEditItem} />,
    );
    fireEvent.press(getByText("Edit item"));
    expect(onEditItem).toHaveBeenCalledTimes(1);
  });

  it("calls onFixWithAI when Fix with AI pressed", () => {
    const onFixWithAI = jest.fn();
    const { getByText } = render(
      <ItemActionDrawer {...baseProps} onFixWithAI={onFixWithAI} />,
    );
    fireEvent.press(getByText("Fix with AI"));
    expect(onFixWithAI).toHaveBeenCalledTimes(1);
  });

  it("shows spinner and disables Fix with AI when isFixing", () => {
    const onFixWithAI = jest.fn();
    const { queryByText } = render(
      <ItemActionDrawer
        {...baseProps}
        isFixing={true}
        onFixWithAI={onFixWithAI}
      />,
    );
    // Text is replaced by ActivityIndicator
    expect(queryByText("Fix with AI")).toBeNull();
  });
});
