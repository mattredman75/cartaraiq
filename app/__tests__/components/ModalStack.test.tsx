/**
 * Tests for ModalStack component
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

import { ModalStack } from "../../components/ModalStack";

// Base null/empty props: all modals hidden
const baseProps = {
  editItem: null,
  editName: "",
  setEditName: jest.fn(),
  onCancelEdit: jest.fn(),
  onSaveRename: jest.fn(),
  showSettings: false,
  onCloseSettings: jest.fn(),
  aiEnabled: true,
  setAiEnabled: jest.fn(),
  pairingEnabled: true,
  setPairingEnabled: jest.fn(),
  showListModal: false,
  onCloseListModal: jest.fn(),
  shoppingLists: [],
  currentList: null,
  onSelectList: jest.fn(),
  onDeleteList: jest.fn(),
  onEditList: jest.fn(),
  createIsPending: false,
  newListName: "",
  setNewListName: jest.fn(),
  onCreateList: jest.fn(),
  editList: null,
  editListName: "",
  setEditListName: jest.fn(),
  onCancelEditList: jest.fn(),
  onSaveListName: jest.fn(),
};

describe("ModalStack", () => {
  it("renders without crashing with all modals hidden", () => {
    const { toJSON } = render(<ModalStack {...baseProps} />);
    // All modals hidden → renders null
    expect(toJSON()).toBeNull();
  });

  it("renders RenameItemModal when editItem is provided", () => {
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
      <ModalStack {...baseProps} editItem={item} editName="Milk" />,
    );
    expect(getByText("Rename item")).toBeTruthy();
  });

  it("renders ListSwitcherModal when showListModal is true", () => {
    const { getByText } = render(
      <ModalStack {...baseProps} showListModal={true} />,
    );
    expect(getByText("My Lists")).toBeTruthy();
  });

  it("renders EditListNameModal when editList is provided", () => {
    const list = { id: "L1", name: "Groceries" };
    const { getByText } = render(
      <ModalStack {...baseProps} editList={list} editListName="Groceries" />,
    );
    expect(getByText("Rename list")).toBeTruthy();
  });
});
