/**
 * Tests for EditListNameModal component
 * Covers: visible/hidden branch (!!editList), onCancel, onSave, setEditListName, backdrop press, submitEditing
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { EditListNameModal } from "../../components/EditListNameModal";

const baseProps = {
  editList: { id: "L1", name: "Groceries" } as any,
  editListName: "Groceries",
  setEditListName: jest.fn(),
  onCancel: jest.fn(),
  onSave: jest.fn(),
};

describe("EditListNameModal", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders modal visible when editList is provided", () => {
    const { getByText } = render(<EditListNameModal {...baseProps} />);
    expect(getByText("Rename list")).toBeTruthy();
  });

  it("renders modal hidden when editList is null", () => {
    const { queryByText } = render(
      <EditListNameModal {...baseProps} editList={null} />,
    );
    // Modal visible=false means children are not rendered in test environment
    expect(queryByText("Rename list")).toBeNull();
  });

  it("shows current list name in the input", () => {
    const { getByDisplayValue } = render(
      <EditListNameModal {...baseProps} editListName="My List" />,
    );
    expect(getByDisplayValue("My List")).toBeTruthy();
  });

  it("calls setEditListName on text change", () => {
    const setEditListName = jest.fn();
    const { getByDisplayValue } = render(
      <EditListNameModal {...baseProps} setEditListName={setEditListName} />,
    );
    fireEvent.changeText(getByDisplayValue("Groceries"), "New Name");
    expect(setEditListName).toHaveBeenCalledWith("New Name");
  });

  it("calls onSave when Save button pressed", () => {
    const onSave = jest.fn();
    const { getByText } = render(
      <EditListNameModal {...baseProps} onSave={onSave} />,
    );
    fireEvent.press(getByText("Save"));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when Cancel button pressed", () => {
    const onCancel = jest.fn();
    const { getByText } = render(
      <EditListNameModal {...baseProps} onCancel={onCancel} />,
    );
    fireEvent.press(getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when backdrop pressed", () => {
    const onCancel = jest.fn();
    const { UNSAFE_root } = render(
      <EditListNameModal {...baseProps} onCancel={onCancel} />,
    );
    // Backdrop is TouchableOpacity with position: "absolute" and activeOpacity: 1
    const backdrop = UNSAFE_root.findAll(
      (node: any) =>
        node.props?.activeOpacity === 1 &&
        node.props?.style?.position === "absolute" &&
        node.props?.onPress,
    );
    expect(backdrop.length).toBeGreaterThan(0);
    backdrop[0].props.onPress();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onSave on submitEditing (keyboard done)", () => {
    const onSave = jest.fn();
    const { getByDisplayValue } = render(
      <EditListNameModal {...baseProps} onSave={onSave} />,
    );
    fireEvent(getByDisplayValue("Groceries"), "submitEditing");
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
