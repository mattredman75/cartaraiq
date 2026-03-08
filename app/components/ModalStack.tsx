import React from "react";
import type { ListItem, ShoppingList } from "../lib/types";
import { RenameItemModal } from "./RenameItemModal";
import { ListSwitcherModal } from "./ListSwitcherModal";
import { EditListNameModal } from "./EditListNameModal";

export interface ModalStackProps {
  editItem: ListItem | null;
  editName: string;
  setEditName: (v: string) => void;
  onCancelEdit: () => void;
  onSaveRename: () => void;
  showListModal: boolean;
  onCloseListModal: () => void;
  shoppingLists: ShoppingList[];
  currentList: ShoppingList | null;
  onSelectList: (list: ShoppingList) => void;
  onDeleteList: (list: ShoppingList) => void;
  onEditList: (list: ShoppingList) => void;
  createIsPending: boolean;
  newListName: string;
  setNewListName: (v: string) => void;
  onCreateList: () => void;
  editList: ShoppingList | null;
  editListName: string;
  setEditListName: (v: string) => void;
  onCancelEditList: () => void;
  onSaveListName: () => void;
}

export function ModalStack({
  editItem,
  editName,
  setEditName,
  onCancelEdit,
  onSaveRename,
  showListModal,
  onCloseListModal,
  shoppingLists,
  currentList,
  onSelectList,
  onDeleteList,
  onEditList,
  createIsPending,
  newListName,
  setNewListName,
  onCreateList,
  editList,
  editListName,
  setEditListName,
  onCancelEditList,
  onSaveListName,
}: ModalStackProps) {
  return (
    <>
      <RenameItemModal
        editItem={editItem}
        editName={editName}
        setEditName={setEditName}
        onCancel={onCancelEdit}
        onSave={onSaveRename}
      />
      <ListSwitcherModal
        visible={showListModal}
        onClose={onCloseListModal}
        shoppingLists={shoppingLists}
        currentList={currentList}
        onSelect={onSelectList}
        onDelete={onDeleteList}
        onEditList={onEditList}
        createIsPending={createIsPending}
        newListName={newListName}
        setNewListName={setNewListName}
        onCreateList={onCreateList}
      />
      <EditListNameModal
        editList={editList}
        editListName={editListName}
        setEditListName={setEditListName}
        onCancel={onCancelEditList}
        onSave={onSaveListName}
      />
    </>
  );
}
