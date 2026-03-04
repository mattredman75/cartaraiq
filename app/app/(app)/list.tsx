import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Alert,
  RefreshControl,
  Animated,
} from "react-native";
import DraggableFlatList, {
  RenderItemParams,
} from "react-native-draggable-flatlist";
import { useQueryClient } from "@tanstack/react-query";
import { getItem } from "../../lib/storage";
import { useAuthStore, useListStore } from "../../lib/store";
import {
  reorderListItems,
  parseItemText,
  hardDeleteItem,
  updateListItem,
  addListItem,
} from "../../lib/api";
import type { ListItem, ShoppingList } from "../../lib/types";
import { ScrollInfoContext } from "../../components/ItemRow";
import { ItemRow } from "../../components/ItemRow";
import { DragPlaceholder } from "../../components/DragPlaceholder";
import { NoListsEmptyState } from "../../components/NoListsEmptyState";
import { useDismissedSuggestions } from "../../hooks/useDismissedSuggestions";
import { useListQueries } from "../../hooks/useListQueries";
import { useItemMutations } from "../../hooks/useItemMutations";
import { useListMutations } from "../../hooks/useListMutations";
import { ListHeader } from "../../components/ListHeader";
import { DeletedItemsDropdown } from "../../components/DeletedItemsDropdown";
import { SuggestionsStrip } from "../../components/SuggestionsStrip";
import { ListFooter } from "../../components/ListFooter";
import { ModalStack } from "../../components/ModalStack";
import { ItemActionDrawer } from "../../components/ItemActionDrawer";
import { syncListToWidget } from "../../hooks/useWidgetSync";

const TEAL = "#1B6B7A";
const BG = "#DDE4E7";
const MUTED = "#64748B";

const SUGGEST_ITEM_H = 46;
const PANEL_OVERLAP = 14;
const MAX_PANEL_H = 5 * SUGGEST_ITEM_H + 8;

