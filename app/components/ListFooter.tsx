import React from "react";
import {
  View,
  Text,
  Image,
  ActivityIndicator,
  Pressable,
  Alert,
} from "react-native";
import type { ListItem } from "../lib/types";
import { ItemRow } from "./ItemRow";

const TEAL = "#1B6B7A";
const TEXT = "#1A1A2E";
const MUTED = "rgb(100, 116, 139)";
const MUTED_SEMITRANSPARENT = "rgba(100, 116, 139, 0.5)";

interface ListFooterProps {
  checked: ListItem[];
  items: ListItem[];
  isLoading: boolean;
  isPullRefreshing?: boolean;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onLongPress: (item: ListItem) => void;
}

export const ListFooter = React.memo(function ListFooter({
  checked,
  items,
  isLoading,
  isPullRefreshing = false,
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

      {items.length === 0 && isLoading && !isPullRefreshing && (
        <View style={{ alignItems: "center", marginTop: 60 }}>
          <ActivityIndicator size="large" color={TEAL} />
        </View>
      )}

      {items.length === 0 && !isLoading && (
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <Image
            source={require("../assets/cartara_empty_fancy.png")}
            style={{
              width: 300,
              height: 300,
              marginBottom: -30,
              marginTop: -75,
              opacity: 0.75,
            }}
            resizeMode="contain"
          />
          <Text
            style={{
              fontSize: 24,
              fontWeight: "400",
              color: MUTED_SEMITRANSPARENT,
            }}
          >
            All done!
          </Text>
        </View>
      )}
    </>
  );
});
