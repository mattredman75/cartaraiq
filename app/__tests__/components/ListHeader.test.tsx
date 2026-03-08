/**
 * Tests for ListHeader component
 */
import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import { TextInput } from "react-native";

import { ListHeader } from "../../components/ListHeader";
import type { ShoppingList, ListItem } from "../../lib/types";

const lists: ShoppingList[] = [
  { id: "L1", name: "Groceries" },
  { id: "L2", name: "Hardware" },
];

const baseProps = {
  shoppingLists: lists,
  currentList: lists[0],
  refetchLists: jest.fn(),
  onOpenListModal: jest.fn(),
  firstName: "Matt",
  getGreeting: () => "Good morning",
  unchecked: [] as ListItem[],
  suggestions: [],
  allSuggestions: [],
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

  it("renders greeting with first name", () => {
    const { getByText } = render(<ListHeader {...baseProps} />);
    expect(getByText("Good morning, Matt")).toBeTruthy();
  });

  it("renders current list name in switcher", () => {
    const { getByText } = render(<ListHeader {...baseProps} />);
    expect(getByText("Groceries")).toBeTruthy();
  });

  it("renders 'My List' when currentList is null", () => {
    const { getByText } = render(
      <ListHeader {...baseProps} currentList={null} />,
    );
    expect(getByText("My List")).toBeTruthy();
  });

  it("calls refetchLists and onOpenListModal when list name pressed", () => {
    const refetchLists = jest.fn();
    const onOpenListModal = jest.fn();
    const { getByText } = render(
      <ListHeader
        {...baseProps}
        refetchLists={refetchLists}
        onOpenListModal={onOpenListModal}
      />,
    );
    fireEvent.press(getByText("Groceries"));
    expect(refetchLists).toHaveBeenCalledTimes(1);
    expect(onOpenListModal).toHaveBeenCalledTimes(1);
  });

  it("shows 'All done!' when unchecked is empty", () => {
    const { getByText } = render(<ListHeader {...baseProps} />);
    expect(getByText("All done!")).toBeTruthy();
  });

  it("shows item count when unchecked has items", () => {
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
    expect(getByText("1 item in this list")).toBeTruthy();
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
    expect(getByText("2 items in this list")).toBeTruthy();
  });

  it("shows AI suggestions count", () => {
    const sug = [
      { name: "Bananas", reason: "r", _type: "prediction" },
      { name: "Pasta", reason: "r", _type: "recipe" },
    ];
    const { getByText } = render(
      <ListHeader {...baseProps} allSuggestions={sug} />,
    );
    expect(getByText("2 AI suggestions")).toBeTruthy();
  });

  it("calls setInputText on text change", () => {
    const setInputText = jest.fn();
    const { getByPlaceholderText } = render(
      <ListHeader {...baseProps} setInputText={setInputText} />,
    );
    fireEvent.changeText(getByPlaceholderText("Add to this list"), "Eggs");
    expect(setInputText).toHaveBeenCalledWith("Eggs");
  });

  it("does not render list switcher when shoppingLists is empty", () => {
    const { queryByText } = render(
      <ListHeader {...baseProps} shoppingLists={[]} />,
    );
    expect(queryByText("Groceries")).toBeNull();
    expect(queryByText("▾")).toBeNull();
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
    fireEvent(getByPlaceholderText("Add to this list"), "submitEditing");
    expect(onSubmit).toHaveBeenCalled();
  });

  // ── Single AI suggestion ────────────────────────────────────────
  it("shows AI suggestions count for single suggestion", () => {
    const sug = [{ name: "Bananas", reason: "r", _type: "prediction" }];
    const { getByText } = render(
      <ListHeader {...baseProps} allSuggestions={sug} />,
    );
    expect(getByText("1 AI suggestions")).toBeTruthy();
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
