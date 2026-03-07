/**
 * Tests for RenameItemModal component
 * Covers: visible/hidden branch (!!editItem), onCancel, onSave, setEditName, backdrop press, submitEditing
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { RenameItemModal } from "../../components/RenameItemModal";

const mockItem = {
  id: "i1",
  name: "Milk",
  quantity: 1,
  unit: null,
  checked: 0,
  sort_order: 0,
  times_added: 1,
} as any;

const baseProps = {
  editItem: mockItem,
  editName: "Milk",
  setEditName: jest.fn(),
  onCancel: jest.fn(),
  onSave: jest.fn(),
};

describe("RenameItemModal", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders modal visible when editItem is provided", () => {
    const { getByText } = render(<RenameItemModal {...baseProps} />);
    expect(getByText("Rename item")).toBeTruthy();
  });

  it("renders modal hidden when editItem is null", () => {
    const { queryByText } = render(
      <RenameItemModal {...baseProps} editItem={null} />,
    );
    // Modal visible=false means children are not rendered in test environment
    expect(queryByText("Rename item")).toBeNull();
  });

  it("shows current item name in the input", () => {
    const { getByDisplayValue } = render(
      <RenameItemModal {...baseProps} editName="Eggs" />,
    );
    expect(getByDisplayValue("Eggs")).toBeTruthy();
  });

  it("calls setEditName on text change", () => {
    const setEditName = jest.fn();
    const { getByDisplayValue } = render(
      <RenameItemModal {...baseProps} setEditName={setEditName} />,
    );
    fireEvent.changeText(getByDisplayValue("Milk"), "Almond Milk");
    expect(setEditName).toHaveBeenCalledWith("Almond Milk");
  });

  it("calls onSave when Save button pressed", () => {
    const onSave = jest.fn();
    const { getByText } = render(
      <RenameItemModal {...baseProps} onSave={onSave} />,
    );
    fireEvent.press(getByText("Save"));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when Cancel button pressed", () => {
    const onCancel = jest.fn();
    const { getByText } = render(
      <RenameItemModal {...baseProps} onCancel={onCancel} />,
    );
    fireEvent.press(getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when backdrop pressed", () => {
    const onCancel = jest.fn();
    const { UNSAFE_root } = render(
      <RenameItemModal {...baseProps} onCancel={onCancel} />,
    );
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
      <RenameItemModal {...baseProps} onSave={onSave} />,
    );
    fireEvent(getByDisplayValue("Milk"), "submitEditing");
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