export default function ListScreen() {
  const { user } = useAuthStore();
  const { currentList, setCurrentList } = useListStore();
  const qc = useQueryClient();

  const [inputText, setInputText] = useState("");
  const [showListModal, setShowListModal] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [pairingEnabled, setPairingEnabled] = useState(true);
  const [editItem, setEditItem] = useState<ListItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editList, setEditList] = useState<ShoppingList | null>(null);
  const [editListName, setEditListName] = useState("");
  const [actionItem, setActionItem] = useState<ListItem | null>(null);
  const [showActionDrawer, setShowActionDrawer] = useState(false);
  const [isFixingWithAI, setIsFixingWithAI] = useState(false);

  const inputRef = useRef<TextInput>(null);

  const [dragDirection, setDragDirection] = useState<"up" | "down">("down");
  const [headerHeight, setHeaderHeight] = useState(0);
  const [dropdownDismissed, setDropdownDismissed] = useState(false);
  const slideAnim = useRef(
    new Animated.Value(-(MAX_PANEL_H + PANEL_OVERLAP)),
  ).current;

  useEffect(() => {
    getItem("ai_suggestions_enabled").then((val) => {
      if (val === "0") setAiEnabled(false);
    });
    getItem("pairing_suggestions_enabled").then((val) => {
      if (val === "0") setPairingEnabled(false);
    });
  }, []);

  // Keep the iOS home-screen widget in sync with the current list
  useEffect(() => {
    syncListToWidget(currentList ?? null, items);
  }, [items, currentList]);

  const { dismissedUntil, dismissSuggestion } = useDismissedSuggestions(
    user?.id,
  );
  const listId = currentList?.id;

  const {
    shoppingLists,
    refetchLists,
    items,
    isLoading,
    refetch,
    deletedItems,
    unchecked,
    checked,
    suggestions,
    allSuggestions,
    suggestionsFetching,
    recipeSuggestionsFetching,
  } = useListQueries({
    listId,
    aiEnabled,
    pairingEnabled,
    dismissedUntil,
    userId: user?.id,
  });

  const isRefreshing = suggestionsFetching || recipeSuggestionsFetching;

  useEffect(() => {
    if (!currentList && shoppingLists.length > 0)
      setCurrentList(shoppingLists[0]);
  }, [shoppingLists, currentList]);

  const { addMutation, toggleMutation, deleteMutation, renameMutation } =
    useItemMutations({ listId, qc });
  const { createListMutation, deleteListMutation, renameListMutation } =
    useListMutations({ qc, setCurrentList, currentList });

  const handleAdd = () => {
    const text = inputText.trim();
    if (!text) return;
    addMutation.mutate({ text });
    setInputText("");
  };

  const deletedMatches = React.useMemo(() => {
    const q = inputText.trim().toLowerCase();
    if (q.length < 2) return [];
    return deletedItems
      .filter((it) => it.name.toLowerCase().startsWith(q))
      .slice(0, 5);
  }, [inputText, deletedItems]);

  useEffect(() => {
    setDropdownDismissed(false);
  }, [inputText]);
  const dropdownVisible = deletedMatches.length > 0 && !dropdownDismissed;

  const wasVisibleRef = useRef(false);
  useEffect(() => {
    if (dropdownVisible === wasVisibleRef.current) return;
    wasVisibleRef.current = dropdownVisible;
    Animated.spring(slideAnim, {
      toValue: dropdownVisible ? 0 : -(MAX_PANEL_H + PANEL_OVERLAP),
      useNativeDriver: true,
      damping: 22,
      stiffness: 220,
      mass: 0.7,
    }).start();
  }, [dropdownVisible]);

  const handleAddSuggestion = (name: string) => {
    addMutation.mutate({ text: name });
    qc.setQueryData<{ name: string; reason: string }[]>(
      ["suggestions", listId],
      (old = []) => old.filter((s) => s.name !== name),
    );
    qc.invalidateQueries({ queryKey: ["suggestions", listId] });
  };

  const handleAddRecipeSuggestion = (name: string) => {
    addMutation.mutate({ text: name });
    qc.setQueryData<{ name: string; reason: string }[]>(
      ["recipeSuggestions", listId],
      (old = []) => old.filter((s) => s.name !== name),
    );
    qc.invalidateQueries({ queryKey: ["recipeSuggestions", listId] });
  };

  const handleDelete = (itemOrId: ListItem | string) => {
    let item: ListItem | undefined;
    if (typeof itemOrId === "string") {
      item = items.find((it) => it.id === itemOrId);
    } else {
      item = itemOrId;
    }
    if (item && item.checked === 1) {
      dismissSuggestion(item.name);
    }
    deleteMutation.mutate(
      typeof itemOrId === "string" ? itemOrId : itemOrId.id,
    );
  };
  const handleLongPress = (item: ListItem) => {
    setActionItem(item);
    setShowActionDrawer(true);
  };

  const handleFixWithAI = async () => {
    if (!actionItem) return;
    setIsFixingWithAI(true);
    try {
      const { data: parsed } = await parseItemText(actionItem.name, listId);
      const existingNames = new Set(
        unchecked
          .filter((i) => i.id !== actionItem.id)
          .map((i) => i.name.toLowerCase()),
      );
      const nonDuplicates = (parsed as { name: string }[]).filter(
        (p) => !existingNames.has(p.name.toLowerCase()),
      );
      if (nonDuplicates.length === 0) {
        // All duplicates → hard delete
        await hardDeleteItem(actionItem.id);
        qc.setQueryData<ListItem[]>(["listItems", listId], (old = []) =>
          old.filter((i) => i.id !== actionItem.id),
        );
        qc.invalidateQueries({ queryKey: ["listItems", listId] });
        qc.invalidateQueries({ queryKey: ["deletedItems", listId] });
      } else {
        // Rename original to first non-duplicate, add the rest as new items
        await updateListItem(actionItem.id, { name: nonDuplicates[0].name });
        if (nonDuplicates.length > 1) {
          await Promise.all(
            nonDuplicates.slice(1).map((p) => addListItem(p.name, 1, listId)),
          );
        }
        qc.invalidateQueries({ queryKey: ["listItems", listId] });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert("Fix with AI failed", msg);
    } finally {
      setIsFixingWithAI(false);
      setShowActionDrawer(false);
      setActionItem(null);
    }
  };

  const handleSaveRename = () => {
    const name = editName.trim();
    if (!name || !editItem) return;
    if (name !== editItem.name)
      renameMutation.mutate({ id: editItem.id, name });
    setEditItem(null);
  };

  const handleReorder = ({ data }: { data: ListItem[] }) => {
    qc.setQueryData<ListItem[]>(["listItems", listId], (old = []) => [
      ...data,
      ...old.filter((i) => i.checked),
    ]);
    reorderListItems(
      data.map((item, index) => ({ id: item.id, sort_order: index + 1 })),
    ).catch(() => {
      qc.invalidateQueries({ queryKey: ["listItems", listId] });
    });
  };

  const handleCreateList = () => {
    if (!newListName.trim()) return;
    createListMutation.mutate(newListName.trim());
    setNewListName("");
  };

  const handleDeleteList = (list: ShoppingList) => {
    Alert.alert("Delete list", `Delete "${list.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deleteListMutation.mutate(list.id);
          const remaining = shoppingLists.filter((l) => l.id !== list.id);
          setCurrentList(remaining.length > 0 ? remaining[0] : null);
        },
      },
    ]);
  };

  const firstName = user?.name?.split(" ")[0] ?? "there";
  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good Evening";
  };

  const renderDraggableItem = ({
    item,
    drag,
    isActive,
  }: RenderItemParams<ListItem>) => (
    <ItemRow
      item={item}
      onToggle={() => {
        const next = item.checked === 0 ? 1 : 0;
        toggleMutation.mutate({ id: item.id, checked: next });
        // if marking done, temporarily dismiss so it won't reappear right away
        if (next === 1) {
          dismissSuggestion(item.name);
        }
      }}
      onDelete={() => handleDelete(item)}
      onLongPress={() => handleLongPress(item)}
      drag={drag}
      isActive={isActive}
    />
  );

  const handleSuggestionAdd = (name: string, type: string) =>
    type === "ai" ? handleAddSuggestion(name) : handleAddRecipeSuggestion(name);

  const refreshAISuggestions = () => {
    qc.invalidateQueries({ queryKey: ["suggestions", listId] });
    qc.invalidateQueries({ queryKey: ["recipeSuggestions", listId] });
  };

  const ListHeaderComponent = useCallback(
    () => (
      <>
        <SuggestionsStrip
          allSuggestions={allSuggestions}
          onAdd={handleSuggestionAdd}
          onDismiss={dismissSuggestion}
          onRefresh={refreshAISuggestions}
          isRefreshing={isRefreshing}
        />
        {unchecked.length > 0 && (
          <View
            style={{
              marginTop: 24,
              paddingHorizontal: 20,
              marginBottom: 10,
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
            }}
          >
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: "#F5C842",
              }}
            />
            <Text
              style={{
                fontSize: 12,
                fontWeight: "700",
                color: MUTED,
                letterSpacing: 0.8,
              }}
            >
              IN THIS LIST {/*({unchecked.length})*/}
            </Text>
          </View>
        )}
      </>
    ),
    [allSuggestions, unchecked.length],
  );

  const ListFooterComponent = useCallback(
    () => (
      <ListFooter
        checked={checked}
        items={items}
        isLoading={isLoading}
        onToggle={(id) => toggleMutation.mutate({ id, checked: 0 })}
        onDelete={handleDelete}
        onLongPress={handleLongPress}
      />
    ),
    [checked, items, isLoading],
  );

  const scrollContextValue = React.useMemo(
    () => ({ dragDirection, setDragDirection }),
    [dragDirection, setDragDirection],
  );

  return (
    <View style={{ flex: 1, backgroundColor: "#0D4F5C" }}>
      <ListHeader
        shoppingLists={shoppingLists}
        currentList={currentList}
        refetchLists={refetchLists}
        onOpenListModal={() => setShowListModal(true)}
        onOpenSettings={() => setShowSettings(true)}
        firstName={firstName}
        getGreeting={getGreeting}
        unchecked={unchecked}
        suggestions={suggestions}
        allSuggestions={allSuggestions}
        inputText={inputText}
        setInputText={setInputText}
        onSubmit={handleAdd}
        onInterimTranscript={(text) => setInputText(text)}
        onFinalTranscript={(text) => {
          const t = text.trim();
          if (t) addMutation.mutate({ text: t });
          setInputText("");
        }}
        addIsPending={addMutation.isPending}
        onLayout={setHeaderHeight}
        inputRef={inputRef}
      />
      <DeletedItemsDropdown
        dropdownVisible={dropdownVisible}
        onDismiss={() => setDropdownDismissed(true)}
        headerHeight={headerHeight}
        slideAnim={slideAnim}
        deletedMatches={deletedMatches}
        onSelectItem={(name) => {
          addMutation.mutate({ text: name });
          setInputText("");
        }}
      />
      <View style={{ flex: 1, backgroundColor: BG }}>
        <ScrollInfoContext.Provider value={scrollContextValue}>
          {shoppingLists.length === 0 ? (
            <NoListsEmptyState
              onCreateList={(name) => createListMutation.mutate(name)}
              isPending={createListMutation.isPending}
              newListName={newListName}
              onChangeName={setNewListName}
            />
          ) : (
            <View style={{ flex: 1 }}>
              <DraggableFlatList
                data={unchecked}
                keyExtractor={(item) => item.id}
                renderItem={renderDraggableItem}
                onDragEnd={handleReorder}
                renderPlaceholder={() => <DragPlaceholder />}
                refreshControl={
                  <RefreshControl
                    refreshing={isLoading}
                    onRefresh={refetch}
                    tintColor={TEAL}
                  />
                }
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 32 }}
                containerStyle={{ flex: 1 }}
                ListHeaderComponent={ListHeaderComponent}
                ListFooterComponent={ListFooterComponent}
              />
            </View>
          )}
        </ScrollInfoContext.Provider>
      </View>
      <ItemActionDrawer
        visible={showActionDrawer}
        item={actionItem}
        isFixing={isFixingWithAI}
        onClose={() => {
          setShowActionDrawer(false);
          setActionItem(null);
        }}
        onEditItem={() => {
          setShowActionDrawer(false);
          if (actionItem) {
            setEditItem(actionItem);
            setEditName(actionItem.name);
          }
        }}
        onFixWithAI={handleFixWithAI}
      />
      <ModalStack
        editItem={editItem}
        editName={editName}
        setEditName={setEditName}
        onCancelEdit={() => setEditItem(null)}
        onSaveRename={handleSaveRename}
        showSettings={showSettings}
        onCloseSettings={() => setShowSettings(false)}
        aiEnabled={aiEnabled}
        setAiEnabled={setAiEnabled}
        pairingEnabled={pairingEnabled}
        setPairingEnabled={setPairingEnabled}
        showListModal={showListModal}
        onCloseListModal={() => setShowListModal(false)}
        shoppingLists={shoppingLists}
        currentList={currentList}
        onSelectList={(list) => setCurrentList(list)}
        onDeleteList={handleDeleteList}
        onEditList={(list) => {
          setEditList(list);
          setEditListName(list.name);
        }}
        createIsPending={createListMutation.isPending}
        newListName={newListName}
        setNewListName={setNewListName}
        onCreateList={handleCreateList}
        editList={editList}
        editListName={editListName}
        setEditListName={setEditListName}
        onCancelEditList={() => setEditList(null)}
        onSaveListName={() => {
          const name = editListName.trim();
          if (name && editList && name !== editList.name)
            renameListMutation.mutate({ id: editList.id, name });
          setEditList(null);
        }}
      />
    </View>
  );
}
