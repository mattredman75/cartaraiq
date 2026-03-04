import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../lib/constants";

interface PINEntryProps {
  onComplete: (pin: string) => void;
  onCancel?: () => void;
  title?: string;
  subtitle?: string;
  maxLength?: number;
}

export function PINEntry({
  onComplete,
  onCancel,
  title = "Enter PIN",
  subtitle = "Enter your 4-digit PIN",
  maxLength = 4,
}: PINEntryProps) {
  const [pin, setPin] = useState("");

  const handleNumberPress = useCallback(
    (num: string) => {
      if (pin.length < maxLength) {
        const newPin = pin + num;
        setPin(newPin);

        // Auto-submit when PIN is complete
        if (newPin.length === maxLength) {
          setTimeout(() => onComplete(newPin), 100);
        }
      }
    },
    [pin, maxLength, onComplete],
  );

  const handleBackspace = useCallback(() => {
    setPin(pin.slice(0, -1));
  }, [pin]);

  const numbers = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["*", "0", "#"],
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        {onCancel && (
          <TouchableOpacity onPress={onCancel} style={styles.cancelButton}>
            <Ionicons name="close" size={24} color={COLORS.ink} />
          </TouchableOpacity>
        )}
        <View style={styles.headerContent}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
      </View>

      {/* PIN Display */}
      <View style={styles.pinDisplay}>
        {Array.from({ length: maxLength }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.pinDot,
              {
                backgroundColor: i < pin.length ? COLORS.teal : COLORS.surface,
                borderColor: i < pin.length ? COLORS.teal : COLORS.muted,
              },
            ]}
          />
        ))}
      </View>

      {/* Keypad */}
      <View style={styles.keypad}>
        {numbers.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.row}>
            {row.map((num) => (
              <TouchableOpacity
                key={num}
                onPress={() => handleNumberPress(num)}
                disabled={num === "*" || num === "#"}
                style={[
                  styles.key,
                  (num === "*" || num === "#") && styles.keyDisabled,
                ]}
              >
                <Text
                  style={[
                    styles.keyText,
                    (num === "*" || num === "#") && styles.keyDisabledText,
                  ]}
                >
                  {num}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}

        {/* Backspace button */}
        <TouchableOpacity
          onPress={handleBackspace}
          style={styles.backspaceButton}
          disabled={pin.length === 0}
        >
          <Ionicons
            name="backspace"
            size={20}
            color={pin.length === 0 ? COLORS.muted : COLORS.ink}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  cancelButton: {
    marginRight: 16,
  },
  headerContent: {
    flex: 1,
  },
  title: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 24,
    color: COLORS.ink,
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 14,
    color: COLORS.muted,
  },
  pinDisplay: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 60,
    gap: 12,
  },
  pinDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  keypad: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  key: {
    width: Dimensions.get("window").width / 4 - 15,
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: COLORS.card,
    justifyContent: "center",
    alignItems: "center",
  },
  keyDisabled: {
    backgroundColor: COLORS.surface,
  },
  keyText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 20,
    color: COLORS.ink,
  },
  keyDisabledText: {
    color: COLORS.muted,
  },
  backspaceButton: {
    alignSelf: "center",
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.card,
    justifyContent: "center",
    alignItems: "center",
  },
});
