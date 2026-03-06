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

const { width } = Dimensions.get("window");
const KEYPAD_PADDING = 70;
const KEY_SIZE = (width - KEYPAD_PADDING * 2 - 40) / 3; // 3 cols, 70px side padding, 2×12px gaps

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
  subtitle = "This keeps your account secure.",
  maxLength = 4,
}: PINEntryProps) {
  const [pin, setPin] = useState("");

  const handlePress = useCallback(
    (num: string) => {
      if (pin.length < maxLength) {
        const next = pin + num;
        setPin(next);
        if (next.length === maxLength) {
          setTimeout(() => {
            setPin("");
            onComplete(next);
          }, 120);
        }
      }
    },
    [pin, maxLength, onComplete],
  );

  const handleBackspace = useCallback(() => {
    setPin((p) => p.slice(0, -1));
  }, []);

  const rows = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
  ];

  return (
    <View style={styles.container}>
      {/* Back button — outside the padded content so it sits near the screen edge */}
      {onCancel && (
        <TouchableOpacity onPress={onCancel} style={styles.backButton}>
          <Ionicons name="chevron-back" size={30} color={COLORS.tealDark} />
        </TouchableOpacity>
      )}

      {/* Centered content with keypad padding */}
      <View style={styles.content}>
        {/* Lock icon */}
        <View style={styles.iconWrapper}>
          <Ionicons name="lock-closed" size={36} color={COLORS.ink} />
        </View>

        {/* Title */}
        <Text style={styles.title}>{title}</Text>

        {/* Dots */}
        <View style={styles.dotsRow}>
          {Array.from({ length: maxLength }).map((_, i) => (
            <View key={i} style={[styles.dot, i < pin.length && styles.dotFilled]} />
          ))}
        </View>

        {/* Keypad */}
        <View style={styles.keypad}>
        {rows.map((row, ri) => (
          <View key={ri} style={styles.row}>
            {row.map((n) => (
              <TouchableOpacity
                key={n}
                onPress={() => handlePress(n)}
                activeOpacity={0.7}
                style={styles.key}
              >
                <Text style={styles.keyText}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}

        {/* Bottom row: empty | 0 | backspace */}
        <View style={styles.row}>
          <View style={[styles.key, styles.keyInvisible]} />
          <TouchableOpacity
            onPress={() => handlePress("0")}
            activeOpacity={0.7}
            style={styles.key}
          >
            <Text style={styles.keyText}>0</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleBackspace}
            activeOpacity={0.7}
            disabled={pin.length === 0}
            style={[styles.key, styles.keyInvisible]}
          >
            <Ionicons
              name="backspace-outline"
              size={24}
              color={pin.length === 0 ? COLORS.muted : COLORS.ink}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Subtitle */}
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
    paddingTop: 16,
    paddingBottom: 24,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  content: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: KEYPAD_PADDING,
  },
  backText: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 15,
    color: COLORS.ink,
  },
  iconWrapper: {
    marginTop: 12,
    marginBottom: 20,
  },
  title: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 20,
    color: COLORS.teal,
    textAlign: "center",
    marginBottom: 28,
  },
  dotsRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 40,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: COLORS.ink,
    backgroundColor: "transparent",
  },
  dotFilled: {
    backgroundColor: COLORS.ink,
  },
  keypad: {
    width: "100%",
    gap: 20,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  key: {
    width: KEY_SIZE,
    height: KEY_SIZE,
    borderRadius: KEY_SIZE / 2,
    borderWidth: 1.5,
    borderColor: COLORS.teal,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  keyInvisible: {
    borderColor: "transparent",
  },
  keyText: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 22,
    color: COLORS.ink,
  },
  subtitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: COLORS.muted,
    textAlign: "center",
    marginTop: 24,
  },
});
