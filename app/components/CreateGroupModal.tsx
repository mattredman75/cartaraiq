import React, { useState, useRef, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const TEAL = "#1B6B7A";
const TEAL_LIGHT = "#4FB8C8";

interface Props {
  visible: boolean;
  item1Name: string;
  item2Name?: string;
  onConfirm: (groupName: string) => void;
  onCancel: () => void;
}

export function CreateGroupModal({
  visible,
  item1Name,
  item2Name,
  onConfirm,
  onCancel,
}: Props) {
  const [name, setName] = useState("");
  const inputRef = useRef<TextInput>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible) {
      setName("");
      setTimeout(() => inputRef.current?.focus(), 300);
      // Pulse the teal ring
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.08,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
        { iterations: 3 },
      ).start();
    }
  }, [visible]);

  const handleConfirm = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onCancel}
        />
        <View style={styles.sheet}>
          {/* Icon */}
          <Animated.View
            style={[styles.iconRing, { transform: [{ scale: pulseAnim }] }]}
          >
            <Ionicons name="folder-open-outline" size={26} color="#fff" />
          </Animated.View>

          <Text style={styles.title}>Create new group?</Text>
          <Text style={styles.subtitle}>
            {item2Name ? (
              <>
                Grouping <Text style={styles.itemName}>{item1Name}</Text>
                {" & "}
                <Text style={styles.itemName}>{item2Name}</Text>
              </>
            ) : (
              <>
                Creating a group for{" "}
                <Text style={styles.itemName}>{item1Name}</Text>
              </>
            )}
          </Text>

          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder="Group name…"
            placeholderTextColor="#94A3B8"
            value={name}
            onChangeText={setName}
            onSubmitEditing={handleConfirm}
            returnKeyType="done"
            autoCapitalize="words"
            maxLength={60}
          />

          <View style={styles.buttons}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.confirmBtn,
                !name.trim() && styles.confirmDisabled,
              ]}
              onPress={handleConfirm}
              disabled={!name.trim()}
            >
              <Ionicons
                name="checkmark"
                size={16}
                color="#fff"
                style={{ marginRight: 5 }}
              />
              <Text style={styles.confirmText}>Create Group</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  sheet: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 10,
  },
  iconRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: TEAL_LIGHT,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: TEAL,
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: "#64748B",
    marginBottom: 20,
    textAlign: "center",
    lineHeight: 20,
  },
  itemName: {
    fontWeight: "700",
    color: "#334155",
  },
  input: {
    width: "100%",
    borderWidth: 1.5,
    borderColor: TEAL_LIGHT,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#1E293B",
    marginBottom: 20,
    backgroundColor: "#F8FAFC",
  },
  buttons: {
    flexDirection: "row",
    width: "100%",
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
  },
  cancelText: {
    fontSize: 15,
    color: "#64748B",
    fontWeight: "600",
  },
  confirmBtn: {
    flex: 2,
    backgroundColor: TEAL,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
  confirmDisabled: {
    opacity: 0.45,
  },
  confirmText: {
    fontSize: 15,
    color: "#fff",
    fontWeight: "700",
  },
});
