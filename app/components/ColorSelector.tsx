import React from "react";
import { View, ScrollView, TouchableOpacity, FlatList } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface ColorSelectorProps {
  selectedColor: string;
  onColorSelect: (color: string) => void;
}

const COLORS = [
  "#FF6B6B", // Red
  "#FF8C42", // Orange
  "#FFD93D", // Yellow
  "#6BCB77", // Green
  "#4D96FF", // Blue
  "#9D84B7", // Purple
  "#FF006E", // Pink
  "#FB5607", // Dark Orange
  "#3A86FF", // Bright Blue
  "#06D6A0", // Teal
  "#118AB2", // Dark Blue
  "#073B4C", // Navy
];

export function ColorSelector({ selectedColor, onColorSelect }: ColorSelectorProps) {
  return (
    <FlatList
      data={COLORS}
      numColumns={4}
      keyExtractor={(item) => item}
      scrollEnabled={false}
      columnWrapperStyle={{ gap: 12, marginBottom: 12 }}
      renderItem={({ item: color }) => (
        <TouchableOpacity
          onPress={() => onColorSelect(color)}
          style={{
            flex: 1,
            aspectRatio: 1,
            borderRadius: 12,
            backgroundColor: color,
            borderWidth: selectedColor === color ? 3 : 0,
            borderColor: "#000",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          {selectedColor === color && (
            <Ionicons name="checkmark" size={28} color="#fff" />
          )}
        </TouchableOpacity>
      )}
    />
  );
}
