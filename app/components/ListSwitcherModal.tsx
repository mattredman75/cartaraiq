import React from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  ActivityIndicator,
  Dimensions,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SwipeableListItem } from "./SwipeableListItem";
import type { ShoppingList } from "../lib/types";

const TEAL = "#1B6B7A";
const CARD = "#FFFFFF";
const TEXT = "#1A1A2E";
const MUTED = "#64748B";
const BORDER = "#E8EFF2";
const BG = "#DDE4E7";

interface ListSwitcherModalProps {
  visible: boolean;
  onClose: () => void;
  shoppingLists: ShoppingList[];
  currentList: ShoppingList | null;
  onSelect: (list: ShoppingList) => void;
  onDelete: (list: ShoppingList) => void;
  onEditList: (list: ShoppingList) => void;
  createIsPending: boolean;
  newListName: string;
  setNewListName: (v: string) => void;
  onCreateList: () => void;
}

export function ListSwitcherModal({
  visible,
  onClose,
  shoppingLists,
  currentList,
  onSelect,
  onDelete,
  onEditList,
  createIsPending,
  newListName,
  setNewListName,
  onCreateList,
}: ListSwitcherModalProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide">
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
          onPress={onClose}
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
                    onSelect(list);
                    onClose();
                  }}
                  onDelete={() => onDelete(list)}
                  onEdit={
                    !list.owner_name
                      ? () => {
                          onClose();
                          setTimeout(() => {
                            onEditList(list);
                          }, 320);
                        }
                      : undefined
                  }
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
              onSubmitEditing={onCreateList}
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
              onPress={onCreateList}
              style={{
                backgroundColor: TEAL,
                borderRadius: 12,
                paddingHorizontal: 20,
                justifyContent: "center",
              }}
            >
              {createIsPending ? (
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
  );
}
