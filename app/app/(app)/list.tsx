import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Modal,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  ActivityIndicator,
  Animated,
  Dimensions,
  Switch,
} from "react-native";
import Constants from "expo-constants";
import DraggableFlatList, {
  RenderItemParams,
} from "react-native-draggable-flatlist";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getItem, setItem, deleteItem } from "../../lib/storage";
import { useAuthStore, useListStore } from "../../lib/store";
import {
  fetchListItems,
  fetchDeletedItems,
  addListItem,
  updateListItem,
  fetchSuggestions,
  fetchShoppingLists,
  createShoppingList,
  deleteShoppingList,
  renameShoppingList,
  reorderListItems,
} from "../../lib/api";
import type { ListItem, Suggestion, ShoppingList } from "../../lib/types";
import { ScrollInfoContext } from "../../components/ItemRow";
import { ItemRow } from "../../components/ItemRow";
import { DragPlaceholder } from "../../components/DragPlaceholder";
import { NoListsEmptyState } from "../../components/NoListsEmptyState";
import { SwipeableListItem } from "../../components/SwipeableListItem";
import { VoiceAddButton } from "../../components/VoiceAddButton";

const TEAL = "#1B6B7A";
const TEAL_DARK = "#0D4F5C";
const BG = "#F5F9FA";
const CARD = "#FFFFFF";
const TEXT = "#1A1A2E";
const MUTED = "#64748B";
const BORDER = "#E8EFF2";

const shadow = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.07,
  shadowRadius: 8,
  elevation: 3,
};

const SCREEN_WIDTH = Dimensions.get("window").width;
const DISMISS_DAYS = 7;

const SUGGEST_ITEM_H = 46;
const PANEL_OVERLAP = 14;
const MAX_PANEL_H = 5 * SUGGEST_ITEM_H + 8;

// ── AsyncStorage helpers for dismissed suggestions ──────────────────────────

