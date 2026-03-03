import React from "react";
import { View, Text, ActivityIndicator, Pressable, Alert } from "react-native";
import type { ListItem } from "../lib/types";
import { ItemRow } from "./ItemRow";

const TEAL = "#1B6B7A";
const TEXT = "#1A1A2E";
const MUTED = "#64748B";

interface ListFooterProps {
  checked: ListItem[];
  items: ListItem[];
  isLoading: boolean;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onLongPress: (item: ListItem) => void;
}

export function ListFooter({
  checked,
  items,
  isLoading,
  onToggle,
  onDelete,
  onLongPress,
}: ListFooterProps) {
  return (
    <>
      {checked.length > 0 && (
        <View style={{ marginTop: 24 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
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
              DONE {/*({checked.length})*/}
            </Text>
            <Pressable
              onPress={() =>
                Alert.alert(
                  "Clear done items",
                  "Are you sure you want to clear all done items?",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Confirm",
                      style: "destructive",
                      onPress: () => {
                        checked.forEach((item) => onDelete(item.id));
                      },
                    },
                  ],
                )
              }
              android_ripple={{ color: "#eee" }}
            >
              <Text style={{ fontSize: 12, fontWeight: "700", color: TEAL }}>
                CLEAR ALL
              </Text>
            </Pressable>
          </View>
          <View>
            {checked.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                onToggle={() => onToggle(item.id)}
                onDelete={() => onDelete(item.id)}
                onLongPress={() => onLongPress(item)}
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
  );
}
