import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useFocusEffect } from "expo-router";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getItem } from "../../lib/storage";
import { useAuthStore, useListStore } from "../../lib/store";
import {
  reorderListGrouped,
  parseItemText,
  hardDeleteItem,
  updateListItem,
  addListItem,
  fetchItemGroups,
  createItemGroup,
  deleteItemGroup,
  renameItemGroup,
  assignItemToGroup,
} from "../../lib/api";
import type { ListItem, ShoppingList, ItemGroup } from "../../lib/types";
import { ScrollInfoContext } from "../../components/ItemRow";
import { ItemRow } from "../../components/ItemRow";
import { GroupHeader } from "../../components/GroupHeader";
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
import { CreateGroupModal } from "../../components/CreateGroupModal";
import {
  syncListToWidget,
  syncAllListsToWidget,
} from "../../hooks/useWidgetSync";

const TEAL = "#1B6B7A";
const BG = "#DDE4E7";

const SUGGEST_ITEM_H = 46;
const PANEL_OVERLAP = 14;
const MAX_PANEL_H = 5 * SUGGEST_ITEM_H + 8;

// ── Flat list mixed-type entry ────────────────────────────────────────────────

type FlatEntry =
  | { type: "group"; id: string; group: ItemGroup; items: ListItem[] }
  | { type: "item"; id: string; item: ListItem };

function buildFlatData(
  unchecked: ListItem[],
  groups: ItemGroup[],
): FlatEntry[] {
  const groupIds = new Set(groups.map((g) => g.id));
  const itemsByGroup = new Map<string, ListItem[]>();
  const standalone: ListItem[] = [];

  for (const item of unchecked) {
    if (item.group_id && groupIds.has(item.group_id)) {
      // Only group items whose group is actually in the groups array
      const arr = itemsByGroup.get(item.group_id) ?? [];
      arr.push(item);
      itemsByGroup.set(item.group_id, arr);
    } else {
      // Standalone, or group not yet synced (race) → show as standalone
      standalone.push(item);
    }
  }

  for (const items of itemsByGroup.values()) {
    items.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }

  const blocks: { pos: number; entry: FlatEntry }[] = [];
  for (const item of standalone) {
    blocks.push({
      pos: item.sort_order ?? 0,
      entry: { type: "item", id: item.id, item },
    });
  }
  for (const group of groups) {
    const items = itemsByGroup.get(group.id) ?? [];
    if (items.length > 0) {
      blocks.push({
        pos: group.sort_order ?? 0,
        entry: { type: "group", id: `group:${group.id}`, group, items },
      });
    }
  }
  blocks.sort((a, b) => a.pos - b.pos);

  return blocks.map((b) => b.entry);
}

function deriveReorderPayload(newFlat: FlatEntry[]) {
  const items: { id: string; sort_order: number; group_id: string | null }[] =
    [];
  const groups: { id: string; sort_order: number }[] = [];

  let globalPos = 0;

  for (const entry of newFlat) {
    if (entry.type === "group") {
      groups.push({ id: entry.group.id, sort_order: globalPos });
      entry.items.forEach((item, index) => {
        items.push({
          id: item.id,
          sort_order: index,
          group_id: entry.group.id,
        });
      });
      globalPos++;
    } else {
      items.push({
        id: entry.item.id,
        sort_order: globalPos,
        group_id: null,
      });
      globalPos++;
    }
  }
  return { items, groups };
}