async function getDismissed(userId: string): Promise<Record<string, number>> {
  try {
    const raw = await getItem(`dismissed_${userId}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function saveDismissed(userId: string, map: Record<string, number>) {
  try {
    await setItem(`dismissed_${userId}`, JSON.stringify(map));
  } catch {}
}

// ── Main Screen ──────────────────────────────────────────────────────────────

export default function ListScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();
  const { currentList, setCurrentList } = useListStore();
  const qc = useQueryClient();

  const [inputText, setInputText] = useState("");
  const [showListModal, setShowListModal] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(true);
  // Long-press-to-edit item state
  const [editItem, setEditItem] = useState<ListItem | null>(null);
  const [editName, setEditName] = useState("");
  // Long-press-to-edit list state
  const [editList, setEditList] = useState<ShoppingList | null>(null);
  const [editListName, setEditListName] = useState("");
  // Dismissed suggestions (loaded from AsyncStorage)
  const [dismissedUntil, setDismissedUntil] = useState<Record<string, number>>(
    {},
  );

  const inputRef = useRef<TextInput>(null);
  const listContainerRef = useRef<View>(null);
  const listContainerScreenYRef = useRef(0);

  // Scroll-fade gradient state
  const [listViewport, setListViewport] = useState(0);
  const [listContent, setListContent] = useState(0);
  const [listScroll, setListScroll] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gradientOpacity = useRef(new Animated.Value(0)).current;
  const [dragDirection, setDragDirection] = useState<"up" | "down">("down");
  const [headerHeight, setHeaderHeight] = useState(0);
  const [dropdownDismissed, setDropdownDismissed] = useState(false);
  const slideAnim = useRef(
    new Animated.Value(-(MAX_PANEL_H + PANEL_OVERLAP)),
  ).current;

  useEffect(() => {
    const hasOverflow = listContent > listViewport + listScroll + 20;
    Animated.timing(gradientOpacity, {
      toValue: hasOverflow ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [listContent, listViewport, listScroll]);

  // Load persisted AI toggle
  useEffect(() => {
    getItem("ai_suggestions_enabled").then((val) => {
      if (val === "0") setAiEnabled(false);
    });
  }, []);

  // Load dismissed suggestions on mount
  useEffect(() => {
    if (user?.id) {
      getDismissed(user.id).then((map) => {
        const now = Date.now();
        const pruned = Object.fromEntries(
          Object.entries(map).filter(([, until]) => until > now),
        );
        setDismissedUntil(pruned);
        saveDismissed(user.id, pruned);
      });
    }
  }, [user?.id]);

  const { data: shoppingLists = [] as ShoppingList[] } = useQuery<
    ShoppingList[]
  >({
    queryKey: ["shoppingLists"],
    queryFn: () => fetchShoppingLists().then((r) => r.data),
  });

  useEffect(() => {
    if (!currentList && shoppingLists.length > 0)
      setCurrentList(shoppingLists[0]);
  }, [shoppingLists, currentList]);

  const listId = currentList?.id;

  const {
    data: items = [],
    isLoading,
    refetch,
  } = useQuery<ListItem[]>({
    queryKey: ["listItems", listId],
    queryFn: () => fetchListItems(listId).then((r) => r.data),
    enabled: !!listId,
  });

  const { data: rawSuggestions = [] } = useQuery<Suggestion[]>({
    queryKey: ["suggestions", listId],
    queryFn: () => fetchSuggestions(listId).then((r) => r.data),
    enabled: !!listId && aiEnabled,
    staleTime: 1000 * 60 * 5,
  });

  const { data: deletedItems = [] } = useQuery<ListItem[]>({
    queryKey: ["deletedItems", listId],
    queryFn: () => fetchDeletedItems(listId).then((r) => r.data),
    enabled: !!listId,
    staleTime: 1000 * 60,
  });

  // Filter out dismissed suggestions
  const suggestions = aiEnabled
    ? rawSuggestions.filter(
        (s) => !(dismissedUntil[s.name] && dismissedUntil[s.name] > Date.now()),
      )
    : [];

  const addMutation = useMutation({
    mutationFn: ({ name, qty }: { name: string; qty: number }) =>
      addListItem(name, qty, listId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["listItems", listId] });
      qc.invalidateQueries({ queryKey: ["deletedItems", listId] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, checked }: { id: string; checked: number }) =>
      updateListItem(id, { checked }),
    onMutate: ({ id, checked }) => {
      qc.setQueryData<ListItem[]>(["listItems", listId], (old = []) =>
        old.map((it) => (it.id === id ? { ...it, checked } : it)),
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["listItems", listId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => updateListItem(id, { checked: 2 }),
    onMutate: (id) => {
      qc.setQueryData<ListItem[]>(["listItems", listId], (old = []) =>
        old.filter((it) => it.id !== id),
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["listItems", listId] });
      qc.invalidateQueries({ queryKey: ["deletedItems", listId] });
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      updateListItem(id, { name }),
    onMutate: ({ id, name }) => {
      qc.setQueryData<ListItem[]>(["listItems", listId], (old = []) =>
        old.map((it) => (it.id === id ? { ...it, name } : it)),
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["listItems", listId] }),
  });

  const createListMutation = useMutation({
    mutationFn: (name: string) => createShoppingList(name),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["shoppingLists"] });
      setCurrentList(res.data);
      setNewListName("");
    },
  });

  const deleteListMutation = useMutation({
    mutationFn: (id: string) => deleteShoppingList(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shoppingLists"] }),
  });

  const renameListMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      renameShoppingList(id, name),
    onMutate: ({ id, name }) => {
      qc.setQueryData<ShoppingList[]>(["shoppingLists"], (old = []) =>
        old.map((l) => (l.id === id ? { ...l, name } : l)),
      );
      if (currentList?.id === id) setCurrentList({ ...currentList, name });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["shoppingLists"] }),
  });

  const handleAdd = useCallback(() => {
    const name = inputText.trim();
    if (!name) return;
    addMutation.mutate({ name, qty: 1 });
    setInputText("");
  }, [inputText]);

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
    const isVisible = dropdownVisible;
    if (isVisible === wasVisibleRef.current) return;
    wasVisibleRef.current = isVisible;
    Animated.spring(slideAnim, {
      toValue: isVisible ? 0 : -(MAX_PANEL_H + PANEL_OVERLAP),
      useNativeDriver: true,
      damping: 22,
      stiffness: 220,
      mass: 0.7,
    }).start();
  }, [dropdownVisible]);

  const handleAddSuggestion = (name: string) => {
    addMutation.mutate({ name, qty: 1 });
    qc.setQueryData<Suggestion[]>(["suggestions", listId], (old = []) =>
      old.filter((s) => s.name !== name),
    );
    qc.invalidateQueries({ queryKey: ["suggestions", listId] });
  };

  const handleDismissSuggestion = async (name: string) => {
    const until = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000;
    const updated = { ...dismissedUntil, [name]: until };
    setDismissedUntil(updated);
    if (user?.id) saveDismissed(user.id, updated);
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  const handleLongPress = (item: ListItem) => {
    setEditItem(item);
    setEditName(item.name);
  };

  const handleSaveRename = () => {
    const name = editName.trim();
    if (!name || !editItem) return;
    if (name !== editItem.name) {
      renameMutation.mutate({ id: editItem.id, name });
    }
    setEditItem(null);
  };

  const handleReorder = ({ data }: { data: ListItem[] }) => {
    qc.setQueryData<ListItem[]>(["listItems", listId], (old = []) => {
      const checkedItems = old.filter((i) => i.checked);
      return [...data, ...checkedItems];
    });
    const reorderPayload = data.map((item, index) => ({
      id: item.id,
      sort_order: index + 1,
    }));
    reorderListItems(reorderPayload).catch(() => {
      qc.invalidateQueries({ queryKey: ["listItems", listId] });
    });
  };

  const handleCreateList = () => {
    if (!newListName.trim()) return;
    createListMutation.mutate(newListName.trim());
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
          if (remaining.length > 0) setCurrentList(remaining[0]);
          else setCurrentList(null);
        },
      },
    ]);
  };

  const unchecked = React.useMemo(
    () => items.filter((i) => i.checked === 0),
    [items],
  );
  const checked = React.useMemo(
    () => items.filter((i) => i.checked === 1),
    [items],
  );
  const firstName = user?.name?.split(" ")[0] ?? "there";

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  const renderDraggableItem = ({
    item,
    drag,
    isActive,
  }: RenderItemParams<ListItem>) => (
    <ItemRow
      item={item}
      onToggle={() =>
        toggleMutation.mutate({
          id: item.id,
          checked: item.checked === 0 ? 1 : 0,
        })
      }
      onDelete={() => handleDelete(item.id)}
      onLongPress={() => handleLongPress(item)}
      drag={drag}
      isActive={isActive}
    />
  );

  const listFooterComponent = React.useCallback(
    () => (
      <>
        {checked.length > 0 && (
          <View style={{ marginTop: 24 }}>
            <Text
              style={{
                fontSize: 12,
                fontWeight: "700",
                color: MUTED,
                marginBottom: 10,
                letterSpacing: 0.8,
                paddingHorizontal: 20,
              }}
            >
              DONE ({checked.length})
            </Text>
            <View style={{ gap: 8 }}>
              {checked.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  onToggle={() =>
                    toggleMutation.mutate({ id: item.id, checked: 0 })
                  }
                  onDelete={() => handleDelete(item.id)}
                  onLongPress={() => handleLongPress(item)}
                />
              ))}
            </View>
          </View>
        )}

        {items.length === 0 && isLoading && (
          <View style={{ alignItems: "center", marginTop: 60 }}>
            <ActivityIndicator size="large" color={TEAL} />
          </View>
        )}

        {items.length === 0 && !isLoading && (
          <View style={{ alignItems: "center", marginTop: 60 }}>
            <Text style={{ fontSize: 52, marginBottom: 14 }}>🛒</Text>
            <Text
              style={{
                fontSize: 18,
                fontWeight: "700",
                color: TEXT,
                marginBottom: 6,
              }}
            >
              Your list is empty
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: MUTED,
                textAlign: "center",
                paddingHorizontal: 40,
              }}
            >
              Add items above or pick from AI suggestions
            </Text>
          </View>
        )}
      </>
    ),
    [checked, items.length, isLoading],
  );

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Header with curved bottom + decorative circles */}
      <View
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
        style={{
          zIndex: 3,
          backgroundColor: TEAL_DARK,
          paddingTop: insets.top,
          paddingHorizontal: 20,
          paddingBottom: 28,
          borderBottomLeftRadius: 32,
          borderBottomRightRadius: 32,
          overflow: "hidden",
        }}
      >
        {/* Decorative background circles */}
        <View
          style={{
            position: "absolute",
            top: -50,
            right: -30,
            width: 180,
            height: 180,
            borderRadius: 90,
            backgroundColor: "rgba(255,255,255,0.05)",
          }}
        />
        <View
          style={{
            position: "absolute",
            top: 10,
            right: 40,
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: "rgba(0,194,203,0.12)",
          }}
        />
        <View
          style={{
            position: "absolute",
            bottom: -40,
            left: -40,
            width: 150,
            height: 150,
            borderRadius: 75,
            backgroundColor: "rgba(255,255,255,0.04)",
          }}
        />

        {/* Top row: list switcher + hamburger */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 18,
          }}
        >
          {shoppingLists.length > 0 ? (
            <TouchableOpacity
              onPress={() => setShowListModal(true)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                maxWidth: SCREEN_WIDTH * 0.55,
              }}
            >
              <View
                style={{
                  backgroundColor: "rgba(255,255,255,0.15)",
                  borderRadius: 10,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: "600",
                    flexShrink: 1,
                  }}
                >
                  {currentList?.name ?? "My List"}
                </Text>
                <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: 11 }}>
                  ▾
                </Text>
              </View>
            </TouchableOpacity>
          ) : (
            <View />
          )}
          <TouchableOpacity
            onPress={() => setShowSettings(true)}
            style={{
              backgroundColor: "rgba(255,255,255,0.15)",
              borderRadius: 18,
              width: 36,
              height: 36,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 18, color: "#fff" }}>⚙</Text>
          </TouchableOpacity>
        </View>

        {/* Greeting */}
        <Text
          style={{
            color: "rgba(255,255,255,0.6)",
            fontSize: 14,
            marginBottom: 2,
          }}
        >
          {getGreeting()},
        </Text>
        <Text
          style={{
            color: "#fff",
            fontSize: 24,
            fontWeight: "700",
            marginBottom: 6,
          }}
        >
          {firstName}! 👋
        </Text>

        {/* Stats row */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 16,
            marginBottom: 20,
          }}
        >
          {unchecked.length > 0 ? (
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: "#F5C842",
                }}
              />
              <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 13 }}>
                {unchecked.length} item{unchecked.length !== 1 ? "s" : ""} in
                your list
              </Text>
            </View>
          ) : (
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: "#22C55E",
                }}
              />
              <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 13 }}>
                All done!
              </Text>
            </View>
          )}
          {suggestions.length > 0 && (
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: "#00C2CB",
                }}
              />
              <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 13 }}>
                {suggestions.length} AI suggestions
              </Text>
            </View>
          )}
        </View>

        {/* Search/add input */}
        <View
          style={{
            flexDirection: "row",
            backgroundColor: "#fff",
            borderRadius: 14,
            alignItems: "center",
          }}
        >
          <TextInput
            ref={inputRef}
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={handleAdd}
            placeholder="Add to your list…"
            placeholderTextColor={MUTED}
            returnKeyType="done"
            style={{
              flex: 1,
              paddingHorizontal: 16,
              paddingVertical: 14,
              fontSize: 15,
              color: TEXT,
            }}
          />
          {addMutation.isPending && (
            <ActivityIndicator
              size="small"
              color={TEAL}
              style={{ marginRight: 4 }}
            />
          )}
          <VoiceAddButton
            onPress={handleAdd}
            onInterimTranscript={(text) => setInputText(text)}
            onFinalTranscript={(text) => {
              const name = text.trim();
              if (name) addMutation.mutate({ name, qty: 1 });
              setInputText("");
            }}
          />
        </View>
      </View>

      {/* Deleted-item autosuggest — slides out from under the search box */}
      {dropdownVisible && (
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setDropdownDismissed(true)}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1,
          }}
        />
      )}
      {headerHeight > 0 && (
        <Animated.View
          pointerEvents={dropdownVisible ? "auto" : "none"}
          style={{
            position: "absolute",
            top: headerHeight - PANEL_OVERLAP,
            left: 0,
            right: 0,
            zIndex: 2,
            transform: [{ translateY: slideAnim }],
          }}
        >
          {/* Teal backing — fills full outer width and extends 20px below the white card */}
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              left: 20,
              right: 20,
              bottom: -20,
              backgroundColor: TEAL_DARK,
              borderBottomLeftRadius: 24,
              borderBottomRightRadius: 24,
            }}
          />

          {/* White dropdown card — 20px inset from each edge */}
          <View
            style={{
              marginHorizontal: 40,
              backgroundColor: CARD,
              borderBottomLeftRadius: 14,
              borderBottomRightRadius: 14,
              borderWidth: 1,
              borderTopWidth: 0,
              borderColor: BORDER,
              paddingTop: 15,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.08,
              shadowRadius: 8,
              elevation: 3,
            }}
          >
            {deletedMatches.map((item, idx) => (
              <TouchableOpacity
                key={item.id}
                onPress={() => {
                  addMutation.mutate({ name: item.name, qty: 1 });
                  setInputText("");
                }}
                style={{
                  paddingVertical: 13,
                  paddingHorizontal: 16,
                  minHeight: SUGGEST_ITEM_H,
                  justifyContent: "center",
                  borderBottomWidth: idx < deletedMatches.length - 1 ? 1 : 0,
                  borderBottomColor: BORDER,
                }}
              >
                <Text style={{ fontSize: 14, color: TEXT, fontWeight: "500" }}>
                  {item.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>
      )}

      <ScrollInfoContext.Provider
        value={React.useMemo(
          () => ({
            scrollOffset: listScroll,
            viewportHeight: listViewport,
            listContainerScreenY: listContainerScreenYRef.current,
            isScrolling,
            dragDirection,
            setDragDirection,
          }),
          [
            listScroll,
            listViewport,
            isScrolling,
            dragDirection,
            setDragDirection,
          ],
        )}
      >
        {shoppingLists.length === 0 ? (
          <NoListsEmptyState
            onCreateList={(name) => createListMutation.mutate(name)}
            isPending={createListMutation.isPending}
            newListName={newListName}
            onChangeName={setNewListName}
          />
        ) : (
          <View
            ref={listContainerRef}
            style={{ flex: 1 }}
            onLayout={() => {
              listContainerRef.current?.measureInWindow((_, y) => {
                listContainerScreenYRef.current = y;
              });
            }}
          >
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
              onContainerLayout={({ layout }) => setListViewport(layout.height)}
              onContentSizeChange={(_, h) => setListContent(h)}
              onScrollOffsetChange={(offset) => setListScroll(offset)}
              onScrollBeginDrag={() => setIsScrolling(true)}
              onScrollEndDrag={() => {
                scrollStopTimer.current = setTimeout(
                  () => setIsScrolling(false),
                  0,
                );
              }}
              onMomentumScrollBegin={() => {
                if (scrollStopTimer.current)
                  clearTimeout(scrollStopTimer.current);
              }}
              onMomentumScrollEnd={() => setIsScrolling(false)}
              ListHeaderComponent={() => (
                <>
                  {/* AI Suggestions */}
                  {suggestions.length > 0 && (
                    <View style={{ marginTop: 20 }}>
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "700",
                          color: MUTED,
                          marginBottom: 12,
                          paddingHorizontal: 20,
                          letterSpacing: 0.8,
                        }}
                      >
                        ✨ AI SUGGESTIONS
                      </Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{
                          paddingHorizontal: 20,
                          gap: 10,
                        }}
                      >
                        {suggestions.map((s, i) => (
                          <View
                            key={i}
                            style={{
                              backgroundColor: CARD,
                              borderRadius: 16,
                              padding: 14,
                              width: 148,
                              borderWidth: 1,
                              borderColor: BORDER,
                              ...shadow,
                            }}
                          >
                            <TouchableOpacity
                              onPress={() => handleDismissSuggestion(s.name)}
                              hitSlop={{ top: 8, right: 8, bottom: 4, left: 4 }}
                              style={{ position: "absolute", top: 8, right: 8 }}
                            >
                              <Text
                                style={{
                                  fontSize: 12,
                                  color: MUTED,
                                  fontWeight: "700",
                                }}
                              >
                                ✕
                              </Text>
                            </TouchableOpacity>
                            <Text
                              style={{
                                fontSize: 13,
                                fontWeight: "700",
                                color: TEXT,
                                marginBottom: 4,
                                paddingRight: 16,
                              }}
                            >
                              {s.name}
                            </Text>
                            <Text
                              style={{
                                fontSize: 11,
                                color: MUTED,
                                marginBottom: 10,
                                lineHeight: 15,
                              }}
                              numberOfLines={2}
                            >
                              {s.reason}
                            </Text>
                            <TouchableOpacity
                              onPress={() => handleAddSuggestion(s.name)}
                              style={{
                                backgroundColor: TEAL,
                                borderRadius: 8,
                                paddingVertical: 6,
                                alignItems: "center",
                              }}
                            >
                              <Text
                                style={{
                                  color: "#fff",
                                  fontSize: 12,
                                  fontWeight: "600",
                                }}
                              >
                                + Add
                              </Text>
                            </TouchableOpacity>
                          </View>
                        ))}
                      </ScrollView>
                    </View>
                  )}

                  {/* TO BUY label */}
                  {unchecked.length > 0 && (
                    <View
                      style={{
                        marginTop: 24,
                        paddingHorizontal: 20,
                        marginBottom: 10,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "700",
                          color: MUTED,
                          letterSpacing: 0.8,
                        }}
                      >
                        TO BUY ({unchecked.length})
                      </Text>
                    </View>
                  )}
                </>
              )}
              ListFooterComponent={listFooterComponent}
            />
            {/* Fade-out at bottom */}
            <Animated.View
              pointerEvents="none"
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: 180,
                opacity: gradientOpacity,
              }}
            >
              {Array.from({ length: 16 }, (_, i) => {
                const t = i / 15;
                const opacity = Math.pow(t, 1.6) * 0.97;
                return (
                  <View
                    key={i}
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      bottom: (1 - t) * 180,
                      height: 180 / 15 + 1,
                      backgroundColor: `rgba(245,249,250,${opacity.toFixed(3)})`,
                    }}
                  />
                );
              })}
            </Animated.View>
          </View>
        )}
      </ScrollInfoContext.Provider>

      {/* ── Rename Item Modal ───────────────────────────────────────────── */}
      <Modal visible={!!editItem} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
          <TouchableOpacity
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.5)",
            }}
            activeOpacity={1}
            onPress={() => setEditItem(null)}
          />
          <View
            style={{
              backgroundColor: CARD,
              borderRadius: 20,
              padding: 24,
              width: SCREEN_WIDTH - 48,
              ...shadow,
            }}
          >
            <Text
              style={{
                fontSize: 17,
                fontWeight: "700",
                color: TEXT,
                marginBottom: 16,
              }}
            >
              Rename item
            </Text>
            <TextInput
              value={editName}
              onChangeText={setEditName}
              autoFocus
              onSubmitEditing={handleSaveRename}
              returnKeyType="done"
              style={{
                borderWidth: 1.5,
                borderColor: TEAL,
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontSize: 15,
                color: TEXT,
                marginBottom: 16,
              }}
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                onPress={() => setEditItem(null)}
                style={{
                  flex: 1,
                  paddingVertical: 13,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: BORDER,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: MUTED, fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveRename}
                style={{
                  flex: 1,
                  paddingVertical: 13,
                  borderRadius: 12,
                  backgroundColor: TEAL,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Settings Popup ────────────────────────────────────────────── */}
      <Modal visible={showSettings} transparent animationType="fade">
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={1}
          onPress={() => setShowSettings(false)}
        >
          <View
            style={{
              position: "absolute",
              top: insets.top + 56,
              right: 16,
              width: 260,
              backgroundColor: "#fff",
              borderRadius: 16,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.18,
              shadowRadius: 16,
              elevation: 12,
              overflow: "hidden",
            }}
          >
            {/* User info */}
            <View
              style={{
                padding: 16,
                borderBottomWidth: 1,
                borderBottomColor: BORDER,
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: TEAL_DARK,
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 8,
                }}
              >
                <Text
                  style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}
                >
                  {user?.name?.charAt(0).toUpperCase() ?? "?"}
                </Text>
              </View>
              <Text style={{ fontSize: 15, fontWeight: "700", color: TEXT }}>
                {user?.name ?? "User"}
              </Text>
              <Text style={{ fontSize: 12, color: MUTED, marginTop: 1 }}>
                {user?.email ?? ""}
              </Text>
            </View>

            {/* AI suggestions toggle */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderBottomWidth: 1,
                borderBottomColor: BORDER,
              }}
            >
              <Text style={{ fontSize: 14, color: TEXT, fontWeight: "500" }}>
                AI Suggestions
              </Text>
              <Switch
                value={aiEnabled}
                onValueChange={(val) => {
                  setAiEnabled(val);
                  setItem("ai_suggestions_enabled", val ? "1" : "0");
                }}
                trackColor={{ false: BORDER, true: TEAL }}
                thumbColor="#fff"
              />
            </View>

            {/* Version */}
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: BORDER,
              }}
            >
              <Text style={{ fontSize: 12, color: MUTED }}>
                Version {Constants.expoConfig?.version ?? "1.0.0"}
              </Text>
            </View>

            {/* Sign out */}
            <TouchableOpacity
              onPress={async () => {
                setShowSettings(false);
                await deleteItem("auth_token");
                await deleteItem("auth_user");
                clearAuth();
                router.replace("/(auth)/welcome" as any);
              }}
              style={{ paddingHorizontal: 16, paddingVertical: 14 }}
            >
              <Text
                style={{ fontSize: 14, color: "#EF4444", fontWeight: "600" }}
              >
                Sign out
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── List Switcher Modal ────────────────────────────────────────── */}
      <Modal visible={showListModal} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <TouchableOpacity
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.4)",
            }}
            activeOpacity={1}
            onPress={() => setShowListModal(false)}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{
              backgroundColor: CARD,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
            }}
          >
            <View
              style={{
                width: 36,
                height: 4,
                backgroundColor: BORDER,
                borderRadius: 2,
                alignSelf: "center",
                marginBottom: 20,
              }}
            />
            <Text
              style={{
                fontSize: 18,
                fontWeight: "700",
                color: TEXT,
                marginBottom: 16,
              }}
            >
              My Lists
            </Text>

            <ScrollView
              style={{ maxHeight: Dimensions.get("window").height * 0.35 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={{ marginBottom: 20 }}>
                {shoppingLists.map((list) => (
                  <SwipeableListItem
                    key={list.id}
                    list={list}
                    isSelected={currentList?.id === list.id}
                    canDelete={shoppingLists.length > 1}
                    onSelect={() => {
                      setCurrentList(list);
                      setShowListModal(false);
                    }}
                    onDelete={() => handleDeleteList(list)}
                    onEdit={() => {
                      setShowListModal(false);
                      setTimeout(() => {
                        setEditList(list);
                        setEditListName(list.name);
                      }, 320);
                    }}
                  />
                ))}
              </View>
            </ScrollView>

            <View
              style={{
                flexDirection: "row",
                gap: 10,
                marginTop: 16,
                borderTopWidth: 1,
                borderTopColor: BORDER,
                paddingTop: 16,
              }}
            >
              <TextInput
                value={newListName}
                onChangeText={setNewListName}
                onSubmitEditing={handleCreateList}
                placeholder="New list name…"
                placeholderTextColor={MUTED}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: BORDER,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 15,
                  color: TEXT,
                  backgroundColor: BG,
                }}
              />
              <TouchableOpacity
                onPress={handleCreateList}
                style={{
                  backgroundColor: TEAL,
                  borderRadius: 12,
                  paddingHorizontal: 20,
                  justifyContent: "center",
                }}
              >
                {createListMutation.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text
                    style={{ color: "#fff", fontWeight: "700", fontSize: 18 }}
                  >
                    +
                  </Text>
                )}
              </TouchableOpacity>
            </View>
            <View style={{ height: insets.bottom + 4 }} />
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── Edit List Name Modal ───────────────────────────────────────── */}
      <Modal visible={!!editList} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
          <TouchableOpacity
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.5)",
            }}
            activeOpacity={1}
            onPress={() => setEditList(null)}
          />
          <View
            style={{
              backgroundColor: CARD,
              borderRadius: 20,
              padding: 24,
              width: SCREEN_WIDTH - 48,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.12,
              shadowRadius: 16,
              elevation: 8,
            }}
          >
            <Text
              style={{
                fontSize: 17,
                fontWeight: "700",
                color: TEXT,
                marginBottom: 16,
              }}
            >
              Rename list
            </Text>
            <TextInput
              value={editListName}
              onChangeText={setEditListName}
              autoFocus
              onSubmitEditing={() => {
                const name = editListName.trim();
                if (name && editList && name !== editList.name)
                  renameListMutation.mutate({ id: editList.id, name });
                setEditList(null);
              }}
              returnKeyType="done"
              style={{
                borderWidth: 1.5,
                borderColor: TEAL,
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontSize: 15,
                color: TEXT,
                marginBottom: 16,
              }}
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                onPress={() => setEditList(null)}
                style={{
                  flex: 1,
                  paddingVertical: 13,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: BORDER,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: MUTED, fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  const name = editListName.trim();
                  if (name && editList && name !== editList.name)
                    renameListMutation.mutate({ id: editList.id, name });
                  setEditList(null);
                }}
                style={{
                  flex: 1,
                  paddingVertical: 13,
                  borderRadius: 12,
                  backgroundColor: TEAL,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
