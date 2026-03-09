import React from "react";
import {
  View,
  Text,
  TextInput,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ListItem, ShoppingList } from "../lib/types";
import { VoiceAddButton } from "./VoiceAddButton";

const TEAL = "#1B6B7A";
const TEAL_DARK = "#0D4F5C";
const TEXT = "#1A1A2E";
const MUTED = "#64748B";

interface ListHeaderProps {
  currentList: ShoppingList | null;
  refetchLists: () => void;
  onOpenListModal: () => void;
  unchecked: ListItem[];
  checked: ListItem[];
  inputText: string;
  setInputText: (v: string) => void;
  onSubmit: () => void;
  onInterimTranscript: (text: string) => void;
  onFinalTranscript: (text: string) => void;
  addIsPending: boolean;
  onLayout: (height: number) => void;
  inputRef: React.RefObject<TextInput | null>;
}

export function ListHeader({
  currentList,
  refetchLists,
  onOpenListModal,
  unchecked,
  checked,
  inputText,
  setInputText,
  onSubmit,
  onInterimTranscript,
  onFinalTranscript,
  addIsPending,
  onLayout,
  inputRef,
}: ListHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      onLayout={(e) => onLayout(e.nativeEvent.layout.height)}
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

      {/* Stats row: item count + list icon */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <View style={{ flex: 1, marginRight: 12 }}>
          {unchecked.length > 0 ? (
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={{ color: "rgba(255,255,255,0.75)", fontSize: 13 }}
            >
              {checked.length}/{checked.length + unchecked.length} items in{" "}
              {currentList?.name ?? "My List"}
            </Text>
          ) : (
            <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 13 }}>
              All done!
            </Text>
          )}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {/* Shared indicator */}
          {(currentList?.is_shared || (currentList?.share_count ?? 0) > 0) && (
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
            >
              <Ionicons
                name="people-outline"
                size={16}
                color="rgba(255,255,255,0.85)"
              />
              {(currentList?.share_count ?? 0) > 0 && (
                <Text
                  style={{
                    color: "rgba(255,255,255,0.85)",
                    fontSize: 12,
                    fontWeight: "600",
                  }}
                >
                  {currentList!.share_count}
                </Text>
              )}
            </View>
          )}
          <TouchableOpacity
            onPress={() => {
              refetchLists();
              onOpenListModal();
            }}
            style={{ padding: 4 }}
            accessibilityLabel="Switch list"
            testID="list-icon-button"
          >
            <Ionicons name="list" size={22} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
        </View>
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
          onSubmitEditing={onSubmit}
          placeholder={`Add items to ${currentList?.name ?? "this list"}`}
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
        {addIsPending && (
          <ActivityIndicator
            size="small"
            color={TEAL}
            style={{ marginRight: 4 }}
          />
        )}
        <VoiceAddButton
          onPress={onSubmit}
          onInterimTranscript={onInterimTranscript}
          onFinalTranscript={onFinalTranscript}
        />
      </View>
    </View>
  );
}
