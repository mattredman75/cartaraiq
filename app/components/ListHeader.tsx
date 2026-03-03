import React from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ListItem, ShoppingList } from "../lib/types";
import { VoiceAddButton } from "./VoiceAddButton";

const TEAL = "#1B6B7A";
const TEAL_DARK = "#0D4F5C";
const TEXT = "#1A1A2E";
const MUTED = "#64748B";

const SCREEN_WIDTH = Dimensions.get("window").width;

interface ListHeaderProps {
  shoppingLists: ShoppingList[];
  currentList: ShoppingList | null;
  refetchLists: () => void;
  onOpenListModal: () => void;
  onOpenSettings: () => void;
  firstName: string;
  getGreeting: () => string;
  unchecked: ListItem[];
  suggestions: { name: string; reason: string }[];
  allSuggestions: { name: string; reason: string; _type: string }[];
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
  shoppingLists,
  currentList,
  refetchLists,
  onOpenListModal,
  onOpenSettings,
  firstName,
  getGreeting,
  unchecked,
  suggestions,
  allSuggestions,
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

      {/* Top row: list switcher + settings gear */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 5,
        }}
      >
        {shoppingLists.length > 0 ? (
          <TouchableOpacity
            onPress={() => {
              refetchLists();
              onOpenListModal();
            }}
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
          onPress={onOpenSettings}
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
      {/*<Text
        style={{
          color: "rgba(255,255,255,0.6)",
          fontSize: 14,
          marginBottom: 2,
        }}
      >
        {getGreeting()},
      </Text>*/}
      <Text
        style={{
          color: "#fff",
          fontSize: 24,
          fontWeight: "700",
          marginBottom: 6,
        }}
      >
        {getGreeting()}, {firstName}
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
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: "#F5C842",
              }}
            />
            <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 13 }}>
              {unchecked.length} item{unchecked.length !== 1 ? "s" : ""} in this
              list
            </Text>
          </View>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
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
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: "#00C2CB",
              }}
            />
            <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 13 }}>
              {allSuggestions.length} AI suggestions
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
          onSubmitEditing={onSubmit}
          placeholder="Add to this list"
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