export default function ListScreen() {
  const { user } = useAuthStore();
  const { currentList, setCurrentList } = useListStore();
  const qc = useQueryClient();

  const [inputText, setInputText] = useState("");
  const [showListModal, setShowListModal] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [aiEnabled, setAiEnabled] = useState(true);
  const [pairingEnabled, setPairingEnabled] = useState(true);
  const [editItem, setEditItem] = useState<ListItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editQuantity, setEditQuantity] = useState<number>(1);
  const [editUnit, setEditUnit] = useState<string>("");
  const [editList, setEditList] = useState<ShoppingList | null>(null);
  const [editListName, setEditListName] = useState("");
  const [actionItem, setActionItem] = useState<ListItem | null>(null);
  const [showActionDrawer, setShowActionDrawer] = useState(false);
  const [isFixingWithAI, setIsFixingWithAI] = useState(false);

  // Group state
  const [pendingGroupItem, setPendingGroupItem] = useState<ListItem | null>(
    null,
  );

  const inputRef = useRef<TextInput>(null);

  const [dragDirection, setDragDirection] = useState<"up" | "down">("down");
  const [headerHeight, setHeaderHeight] = useState(0);
  const [dropdownDismissed, setDropdownDismissed] = useState(false);
  const slideAnim = useRef(
    new Animated.Value(-(MAX_PANEL_H + PANEL_OVERLAP)),
  ).current;

  // Re-read AI flags every time the screen comes into focus so changes
  // made on the Settings screen take effect immediately.
  useFocusEffect(
    useCallback(() => {
      getItem("ai_suggestions_enabled").then((val) =>
        setAiEnabled(val !== "0"),
      );
      getItem("pairing_suggestions_enabled").then((val) =>
        setPairingEnabled(val !== "0"),
      );
    }, []),
  );

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
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setIsPullRefreshing(true);
    await refetch();
    setIsPullRefreshing(false);
  }, [refetch]);

  const { data: groups = [] } = useQuery<ItemGroup[]>({
    queryKey: ["itemGroups", listId],
    queryFn: () => fetchItemGroups(listId!).then((r) => r.data),
    enabled: !!listId,
    // Keep previous group data while refetching to prevent grouped items
    // from briefly flashing as standalone during the listItems/itemGroups
    // dual-refetch race.
    placeholderData: (prev) => prev,
  });
  const flatData = useMemo(
    () => buildFlatData(unchecked, groups),
    [unchecked, groups],
  );

  useEffect(() => {
    if (!currentList && shoppingLists.length > 0)
      setCurrentList(shoppingLists[0]);
  }, [shoppingLists, currentList]);

  // Keep the iOS home-screen widget in sync with the current list
  useEffect(() => {
    if (currentList && !isLoading) {
      syncListToWidget(currentList, items);
    }
  }, [items, currentList, isLoading]);

  // Sync all lists (with current list's items) to the widget for the list picker
  useEffect(() => {
    if (shoppingLists.length > 0 && currentList && !isLoading) {
      syncAllListsToWidget(shoppingLists, currentList, items);
    }
  }, [shoppingLists, items, currentList, isLoading]);

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

    // Check if deleting this item is the last one in a group →
    // offer to dissolve the group
    if (item?.group_id) {
      const groupItems = unchecked.filter((i) => i.group_id === item!.group_id);
      if (groupItems.length === 1) {
        const groupName =
          groups.find((g) => g.id === item!.group_id)?.name ?? "Group";
        Alert.alert(
          "Remove group?",
          `"${groupName}" will be empty. Remove the group too?`,
          [
            {
              text: "Keep group",
              style: "cancel",
              onPress: () => deleteMutation.mutate(item!.id),
            },
            {
              text: "Remove group",
              style: "destructive",
              onPress: () => {
                deleteMutation.mutate(item!.id);
                deleteItemGroup(item!.group_id!).then(() => {
                  qc.invalidateQueries({
                    queryKey: ["itemGroups", listId],
                  });
                  qc.invalidateQueries({
                    queryKey: ["listItems", listId],
                  });
                });
              },
            },
          ],
        );
        return;
      }
    }

    deleteMutation.mutate(
      typeof itemOrId === "string" ? itemOrId : itemOrId.id,
    );
  };

  const handleLongPress = useCallback((item: ListItem) => {
    setActionItem(item);
    setShowActionDrawer(true);
  }, []);

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
    const nameChanged = name !== editItem.name;
    const qtyChanged = editQuantity !== (editItem.quantity ?? 1);
    const unitChanged = (editUnit || null) !== (editItem.unit ?? null);
    if (nameChanged || qtyChanged || unitChanged) {
      renameMutation.mutate({
        id: editItem.id,
        name,
        quantity: editQuantity,
        unit: editUnit || null,
      });
    }
    setEditItem(null);
  };

  const handleReorder = ({ data }: { data: FlatEntry[] }) => {
    const { items: itemsPayload, groups: groupsPayload } =
      deriveReorderPayload(data);
    // Optimistic update — items
    qc.setQueryData<ListItem[]>(["listItems", listId], (old = []) => {
      const updated = itemsPayload.reduce(
        (map, p) => {
          map[p.id] = p;
          return map;
        },
        {} as Record<
          string,
          { id: string; sort_order: number; group_id: string | null }
        >,
      );
      return old.map((i) =>
        updated[i.id]
          ? {
              ...i,
              sort_order: updated[i.id].sort_order,
              group_id: updated[i.id].group_id,
            }
          : i,
      );
    });
    // Optimistic update — group sort_orders (so group position snaps
    // immediately rather than reverting until the network round-trip)
    if (groupsPayload.length > 0) {
      qc.setQueryData<ItemGroup[]>(["itemGroups", listId], (old = []) => {
        const updatedGroups = groupsPayload.reduce(
          (map, g) => {
            map[g.id] = g.sort_order;
            return map;
          },
          {} as Record<string, number>,
        );
        return old.map((g) =>
          updatedGroups[g.id] !== undefined
            ? { ...g, sort_order: updatedGroups[g.id] }
            : g,
        );
      });
    }
    reorderListGrouped(listId!, itemsPayload, groupsPayload).catch(() => {
      qc.invalidateQueries({ queryKey: ["listItems", listId] });
      qc.invalidateQueries({ queryKey: ["itemGroups", listId] });
    });
  };

  const handleDragEnd = (params: { data: FlatEntry[] }) => {
    handleReorder(params);
  };

  const handleGroupItemsReorder = useCallback(
    (groupId: string, orderedItems: ListItem[]) => {
      if (!listId) return;

      const itemsPayload = orderedItems.map((item, index) => ({
        id: item.id,
        sort_order: index,
        group_id: groupId,
      }));

      qc.setQueryData<ListItem[]>(["listItems", listId], (old = []) => {
        const updated = itemsPayload.reduce(
          (map, payload) => {
            map[payload.id] = payload;
            return map;
          },
          {} as Record<
            string,
            { id: string; sort_order: number; group_id: string }
          >,
        );

        return old.map((item) =>
          updated[item.id]
            ? {
                ...item,
                sort_order: updated[item.id].sort_order,
                group_id: updated[item.id].group_id,
              }
            : item,
        );
      });

      reorderListGrouped(listId, itemsPayload, []).catch(() => {
        qc.invalidateQueries({ queryKey: ["listItems", listId] });
        qc.invalidateQueries({ queryKey: ["itemGroups", listId] });
      });
    },
    [listId, qc],
  );

  const handleConfirmCreateGroup = async (name: string) => {
    if (!pendingGroupItem || !listId) return;
    const item = pendingGroupItem;
    setPendingGroupItem(null);
    try {
      await createItemGroup(listId, name, [item.id]);
      await Promise.all([
        qc.refetchQueries({ queryKey: ["itemGroups", listId] }),
        qc.refetchQueries({ queryKey: ["listItems", listId] }),
      ]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert("Could not create group", msg);
    }
  };

  const handleAddToGroup = async (item: ListItem, groupId: string) => {
    try {
      await assignItemToGroup(item.id, groupId);
      await Promise.all([
        qc.refetchQueries({ queryKey: ["listItems", listId] }),
        qc.refetchQueries({ queryKey: ["itemGroups", listId] }),
      ]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert("Could not add to group", msg);
    }
  };

  const handleRemoveFromGroup = async (item: ListItem) => {
    try {
      await assignItemToGroup(item.id, null);
      await Promise.all([
        qc.refetchQueries({ queryKey: ["listItems", listId] }),
        qc.refetchQueries({ queryKey: ["itemGroups", listId] }),
      ]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert("Could not remove from group", msg);
    }
  };

  const handleDissolveGroup = (groupId: string) => {
    Alert.alert("Remove group", "Items will stay on the list.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove group",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteItemGroup(groupId);
            await Promise.all([
              qc.refetchQueries({ queryKey: ["itemGroups", listId] }),
              qc.refetchQueries({ queryKey: ["listItems", listId] }),
            ]);
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            Alert.alert("Error", msg);
          }
        },
      },
    ]);
  };

  const handleRenameGroup = (group: ItemGroup) => {
    Alert.prompt(
      "Rename group",
      undefined,
      async (newName) => {
        const trimmed = newName?.trim();
        if (!trimmed || trimmed === group.name) return;
        try {
          await renameItemGroup(group.id, trimmed);
          qc.invalidateQueries({ queryKey: ["itemGroups", listId] });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          Alert.alert("Error", msg);
        }
      },
      "plain-text",
      group.name,
    );
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

  const renderDraggableItem = useCallback(
    ({ item: entry, drag, isActive }: RenderItemParams<FlatEntry>) => {
      if (entry.type === "group") {
        return (
          <View>
            <GroupHeader
              group={entry.group}
              itemCount={entry.items.length}
              drag={drag}
              isActive={isActive}
              onRename={() => handleRenameGroup(entry.group)}
              onDissolve={() => handleDissolveGroup(entry.group.id)}
            />
            <DraggableFlatList
              data={entry.items}
              keyExtractor={(groupItem) => groupItem.id}
              scrollEnabled={false}
              onDragEnd={({ data }) =>
                handleGroupItemsReorder(entry.group.id, data)
              }
              activationDistance={6}
              renderItem={({
                item: groupItem,
                drag: groupDrag,
                isActive,
                getIndex,
              }) => (
                <ItemRow
                  item={groupItem}
                  onToggle={() => {
                    const next = groupItem.checked === 0 ? 1 : 0;
                    toggleMutation.mutate({ id: groupItem.id, checked: next });
                  }}
                  onDelete={() => handleDelete(groupItem)}
                  onLongPress={() => handleLongPress(groupItem)}
                  drag={groupDrag}
                  isActive={isActive}
                  inGroup
                  squareTopCorners={(getIndex?.() ?? 0) === 0}
                />
              )}
            />
          </View>
        );
      }
      const item = entry.item;
      const row = (
        <ItemRow
          item={item}
          onToggle={() => {
            const next = item.checked === 0 ? 1 : 0;
            toggleMutation.mutate({ id: item.id, checked: next });
          }}
          onDelete={() => handleDelete(item)}
          onLongPress={() => handleLongPress(item)}
          drag={drag}
          isActive={isActive}
        />
      );
      return row;
    },
    [
      toggleMutation.mutate,
      deleteMutation.mutate,
      handleLongPress,
      handleDelete,
      handleRenameGroup,
      handleDissolveGroup,
      handleGroupItemsReorder,
    ],
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
        <View style={{ height: 16 }} />
        {unchecked.length > 0 && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 20,
              marginBottom: 12,
            }}
          >
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: "#F5C842",
                marginRight: 5,
                flexShrink: 0,
              }}
            />
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={{
                flex: 1,
                color: "#64748B",
                fontSize: 13,
                fontWeight: "700",
                letterSpacing: 0.8,
                textTransform: "uppercase",
              }}
            >
              {currentList?.name ?? "THIS LIST"}
            </Text>
          </View>
        )}
      </>
    ),
    [allSuggestions, unchecked.length, currentList],
  );

  const ListFooterComponent = useCallback(
    () => (
      <ListFooter
        checked={checked}
        items={items}
        isLoading={isLoading}
        isPullRefreshing={isPullRefreshing}
        onToggle={(id) => toggleMutation.mutate({ id, checked: 0 })}
        onDelete={handleDelete}
        onLongPress={handleLongPress}
      />
    ),
    [checked, isLoading, isPullRefreshing],
  );

  const scrollContextValue = React.useMemo(
    () => ({ dragDirection, setDragDirection }),
    [dragDirection, setDragDirection],
  );

  return (
    <View style={{ flex: 1, backgroundColor: "#0D4F5C" }}>
      <ListHeader
        currentList={currentList}
        refetchLists={refetchLists}
        onOpenListModal={() => setShowListModal(true)}
        unchecked={unchecked}
        checked={checked}
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
                data={flatData}
                keyExtractor={(entry) => entry.id}
                extraData={flatData}
                renderItem={renderDraggableItem}
                onDragEnd={handleDragEnd}
                refreshControl={
                  <RefreshControl
                    refreshing={isPullRefreshing}
                    onRefresh={handleRefresh}
                    tintColor={TEAL}
                  />
                }
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{
                  paddingBottom: 32,
                  ...(items.length === 0 && !isLoading ? { flexGrow: 1 } : {}),
                }}
                containerStyle={{ flex: 1 }}
                ListHeaderComponent={ListHeaderComponent}
                ListFooterComponent={ListFooterComponent}
                ListFooterComponentStyle={
                  items.length === 0 && !isLoading ? { flex: 1 } : undefined
                }
                removeClippedSubviews={false}
                initialNumToRender={15}
                maxToRenderPerBatch={10}
                windowSize={5}
                updateCellsBatchingPeriod={50}
              />
            </View>
          )}
        </ScrollInfoContext.Provider>
      </View>
      <CreateGroupModal
        visible={!!pendingGroupItem}
        item1Name={pendingGroupItem?.name ?? ""}
        onConfirm={handleConfirmCreateGroup}
        onCancel={() => setPendingGroupItem(null)}
      />
      <ItemActionDrawer
        visible={showActionDrawer}
        item={actionItem}
        isFixing={isFixingWithAI}
        groups={groups.filter((g) => g.id !== actionItem?.group_id)}
        onClose={() => {
          setShowActionDrawer(false);
          setActionItem(null);
        }}
        onEditItem={() => {
          setShowActionDrawer(false);
          if (actionItem) {
            setEditItem(actionItem);
            setEditName(actionItem.name);
            setEditQuantity(actionItem.quantity ?? 1);
            setEditUnit(actionItem.unit ?? "");
          }
        }}
        onFixWithAI={handleFixWithAI}
        onCreateGroup={() => {
          setShowActionDrawer(false);
          if (actionItem) setPendingGroupItem(actionItem);
          setActionItem(null);
        }}
        onAddToGroup={(groupId) => {
          setShowActionDrawer(false);
          if (actionItem) handleAddToGroup(actionItem, groupId);
          setActionItem(null);
        }}
        onRemoveFromGroup={() => {
          setShowActionDrawer(false);
          if (actionItem) handleRemoveFromGroup(actionItem);
          setActionItem(null);
        }}
      />
      <ModalStack
        editItem={editItem}
        editName={editName}
        setEditName={setEditName}
        editQuantity={editQuantity}
        setEditQuantity={setEditQuantity}
        editUnit={editUnit}
        setEditUnit={setEditUnit}
        onCancelEdit={() => setEditItem(null)}
        onSaveRename={handleSaveRename}
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
