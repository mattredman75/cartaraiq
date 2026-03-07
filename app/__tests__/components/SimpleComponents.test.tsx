/**
 * Tests for simple presentational components:
 * DragPlaceholder, NoListsEmptyState, MaintenanceScreen,
 * RenameItemModal, EditListNameModal, DeletedItemsDropdown
 */
import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import { Animated } from "react-native";

// Mock constants for MaintenanceScreen
jest.mock("../../lib/constants", () => ({
  COLORS: {
    surface: "#F5F9FA",
    ink: "#1A1A2E",
    muted: "#64748B",
    teal: "#1B6B7A",
  },
}));

import { DragPlaceholder } from "../../components/DragPlaceholder";
import { NoListsEmptyState } from "../../components/NoListsEmptyState";
import { MaintenanceScreen } from "../../components/MaintenanceScreen";
import { RenameItemModal } from "../../components/RenameItemModal";
import { EditListNameModal } from "../../components/EditListNameModal";
import { DeletedItemsDropdown } from "../../components/DeletedItemsDropdown";

// ── DragPlaceholder ─────────────────────────────────────────────────────────
describe("DragPlaceholder", () => {
  it("renders without crashing", () => {
    const { toJSON } = render(<DragPlaceholder />);
    expect(toJSON()).toBeTruthy();
  });
});

// ── NoListsEmptyState ───────────────────────────────────────────────────────
describe("NoListsEmptyState", () => {
  const defaultProps = {
    onCreateList: jest.fn(),
    isPending: false,
    newListName: "",
    onChangeName: jest.fn(),
  };

  it("renders title and description", () => {
    const { getByText } = render(<NoListsEmptyState {...defaultProps} />);
    expect(getByText("No lists yet")).toBeTruthy();
    expect(getByText(/Create your first list/)).toBeTruthy();
  });

  it("calls onChangeName when text input changes", () => {
    const onChangeName = jest.fn();
    const { getByPlaceholderText } = render(
      <NoListsEmptyState {...defaultProps} onChangeName={onChangeName} />,
    );
    fireEvent.changeText(getByPlaceholderText("Name your list…"), "Groceries");
    expect(onChangeName).toHaveBeenCalledWith("Groceries");
  });

  it("calls onCreateList with trimmed name on button press", () => {
    const onCreateList = jest.fn();
    const { getByText } = render(
      <NoListsEmptyState
        {...defaultProps}
        onCreateList={onCreateList}
        newListName="  Groceries  "
      />,
    );
    fireEvent.press(getByText("+"));
    expect(onCreateList).toHaveBeenCalledWith("Groceries");
  });

  it("does not call onCreateList when name is empty", () => {
    const onCreateList = jest.fn();
    const { getByText } = render(
      <NoListsEmptyState
        {...defaultProps}
        onCreateList={onCreateList}
        newListName="   "
      />,
    );
    fireEvent.press(getByText("+"));
    expect(onCreateList).not.toHaveBeenCalled();
  });

  it("shows ActivityIndicator when isPending", () => {
    const { queryByText, UNSAFE_queryByType } = render(
      <NoListsEmptyState {...defaultProps} isPending={true} />,
    );
    expect(queryByText("+")).toBeNull(); // + is replaced by spinner
  });
});

// ── MaintenanceScreen ───────────────────────────────────────────────────────
describe("MaintenanceScreen", () => {
  it("renders title and default message", () => {
    const { getByText } = render(<MaintenanceScreen onRefresh={jest.fn()} />);
    expect(getByText("Maintenance Mode")).toBeTruthy();
    expect(getByText(/scheduled maintenance/)).toBeTruthy();
  });

  it("renders custom message", () => {
    const { getByText } = render(
      <MaintenanceScreen message="Server upgrade" onRefresh={jest.fn()} />,
    );
    expect(getByText("Server upgrade")).toBeTruthy();
  });

  it("calls onRefresh when refresh button pressed", async () => {
    const onRefresh = jest.fn().mockResolvedValue(undefined);
    const { getByText } = render(<MaintenanceScreen onRefresh={onRefresh} />);
    await act(async () => {
      fireEvent.press(getByText("Refresh"));
    });
    expect(onRefresh).toHaveBeenCalled();
  });
});

