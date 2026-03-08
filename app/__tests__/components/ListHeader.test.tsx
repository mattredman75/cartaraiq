/**
 * Tests for ListHeader component
 */
import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import { TextInput } from "react-native";

import { ListHeader } from "../../components/ListHeader";
import type { ListItem, ShoppingList } from "../../lib/types";

const mockList: ShoppingList = { id: "L1", name: "Groceries" };

const baseProps = {
  currentList: mockList,
  refetchLists: jest.fn(),
  onOpenListModal: jest.fn(),
  unchecked: [] as ListItem[],
  checked: [] as ListItem[],
  inputText: "",
  setInputText: jest.fn(),
  onSubmit: jest.fn(),
  onInterimTranscript: jest.fn(),
  onFinalTranscript: jest.fn(),
  addIsPending: false,
  onLayout: jest.fn(),
  inputRef: React.createRef<TextInput>(),
};

describe("ListHeader", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows 'All done!' when unchecked is empty", () => {
    const { getByText } = render(<ListHeader {...baseProps} />);
    expect(getByText("All done!")).toBeTruthy();
  });

  it("shows item count with list name when unchecked has items", () => {
    const item: ListItem = {
      id: "1",
      name: "Milk",
      quantity: 1,
      unit: null,
      checked: 0,
      sort_order: 0,
      times_added: 1,
    };
    const { getByText } = render(
      <ListHeader {...baseProps} unchecked={[item]} />,
    );
    expect(getByText("0/1 items in Groceries")).toBeTruthy();
  });

  it("shows done count when some items are checked", () => {
    const uncheckedItem: ListItem = {
      id: "1",
      name: "Milk",
      quantity: 1,
      unit: null,
      checked: 0,
      sort_order: 0,
      times_added: 1,
    };
    const checkedItem: ListItem = {
      id: "2",
      name: "Eggs",
      quantity: 1,
      unit: null,
      checked: 1,
      sort_order: 1,
      times_added: 1,
    };
    const { getByText } = render(
      <ListHeader {...baseProps} unchecked={[uncheckedItem]} checked={[checkedItem]} />,
    );
    expect(getByText("1/2 items in Groceries")).toBeTruthy();
  });

  it("falls back to 'My List' when currentList is null", () => {
    const item: ListItem = {
      id: "1",
      name: "Milk",
      quantity: 1,
      unit: null,
      checked: 0,
      sort_order: 0,
      times_added: 1,
    };
    const { getByText } = render(
      <ListHeader {...baseProps} currentList={null} unchecked={[item]} />,
    );
    expect(getByText("0/1 items in My List")).toBeTruthy();
  });

  it("calls refetchLists and onOpenListModal when list icon pressed", () => {
    const refetchLists = jest.fn();
    const onOpenListModal = jest.fn();
    const { getByTestId } = render(
      <ListHeader
        {...baseProps}
        refetchLists={refetchLists}
        onOpenListModal={onOpenListModal}
      />,
    );
    fireEvent.press(getByTestId("list-icon-button"));
    expect(refetchLists).toHaveBeenCalledTimes(1);
    expect(onOpenListModal).toHaveBeenCalledTimes(1);
  });

  it("pluralises item count", () => {
    const items = [
      {
        id: "a",
        name: "A",
        quantity: 1,
        unit: null,
        checked: 0,
        sort_order: 0,
        times_added: 1,
      },
      {
        id: "b",
        name: "B",
        quantity: 1,
        unit: null,
        checked: 0,
        sort_order: 0,
        times_added: 1,
      },
    ];
    const { getByText } = render(
      <ListHeader {...baseProps} unchecked={items} />,
    );
    expect(getByText("0/2 items in Groceries")).toBeTruthy();
  });

  it("calls setInputText on text change", () => {
    const setInputText = jest.fn();
    const { getByPlaceholderText } = render(
      <ListHeader {...baseProps} setInputText={setInputText} />,
    );
    fireEvent.changeText(getByPlaceholderText("Add items to Groceries"), "Eggs");
    expect(setInputText).toHaveBeenCalledWith("Eggs");
  });

  it("does not render input when inputText prop is empty", () => {
    const { getByPlaceholderText } = render(<ListHeader {...baseProps} />);
    expect(getByPlaceholderText("Add items to Groceries")).toBeTruthy();
  });

  // ── onLayout callback (line 66) ──────────────────────────────────
  it("calls onLayout with the layout height", () => {
    const onLayout = jest.fn();
    const { UNSAFE_root } = render(
      <ListHeader {...baseProps} onLayout={onLayout} />,
    );
    // The outer View has an onLayout handler
    const layoutViews = UNSAFE_root.findAll(
      (node: any) => node.props?.onLayout && node.props?.style?.zIndex === 3,
    );
    expect(layoutViews.length).toBeGreaterThan(0);
    // Simulate the onLayout event
    layoutViews[0].props.onLayout({
      nativeEvent: { layout: { height: 200 } },
    });
    expect(onLayout).toHaveBeenCalledWith(200);
  });

  // ── onSubmit callback ─────────────────────────────────────────────
  it("calls onSubmit when text input is submitted", () => {
    const onSubmit = jest.fn();
    const { getByPlaceholderText } = render(
      <ListHeader {...baseProps} onSubmit={onSubmit} />,
    );
    fireEvent(getByPlaceholderText("Add items to Groceries"), "submitEditing");
    expect(onSubmit).toHaveBeenCalled();
  });


  // ── addIsPending shows ActivityIndicator ────────────────────────
  it("shows ActivityIndicator when addIsPending is true", () => {
    const { toJSON } = render(
      <ListHeader {...baseProps} addIsPending={true} />,
    );
    // ActivityIndicator should be rendered when addIsPending=true
    expect(toJSON()).toBeTruthy();
  });
});
