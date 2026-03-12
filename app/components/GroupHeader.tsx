import React, { useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ItemGroup } from "../lib/types";

const TEAL = "#1B6B7A";
const TEAL_LIGHT = "#4FB8C8";
const BG_HEADER = "#C8D4D8";

interface Props {
  group: ItemGroup;
  itemCount: number;
  drag: () => void;
  isActive: boolean;
  onRename: (group: ItemGroup) => void;
  onDissolve: (group: ItemGroup) => void;
}

export function GroupHeader({
  group,
  itemCount,
  drag,
  isActive,
  onRename,
  onDissolve,
}: Props) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handleDrag = () => {
    Animated.spring(scaleAnim, {
      toValue: 1.02,
      useNativeDriver: true,
      speed: 40,
      bounciness: 4,
    }).start();
    drag();
  };

  const handleRelease = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 40,
      bounciness: 4,
    }).start();
  };

  return (
    <Animated.View
      style={[
        styles.container,
        isActive && styles.containerActive,
        { transform: [{ scale: scaleAnim }] },
      ]}
    >
      {/* Drag handle */}
      <TouchableOpacity
        onPressIn={handleDrag}
        onPressOut={handleRelease}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={styles.dragHandle}
      >
        <Ionicons name="reorder-three-outline" size={20} color={TEAL} />
      </TouchableOpacity>

      {/* Group name */}
      <View style={styles.nameRow}>
        <Text style={styles.groupName} numberOfLines={1}>
          {group.name}{" "}
          <Text style={styles.itemCount}>
            ({itemCount} {itemCount === 1 ? "item" : "items"})
          </Text>
        </Text>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          onPress={() => onRename(group)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.actionBtn}
        >
          <Ionicons name="create-outline" size={16} color={TEAL} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => onDissolve(group)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.actionBtn}
        >
          <Ionicons name="close-circle-outline" size={17} color={TEAL} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: BG_HEADER,
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 1,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    minHeight: 42,
    paddingVertical: 10,
    paddingHorizontal: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 3,
  },
  containerActive: {
    opacity: 0.9,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 7,
    elevation: 6,
  },
  dragHandle: {
    marginRight: 8,
    padding: 2,
  },
  nameRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  groupName: {
    fontSize: 13,
    fontWeight: "700",
    color: TEAL,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    flex: 1,
  },
  itemCount: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "400",
    textTransform: "none",
    letterSpacing: 0,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
  },
  actionBtn: {
    marginLeft: 12,
    padding: 2,
  },
});
