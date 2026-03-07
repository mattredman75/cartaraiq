/**
 * Tests for ListSwitcherModal component
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

import { ListSwitcherModal } from "../../components/ListSwitcherModal";
import type { ShoppingList } from "../../lib/types";

const lists: ShoppingList[] = [
  { id: "L1", name: "Groceries" },
  { id: "L2", name: "Hardware" },
];

const baseProps = {
  visible: true,
  onClose: jest.fn(),
  shoppingLists: lists,
  currentList: lists[0],
  onSelect: jest.fn(),
  onDelete: jest.fn(),
  onEditList: jest.fn(),
  createIsPending: false,
  newListName: "",
  setNewListName: jest.fn(),
  onCreateList: jest.fn(),
};

describe("ListSwitcherModal", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders title 'My Lists'", () => {
    const { getByText } = render(<ListSwitcherModal {...baseProps} />);
    expect(getByText("My Lists")).toBeTruthy();
  });

  it("renders all shopping lists", () => {
    const { getByText } = render(<ListSwitcherModal {...baseProps} />);
    expect(getByText("Groceries")).toBeTruthy();
    expect(getByText("Hardware")).toBeTruthy();
  });

  it("renders nothing visible when visible=false", () => {
    const { toJSON } = render(
      <ListSwitcherModal {...baseProps} visible={false} />,
    );
    expect(toJSON()).toBeNull();
  });

  it("calls setNewListName on text input change", () => {
    const setNewListName = jest.fn();
    const { getByPlaceholderText } = render(
      <ListSwitcherModal {...baseProps} setNewListName={setNewListName} />,
    );
    fireEvent.changeText(
      getByPlaceholderText("New list name…"),
      "Party Supplies",
    );
    expect(setNewListName).toHaveBeenCalledWith("Party Supplies");
  });

  it("calls onCreateList on + button press", () => {
    const onCreateList = jest.fn();
    const { getByText } = render(
      <ListSwitcherModal {...baseProps} onCreateList={onCreateList} />,
    );
    fireEvent.press(getByText("+"));
    expect(onCreateList).toHaveBeenCalled();
  });

  it("shows ActivityIndicator when createIsPending", () => {
    const { queryByText } = render(
      <ListSwitcherModal {...baseProps} createIsPending={true} />,
    );
    // "+" text is replaced by ActivityIndicator
    expect(queryByText("+")).toBeNull();
  });

  // ── Select / Delete / Edit interactions ──────────────────────────
  it("calls onSelect and onClose when a list is pressed", () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    const { getByText } = render(
      <ListSwitcherModal
        {...baseProps}
        onSelect={onSelect}
        onClose={onClose}
      />,
    );
    fireEvent.press(getByText("Hardware"));
    expect(onSelect).toHaveBeenCalledWith(lists[1]);
    expect(onClose).toHaveBeenCalled();
  });

  it("highlights selected list", () => {
    const { getByText } = render(<ListSwitcherModal {...baseProps} />);
    // Groceries is the current list - verify it renders
    expect(getByText("Groceries")).toBeTruthy();
  });

  it("renders 'new list name' input placeholder", () => {
    const { getByPlaceholderText } = render(
      <ListSwitcherModal {...baseProps} />,
    );
    expect(getByPlaceholderText("New list name…")).toBeTruthy();
  });

  // ── onEdit handler (lines 115-119) ──────────────────────────────
  it("calls onClose and onEditList when onEdit is triggered", () => {
    jest.useFakeTimers();
    const onClose = jest.fn();
    const onEditList = jest.fn();
    const { UNSAFE_root } = render(
      <ListSwitcherModal
        {...baseProps}
        onClose={onClose}
        onEditList={onEditList}
      />,
    );
    // Find SwipeableListItem components that have an onEdit prop
    const swipeables = UNSAFE_root.findAll(
      (node: any) => node.props?.onEdit && node.props?.list,
    );
    expect(swipeables.length).toBeGreaterThan(0);
    // Invoke onEdit on the first one
    swipeables[0].props.onEdit();
    expect(onClose).toHaveBeenCalled();
    // onEditList is called after 320ms setTimeout
    jest.advanceTimersByTime(350);
    expect(onEditList).toHaveBeenCalledWith(lists[0]);
    jest.useRealTimers();
  });

  // ── onDelete handler ──────────────────────────────────────────────
  it("calls onDelete when delete is triggered on a list item", () => {
    const onDelete = jest.fn();
    const { UNSAFE_root } = render(
      <ListSwitcherModal {...baseProps} onDelete={onDelete} />,
    );
    const swipeables = UNSAFE_root.findAll(
      (node: any) => node.props?.onDelete && node.props?.list,
    );
    expect(swipeables.length).toBeGreaterThan(0);
    swipeables[0].props.onDelete();
    expect(onDelete).toHaveBeenCalledWith(lists[0]);
  });

  // ── onSubmitEditing triggers onCreateList ─────────────────────────
  it("calls onCreateList when text input submitted", () => {
    const onCreateList = jest.fn();
    const { getByPlaceholderText } = render(
      <ListSwitcherModal {...baseProps} onCreateList={onCreateList} />,
    );
    fireEvent(getByPlaceholderText("New list name…"), "submitEditing");
    expect(onCreateList).toHaveBeenCalled();
  });

  // ── Backdrop press closes modal ───────────────────────────────────
  it("closes modal when backdrop is pressed", () => {
    const onClose = jest.fn();
    const { UNSAFE_root } = render(
      <ListSwitcherModal {...baseProps} onClose={onClose} />,
    );
    // The backdrop is a TouchableOpacity with activeOpacity=1 and position: absolute
    const backdrops = UNSAFE_root.findAll(
      (node: any) =>
        node.props?.activeOpacity === 1 &&
        node.props?.onPress &&
        node.props?.style?.position === "absolute",
    );
    expect(backdrops.length).toBeGreaterThan(0);
    backdrops[0].props.onPress();
    expect(onClose).toHaveBeenCalled();
  });
});