// ── RenameItemModal ─────────────────────────────────────────────────────────
describe("RenameItemModal", () => {
  const baseProps = {
    editItem: null,
    editName: "",
    setEditName: jest.fn(),
    onCancel: jest.fn(),
    onSave: jest.fn(),
  };

  it("is hidden when editItem is null", () => {
    const { toJSON } = render(<RenameItemModal {...baseProps} />);
    // Modal visible={false} when editItem is null — renders nothing
    expect(toJSON()).toBeNull();
  });

  it("shows modal with item name when editItem provided", () => {
    const item = {
      id: "1",
      name: "Milk",
      quantity: 1,
      unit: null,
      checked: 0,
      sort_order: 0,
      times_added: 1,
    };
    const { getByText, getByDisplayValue } = render(
      <RenameItemModal {...baseProps} editItem={item} editName="Milk" />,
    );
    expect(getByText("Rename item")).toBeTruthy();
    expect(getByDisplayValue("Milk")).toBeTruthy();
  });

  it("calls onSave on Save press", () => {
    const onSave = jest.fn();
    const item = {
      id: "1",
      name: "Milk",
      quantity: 1,
      unit: null,
      checked: 0,
      sort_order: 0,
      times_added: 1,
    };
    const { getByText } = render(
      <RenameItemModal {...baseProps} editItem={item} onSave={onSave} />,
    );
    fireEvent.press(getByText("Save"));
    expect(onSave).toHaveBeenCalled();
  });

  it("calls onCancel on Cancel press", () => {
    const onCancel = jest.fn();
    const item = {
      id: "1",
      name: "Milk",
      quantity: 1,
      unit: null,
      checked: 0,
      sort_order: 0,
      times_added: 1,
    };
    const { getByText } = render(
      <RenameItemModal {...baseProps} editItem={item} onCancel={onCancel} />,
    );
    fireEvent.press(getByText("Cancel"));
    expect(onCancel).toHaveBeenCalled();
  });
});

// ── EditListNameModal ───────────────────────────────────────────────────────
describe("EditListNameModal", () => {
  const baseProps = {
    editList: null,
    editListName: "",
    setEditListName: jest.fn(),
    onCancel: jest.fn(),
    onSave: jest.fn(),
  };

  it("is hidden when editList is null", () => {
    const { toJSON } = render(<EditListNameModal {...baseProps} />);
    // Modal visible={false} when editList is null — renders nothing
    expect(toJSON()).toBeNull();
  });

  it("shows Rename list title when editList provided", () => {
    const list = { id: "L1", name: "Old" };
    const { getByText } = render(
      <EditListNameModal {...baseProps} editList={list} editListName="Old" />,
    );
    expect(getByText("Rename list")).toBeTruthy();
  });

  it("calls callbacks on Save/Cancel", () => {
    const onSave = jest.fn();
    const onCancel = jest.fn();
    const list = { id: "L1", name: "Old" };
    const { getByText } = render(
      <EditListNameModal
        {...baseProps}
        editList={list}
        editListName="New"
        onSave={onSave}
        onCancel={onCancel}
      />,
    );
    fireEvent.press(getByText("Save"));
    expect(onSave).toHaveBeenCalled();
    fireEvent.press(getByText("Cancel"));
    expect(onCancel).toHaveBeenCalled();
  });
});

// ── DeletedItemsDropdown ────────────────────────────────────────────────────
describe("DeletedItemsDropdown", () => {
  const items = [
    {
      id: "1",
      name: "Milk",
      quantity: 1,
      unit: null,
      checked: 2,
      sort_order: 0,
      times_added: 1,
    },
    {
      id: "2",
      name: "Eggs",
      quantity: 1,
      unit: null,
      checked: 2,
      sort_order: 0,
      times_added: 1,
    },
  ];
  const baseProps = {
    dropdownVisible: true,
    onDismiss: jest.fn(),
    headerHeight: 100,
    slideAnim: new Animated.Value(0),
    deletedMatches: items,
    onSelectItem: jest.fn(),
  };

  it("renders deleted item names when visible", () => {
    const { getByText } = render(<DeletedItemsDropdown {...baseProps} />);
    expect(getByText("Milk")).toBeTruthy();
    expect(getByText("Eggs")).toBeTruthy();
  });

  it("calls onSelectItem when item pressed", () => {
    const onSelectItem = jest.fn();
    const { getByText } = render(
      <DeletedItemsDropdown {...baseProps} onSelectItem={onSelectItem} />,
    );
    fireEvent.press(getByText("Milk"));
    expect(onSelectItem).toHaveBeenCalledWith("Milk");
  });
});
