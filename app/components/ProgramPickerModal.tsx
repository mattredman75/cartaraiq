import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  FlatList,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LOYALTY_PROGRAMS, type LoyaltyProgram } from "../lib/loyaltyPrograms";

interface ProgramPickerModalProps {
  visible: boolean;
  onSelect: (program: LoyaltyProgram) => void;
  onSkip: () => void;
  onClose: () => void;
}

const TEAL = "#1B6B7A";
const TEXT = "#1A1A2E";
const MUTED = "#64748B";
const BORDER = "#E8EFF2";
const BG = "#DDE4E7";

export function ProgramPickerModal({
  visible,
  onSelect,
  onSkip,
  onClose,
}: ProgramPickerModalProps) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return LOYALTY_PROGRAMS;
    return LOYALTY_PROGRAMS.filter((p) =>
      p.name.toLowerCase().includes(q)
    );
  }, [query]);

  const renderItem = ({ item }: { item: LoyaltyProgram }) => (
    <TouchableOpacity
      onPress={() => {
        setQuery("");
        onSelect(item);
      }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: BORDER,
        gap: 12,
      }}
    >
      {item.logo ? (
        <Image
          source={item.logo}
          style={{ width: 40, height: 40, borderRadius: 8 }}
          resizeMode="contain"
        />
      ) : (
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            backgroundColor: BG,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Ionicons name="card-outline" size={20} color={MUTED} />
        </View>
      )}
      <Text style={{ flex: 1, fontSize: 15, color: TEXT, fontWeight: "500" }}>
        {item.name}
      </Text>
      <Ionicons name="chevron-forward" size={16} color={MUTED} />
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }}>
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <View
            style={{
              backgroundColor: "#fff",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              maxHeight: "85%",
              paddingBottom: insets.bottom,
            }}
          >
            {/* Header */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 16,
                paddingTop: 20,
                paddingBottom: 12,
              }}
            >
              <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
                <Ionicons name="chevron-back" size={26} color={TEXT} />
              </TouchableOpacity>
              <Text
                style={{
                  flex: 1,
                  fontSize: 18,
                  fontWeight: "700",
                  color: TEXT,
                  textAlign: "center",
                }}
              >
                Select Program
              </Text>
              <TouchableOpacity onPress={onSkip} style={{ padding: 4 }}>
                <Text style={{ fontSize: 14, color: TEAL, fontWeight: "600" }}>
                  Skip
                </Text>
              </TouchableOpacity>
            </View>

            {/* Search bar */}
            <View
              style={{
                marginHorizontal: 16,
                marginBottom: 8,
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: BG,
                borderRadius: 10,
                paddingHorizontal: 10,
                paddingVertical: 8,
                gap: 8,
              }}
            >
              <Ionicons name="search" size={16} color={MUTED} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search programs…"
                placeholderTextColor={MUTED}
                style={{ flex: 1, fontSize: 15, color: TEXT }}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery("")}>
                  <Ionicons name="close-circle" size={16} color={MUTED} />
                </TouchableOpacity>
              )}
            </View>

            {/* Programs list */}
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View
                  style={{
                    paddingVertical: 40,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: MUTED, fontSize: 14 }}>
                    No programs found for "{query}"
                  </Text>
                </View>
              }
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
