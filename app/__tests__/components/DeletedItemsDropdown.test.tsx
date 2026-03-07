/**
 * Tests for DeletedItemsDropdown component
 * Covers: dropdownVisible true/false branches, headerHeight > 0 branch, onDismiss, onSelectItem
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Animated } from "react-native";
import { DeletedItemsDropdown } from "../../components/DeletedItemsDropdown";

const mockItems = [
  {
    id: "d1",
    name: "Milk",
    quantity: 1,
    unit: null,
    checked: 2,
    sort_order: 0,
    times_added: 1,
  },
  {
    id: "d2",
    name: "Eggs",
    quantity: 1,
    unit: null,
    checked: 2,
    sort_order: 1,
    times_added: 1,
  },
] as any[];

const baseProps = {
  dropdownVisible: true,
  onDismiss: jest.fn(),
  headerHeight: 100,
  slideAnim: new Animated.Value(0),
  deletedMatches: mockItems,
  onSelectItem: jest.fn(),
};

describe("DeletedItemsDropdown", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders deleted item names when visible and headerHeight > 0", () => {
    const { getByText } = render(<DeletedItemsDropdown {...baseProps} />);
    expect(getByText("Milk")).toBeTruthy();
    expect(getByText("Eggs")).toBeTruthy();
  });

  it("does not render items when headerHeight is 0", () => {
    const { queryByText } = render(
      <DeletedItemsDropdown {...baseProps} headerHeight={0} />,
    );
    expect(queryByText("Milk")).toBeNull();
  });

  it("renders backdrop when dropdownVisible is true", () => {
    const { UNSAFE_root } = render(<DeletedItemsDropdown {...baseProps} />);
    const backdrop = UNSAFE_root.findAll(
      (node: any) =>
        node.props?.activeOpacity === 1 &&
        node.props?.style?.position === "absolute" &&
        node.props?.style?.zIndex === 1 &&
        node.props?.onPress,
    );
    expect(backdrop.length).toBeGreaterThan(0);
  });

  it("does not render backdrop when dropdownVisible is false", () => {
    const { UNSAFE_root } = render(
      <DeletedItemsDropdown {...baseProps} dropdownVisible={false} />,
    );
    const backdrop = UNSAFE_root.findAll(
      (node: any) =>
        node.props?.activeOpacity === 1 &&
        node.props?.style?.position === "absolute" &&
        node.props?.style?.zIndex === 1 &&
        node.props?.onPress,
    );
    expect(backdrop.length).toBe(0);
  });

  it("calls onDismiss when backdrop pressed", () => {
    const onDismiss = jest.fn();
    const { UNSAFE_root } = render(
      <DeletedItemsDropdown {...baseProps} onDismiss={onDismiss} />,
    );
    const backdrop = UNSAFE_root.findAll(
      (node: any) =>
        node.props?.activeOpacity === 1 &&
        node.props?.style?.position === "absolute" &&
        node.props?.style?.zIndex === 1 &&
        node.props?.onPress,
    );
    backdrop[0].props.onPress();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("calls onSelectItem with item name when item pressed", () => {
    const onSelectItem = jest.fn();
    const { getByText } = render(
      <DeletedItemsDropdown {...baseProps} onSelectItem={onSelectItem} />,
    );
    fireEvent.press(getByText("Milk"));
    expect(onSelectItem).toHaveBeenCalledWith("Milk");
  });

  it("sets pointerEvents to 'none' when not visible", () => {
    const { UNSAFE_root } = render(
      <DeletedItemsDropdown {...baseProps} dropdownVisible={false} />,
    );
    // The Animated.View should have pointerEvents="none"
    const animViews = UNSAFE_root.findAll(
      (node: any) => node.props?.pointerEvents === "none",
    );
    expect(animViews.length).toBeGreaterThan(0);
  });

  it("sets pointerEvents to 'auto' when visible", () => {
    const { UNSAFE_root } = render(
      <DeletedItemsDropdown {...baseProps} dropdownVisible={true} />,
    );
    const animViews = UNSAFE_root.findAll(
      (node: any) => node.props?.pointerEvents === "auto",
    );
    expect(animViews.length).toBeGreaterThan(0);
  });

  it("renders with empty deletedMatches", () => {
    const { queryByText } = render(
      <DeletedItemsDropdown {...baseProps} deletedMatches={[]} />,
    );
    expect(queryByText("Milk")).toBeNull();
  });
});
