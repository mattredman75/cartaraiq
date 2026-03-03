import React from "react";
import {
  Modal,
  KeyboardAvoidingView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Dimensions,
  Platform,
} from "react-native";
import type { ShoppingList } from "../lib/types";

const TEAL = "#1B6B7A";
const CARD = "#FFFFFF";
const TEXT = "#1A1A2E";
const MUTED = "#64748B";
const BORDER = "#E8EFF2";
const SCREEN_WIDTH = Dimensions.get("window").width;

interface EditListNameModalProps {
  editList: ShoppingList | null;
  editListName: string;
  setEditListName: (v: string) => void;
  onCancel: () => void;
  onSave: () => void;
}

export function EditListNameModal({
  editList,
  editListName,
  setEditListName,
  onCancel,
  onSave,
}: EditListNameModalProps) {
  return (
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
          onPress={onCancel}
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
