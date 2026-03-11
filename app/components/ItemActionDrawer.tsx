import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { ListItem, ItemGroup } from "../lib/types";

const TEAL = "#1B6B7A";
const CARD = "#FFFFFF";
const TEXT = "#1A1A2E";
const MUTED = "#64748B";
const BORDER = "#E8EFF2";

interface ItemActionDrawerProps {
  visible: boolean;
  item: ListItem | null;
  isFixing: boolean;
  groups?: ItemGroup[];
  onClose: () => void;
  onEditItem: () => void;
  onFixWithAI: () => void;
  onCreateGroup?: () => void;
  onAddToGroup?: (groupId: string, groupName: string) => void;
  onRemoveFromGroup?: () => void;
}

export function ItemActionDrawer({
  visible,
  item,
  isFixing,
  groups = [],
  onClose,
  onEditItem,
  onFixWithAI,
  onCreateGroup,
  onAddToGroup,
  onRemoveFromGroup,
}: ItemActionDrawerProps) {
  const insets = useSafeAreaInsets();
  const [showGroupPicker, setShowGroupPicker] = React.useState(false);

  React.useEffect(() => {
    if (!visible) setShowGroupPicker(false);
  }, [visible]);

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

          {/* Group actions */}
          {item?.group_id ? (
            // Item is already in a group → offer to remove
            onRemoveFromGroup && (
              <TouchableOpacity
                onPress={() => {
                  onClose();
                  onRemoveFromGroup();
                }}
                style={{
                  borderWidth: 1,
                  borderColor: BORDER,
                  borderRadius: 14,
                  paddingVertical: 16,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 12,
                  gap: 8,
                }}
              >
                <Ionicons name="folder-open-outline" size={16} color={MUTED} />
                <Text style={{ fontSize: 16, fontWeight: "600", color: MUTED }}>
                  Remove from group
                </Text>
              </TouchableOpacity>
            )
          ) : (
            <>
              {/* Add to existing group */}
              {groups.length > 0 && onAddToGroup && (
                <>
                  <TouchableOpacity
                    onPress={() => setShowGroupPicker((prev) => !prev)}
                    style={{
                      borderWidth: 1,
                      borderColor: BORDER,
                      borderRadius: 14,
                      paddingVertical: 16,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 12,
                      gap: 8,
                    }}
                  >
                    <Ionicons
                      name="folder-open-outline"
                      size={16}
                      color={TEAL}
                    />
                    <Text
                      style={{ fontSize: 16, fontWeight: "600", color: TEAL }}
                    >
                      Add to group
                    </Text>
                  </TouchableOpacity>

                  {showGroupPicker && (
                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: TEAL,
                        borderRadius: 14,
                        padding: 12,
                        marginBottom: 12,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "700",
                          color: TEAL,
                          marginBottom: 10,
                        }}
                      >
                        Choose a group
                      </Text>

                      <ScrollView
                        style={{ maxHeight: 220 }}
                        contentContainerStyle={{ gap: 8 }}
                        showsVerticalScrollIndicator
                      >
                        {groups.map((g) => (
                          <TouchableOpacity
                            key={g.id}
                            onPress={() => {
                              setShowGroupPicker(false);
                              onClose();
                              onAddToGroup(g.id, g.name);
                            }}
                            style={{
                              backgroundColor: TEAL,
                              borderRadius: 10,
                              paddingVertical: 12,
                              paddingHorizontal: 12,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 15,
                                fontWeight: "600",
                                color: "#fff",
                              }}
                              numberOfLines={1}
                            >
                              {g.name}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>

                      <TouchableOpacity
                        onPress={() => setShowGroupPicker(false)}
                        style={{
                          marginTop: 10,
                          borderWidth: 1,
                          borderColor: "#EF4444",
                          backgroundColor: "#EF4444",
                          borderRadius: 10,
                          paddingVertical: 10,
                          alignItems: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: "600",
                            color: "#fff",
                          }}
                        >
                          Cancel
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              )}

              {/* Create new group */}
              {onCreateGroup && (
                <TouchableOpacity
                  onPress={() => {
                    onClose();
                    onCreateGroup();
                  }}
                  style={{
                    borderWidth: 1,
                    borderColor: BORDER,
                    borderRadius: 14,
                    paddingVertical: 16,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 12,
                    gap: 8,
                  }}
                >
                  <Ionicons name="folder-outline" size={16} color={TEAL} />
                  <Text
                    style={{ fontSize: 16, fontWeight: "600", color: TEAL }}
                  >
                    New group
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}

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
