import React from "react";
import { View, Text, TouchableOpacity, Animated } from "react-native";
import type { ListItem } from "../lib/types";

const TEAL_DARK = "#0D4F5C";
const CARD = "#FFFFFF";
const TEXT = "#1A1A2E";
const BORDER = "#E8EFF2";

const SUGGEST_ITEM_H = 46;
const PANEL_OVERLAP = 14;
const MAX_PANEL_H = 5 * SUGGEST_ITEM_H + 8;

interface DeletedItemsDropdownProps {
  dropdownVisible: boolean;
  onDismiss: () => void;
  headerHeight: number;
  slideAnim: Animated.Value;
  deletedMatches: ListItem[];
  onSelectItem: (name: string) => void;
}

export function DeletedItemsDropdown({
  dropdownVisible,
  onDismiss,
  headerHeight,
  slideAnim,
  deletedMatches,
  onSelectItem,
}: DeletedItemsDropdownProps) {
  return (
    <>
      {dropdownVisible && (
        <TouchableOpacity
          activeOpacity={1}
          onPress={onDismiss}
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
              left: 30,
              right: 30,
              bottom: -10,
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
                onPress={() => onSelectItem(item.name)}
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
    </>
  );
}
