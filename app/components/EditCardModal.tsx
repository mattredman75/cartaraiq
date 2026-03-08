import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ColorSelector } from "./ColorSelector";
import type { StoreCard } from "../lib/types";

interface EditCardModalProps {
  visible: boolean;
  card: StoreCard;
  onClose: () => void;
  onSave: (card: StoreCard) => void;
}

const TEAL = "#1B6B7A";
const TEXT = "#1A1A2E";
const MUTED = "#64748B";
const BORDER = "#E8EFF2";

export function EditCardModal({
  visible,
  card,
  onClose,
  onSave,
}: EditCardModalProps) {
  const insets = useSafeAreaInsets();
  const [cardName, setCardName] = useState(card.name);
  const [selectedColor, setSelectedColor] = useState(card.color);

  useEffect(() => {
    if (visible) {
      setCardName(card.name);
      setSelectedColor(card.color);
    }
  }, [visible, card]);

  const handleSave = () => {
    if (!cardName.trim()) {
      return;
    }

    onSave({
      ...card,
      name: cardName.trim(),
      color: selectedColor,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View style={{ flex: 1, justifyContent: "flex-end" }}>
            <ScrollView
              style={{
                backgroundColor: "#fff",
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
              }}
              contentContainerStyle={{
                padding: 20,
                paddingBottom: 20 + insets.bottom,
              }}
            >
              <TouchableOpacity
                onPress={onClose}
                style={{ marginBottom: 16 }}
              >
                <Ionicons name="arrow-back" size={24} color={TEXT} />
              </TouchableOpacity>

              <Text style={{ fontSize: 20, fontWeight: "700", color: TEXT, marginBottom: 8 }}>
                Edit Card
              </Text>
              <Text style={{ fontSize: 14, color: MUTED, marginBottom: 24 }}>
                Update your card's name and color
              </Text>

              {/* Card Name */}
              <Text style={{ fontSize: 13, fontWeight: "600", color: TEXT, marginBottom: 8 }}>
                Card Name
              </Text>
              <TextInput
                value={cardName}
                onChangeText={setCardName}
                placeholderTextColor={MUTED}
                style={{
                  borderWidth: 1,
                  borderColor: BORDER,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  fontSize: 16,
                  marginBottom: 24,
                }}
              />

              {/* Color Selection */}
              <Text style={{ fontSize: 13, fontWeight: "600", color: TEXT, marginBottom: 12 }}>
                Card Color
              </Text>
              <ColorSelector
                selectedColor={selectedColor}
                onColorSelect={setSelectedColor}
              />

              {/* Action Buttons */}
              <View style={{ gap: 12, marginTop: 24 }}>
                <TouchableOpacity
                  onPress={handleSave}
                  style={{
                    backgroundColor: TEAL,
                    paddingVertical: 14,
                    borderRadius: 8,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>
                    Save Changes
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={onClose}
                  style={{
                    borderWidth: 2,
                    borderColor: BORDER,
                    paddingVertical: 12,
                    borderRadius: 8,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: TEXT, fontWeight: "600", fontSize: 16 }}>
                    Cancel
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
