import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ListItem } from "../lib/types";

const TEAL = "#1B6B7A";
const CARD = "#FFFFFF";
const TEXT = "#1A1A2E";
const MUTED = "#64748B";
const BORDER = "#E8EFF2";

interface ItemActionDrawerProps {
  visible: boolean;
  item: ListItem | null;
  isFixing: boolean;
  onClose: () => void;
  onEditItem: () => void;
  onFixWithAI: () => void;
}

export function ItemActionDrawer({
  visible,
  item,
  isFixing,
  onClose,
  onEditItem,
  onFixWithAI,
}: ItemActionDrawerProps) {
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
        <View
          style={{
            backgroundColor: CARD,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 24,
            paddingBottom: insets.bottom + 16,
          }}
        >
          {/* Drag handle */}
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

          {/* Item name */}
          {item && (
            <Text
              numberOfLines={1}
              style={{
                fontSize: 13,
                color: MUTED,
                marginBottom: 20,
                textAlign: "center",
              }}
            >
              {item.name}
            </Text>
          )}

          {/* Edit item */}
          <TouchableOpacity
            onPress={onEditItem}
            style={{
              borderWidth: 1,
              borderColor: BORDER,
              borderRadius: 14,
              paddingVertical: 16,
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "600", color: TEXT }}>
              Edit item
            </Text>
          </TouchableOpacity>

          {/* Fix with AI */}
          <TouchableOpacity
            onPress={onFixWithAI}
            disabled={isFixing}
            style={{
              backgroundColor: TEAL,
              borderRadius: 14,
              paddingVertical: 16,
              alignItems: "center",
              opacity: isFixing ? 0.7 : 1,
            }}
          >
            {isFixing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={{ fontSize: 16, fontWeight: "600", color: "#fff" }}>
                Fix with AI
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
