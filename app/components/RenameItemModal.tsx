import React from "react";
import {
  Modal,
  KeyboardAvoidingView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Platform,
} from "react-native";
import type { ListItem } from "../lib/types";

const TEAL = "#1B6B7A";
const CARD = "#FFFFFF";
const TEXT = "#1A1A2E";
const MUTED = "#64748B";
const BORDER = "#E8EFF2";
const SCREEN_WIDTH = Dimensions.get("window").width;

const shadow = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.07,
  shadowRadius: 8,
  elevation: 3,
};

const UNIT_CHIPS = [
  "each",
  "g",
  "kg",
  "oz",
  "lb",
  "ml",
  "L",
  "tsp",
  "tbsp",
  "cup",
  "can",
  "bunch",
  "pack",
];

interface RenameItemModalProps {
  editItem: ListItem | null;
  editName: string;
  setEditName: (v: string) => void;
  editQuantity: number;
  setEditQuantity: (v: number) => void;
  editUnit: string;
  setEditUnit: (v: string) => void;
  onCancel: () => void;
  onSave: () => void;
}

export function RenameItemModal({
  editItem,
  editName,
  setEditName,
  editQuantity,
  setEditQuantity,
  editUnit,
  setEditUnit,
  onCancel,
  onSave,
}: RenameItemModalProps) {
  const isChipSelected = (chip: string) =>
    editUnit === chip;

  const handleChipPress = (chip: string) => {
    setEditUnit(editUnit === chip ? "" : chip);
  };

  const isCustomUnit =
    editUnit !== "" && !UNIT_CHIPS.includes(editUnit);

  return (
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
          onPress={onCancel}
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
            Edit item
          </Text>
          <TextInput
            value={editName}
            onChangeText={setEditName}
            autoFocus
            onSubmitEditing={onSave}
            returnKeyType="done"
            style={{
              borderWidth: 1.5,
              borderColor: TEAL,
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 12,
              fontSize: 15,
              color: TEXT,
              marginBottom: 12,
            }}
          />

          {/* Quantity row */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 12,
              gap: 10,
            }}
          >
            <Text
              style={{ fontSize: 13, fontWeight: "600", color: MUTED, width: 30 }}
            >
              Qty
            </Text>
            <TextInput
              value={String(editQuantity)}
              onChangeText={(v) => {
                const n = parseInt(v, 10);
                if (!isNaN(n) && n > 0) setEditQuantity(n);
                else if (v === "") setEditQuantity(1);
              }}
              keyboardType="numeric"
              style={{
                borderWidth: 1.5,
                borderColor: BORDER,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 8,
                fontSize: 15,
                color: TEXT,
                width: 70,
              }}
            />
          </View>

          {/* Unit chips */}
          <Text
            style={{
              fontSize: 13,
              fontWeight: "600",
              color: MUTED,
              marginBottom: 8,
            }}
          >
            Unit
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 12 }}
            contentContainerStyle={{ gap: 6 }}
          >
            {UNIT_CHIPS.map((chip) => (
              <TouchableOpacity
                key={chip}
                onPress={() => handleChipPress(chip)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 20,
                  backgroundColor: isChipSelected(chip) ? TEAL : BORDER,
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color: isChipSelected(chip) ? "#fff" : MUTED,
                  }}
                >
                  {chip}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Custom unit fallback */}
          <TextInput
            value={isCustomUnit ? editUnit : ""}
            onChangeText={(v) => setEditUnit(v)}
            placeholder="Custom unit…"
            placeholderTextColor={MUTED}
            style={{
              borderWidth: 1,
              borderColor: BORDER,
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 8,
              fontSize: 13,
              color: TEXT,
              marginBottom: 16,
            }}
          />

          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity
              onPress={onCancel}
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
              onPress={onSave}
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
  );
}
