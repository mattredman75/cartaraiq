import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { LoyaltyProgram } from "../lib/loyaltyPrograms";

interface ProgramPickerModalProps {
  visible: boolean;
  programs: LoyaltyProgram[];
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
  programs,
  onSelect,
  onSkip,
  onClose,
}: ProgramPickerModalProps) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return programs;
    return programs.filter((p) =>
      p.name.toLowerCase().includes(q)
    );
  }, [query, programs]);

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
      {item.logo_url ? (
        <Image
          source={{ uri: item.logo_url }}
          style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: item.logo_background ?? "#F0F4F5" }}
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
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }}>
          <TouchableOpacity activeOpacity={1} style={{ flex: 1 }} onPress={onClose} />
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
                  None of these
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
                <View style={{ paddingVertical: 40, alignItems: "center", paddingHorizontal: 24 }}>
                  <Ionicons name="search-outline" size={36} color={MUTED} />
                  <Text style={{ color: TEXT, fontSize: 15, fontWeight: "600", marginTop: 12, textAlign: "center" }}>
                    No programs found
                  </Text>
                  <Text style={{ color: MUTED, fontSize: 13, marginTop: 6, textAlign: "center" }}>
                    "{query}" isn't in our list yet.
                  </Text>
                  <TouchableOpacity
                    onPress={() => { setQuery(""); onSkip(); }}
                    style={{
                      marginTop: 20,
                      backgroundColor: TEAL,
                      paddingVertical: 12,
                      paddingHorizontal: 28,
                      borderRadius: 10,
                    }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "600", fontSize: 15 }}>Save card manually</Text>
                  </TouchableOpacity>
                </View>
              }
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
